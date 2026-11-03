import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parse } from "../lib/validate.js";
import { notFound } from "../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../lib/pagination.js";
import { productInclude, serializeProduct } from "../lib/serialize.js";
import { recordAudit } from "../lib/audit.js";
import { sellerWithRelations, serializeSeller, getSeller } from "../services/sellers.js";
import { getSettings } from "../services/settings.js";
import { serializeListing, getListing } from "../services/rentals.js";

const storefrontQuerySchema = pageSchema.extend({
  q: z.string().trim().max(120).optional(),
  state: z.string().length(2).optional(),
});

const onboardingSchema = z.object({
  applicantName: z.string().min(2).max(120),
  applicantEmail: z.string().email(),
  proposedStoreName: z.string().min(2).max(120),
  proposedSlug: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  contactPhone: z.string().max(40).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(40).optional(),
  country: z.string().length(2).default("US"),
});

export async function sellerStorefrontRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/sellers",
    { schema: { tags: ["Sellers"], summary: "List active marketplace sellers" } },
    async (request, reply) => {
      const query = parse(storefrontQuerySchema, request.query);
      const { skip, take, page, pageSize } = pageArgs(query);
      const where: Record<string, unknown> = { status: "active", kycStatus: "approved" };
      if (query.q) {
        where.OR = [{ storeName: { contains: query.q } }, { description: { contains: query.q } }];
      }
      if (query.state) where.state = query.state.toUpperCase();
      const [total, sellers, settings] = await Promise.all([
        prisma.seller.count({ where: where as never }),
        prisma.seller.findMany({
          where: where as never,
          include: sellerWithRelations(),
          orderBy: [{ rating: "desc" }, { joinedAt: "desc" }],
          skip,
          take,
        }),
        getSettings(),
      ]);
      return reply.send(paginated(sellers.map((seller) => serializeSeller(seller, settings.marketplace.defaultCommissionBps)), total, page, pageSize));
    },
  );

  app.get(
    "/sellers/:slug",
    { schema: { tags: ["Sellers"], summary: "Seller storefront profile" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const seller = await getSeller(slug);
      if (seller.status !== "active" && seller.kycStatus !== "approved") throw notFound("Seller not found");
      const settings = await getSettings();
      return reply.send({ data: serializeSeller(seller, settings.marketplace.defaultCommissionBps) });
    },
  );

  app.get(
    "/sellers/:slug/products",
    { schema: { tags: ["Sellers"], summary: "Active products listed by a seller" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const query = parse(pageSchema.extend({ q: z.string().max(120).optional() }), request.query);
      const seller = await getSeller(slug);
      if (seller.status !== "active") throw notFound("Seller not found");
      const where: Record<string, unknown> = { sellerId: seller.id, status: "active" };
      if (query.q) where.OR = [{ title: { contains: query.q } }, { description: { contains: query.q } }];
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, products] = await Promise.all([
        prisma.product.count({ where: where as never }),
        prisma.product.findMany({ where: where as never, include: productInclude, orderBy: { createdAt: "desc" }, skip, take }),
      ]);
      return reply.send(paginated(products.map(serializeProduct), total, page, pageSize));
    },
  );

  app.get(
    "/sellers/:slug/rentals",
    { schema: { tags: ["Sellers"], summary: "Active rental listings owned by a seller" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const query = parse(pageSchema, request.query);
      const seller = await getSeller(slug);
      const { skip, take, page, pageSize } = pageArgs(query);
      const where = { sellerId: seller.id, status: "active" };
      const [total, listings] = await Promise.all([
        prisma.rentalListing.count({ where }),
        prisma.rentalListing.findMany({
          where,
          include: {
            owner: { select: { id: true, email: true, firstName: true, lastName: true } },
            seller: { select: { id: true, storeName: true, slug: true, status: true, kycStatus: true } },
            category: { select: { id: true, name: true, slug: true } },
            blackouts: { orderBy: { startDate: "asc" } },
            _count: { select: { bookings: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(listings.map((listing) => serializeListing(listing)), total, page, pageSize));
    },
  );

  app.post(
    "/sellers/onboarding",
    { schema: { tags: ["Sellers"], summary: "Apply to open a marketplace store" } },
    async (request, reply) => {
      const input = parse(onboardingSchema, request.body);
      const existing = await prisma.sellerOnboardingRequest.findFirst({
        where: { applicantEmail: input.applicantEmail, status: { in: ["pending", "info_requested"] } },
      });
      if (existing) {
        return reply.status(200).send({ data: { id: existing.id, status: existing.status, duplicate: true } });
      }
      const created = await prisma.sellerOnboardingRequest.create({ data: input });
      await recordAudit({
        actor: null,
        action: "seller.onboarding.submitted",
        entityType: "sellerOnboardingRequest",
        entityId: created.id,
        after: { applicantEmail: input.applicantEmail, proposedStoreName: input.proposedStoreName },
      });
      return reply.status(201).send({ data: created });
    },
  );
}

/** Public detail for a single rental listing, hiding non-active inventory. */
export async function publicRentalListing(idOrSlug: string) {
  const listing = await getListing(idOrSlug);
  if (listing.status !== "active") throw notFound("Rental listing not found");
  return listing;
}
