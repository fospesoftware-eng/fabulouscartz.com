import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { parse } from "../../lib/validate.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../../lib/pagination.js";
import { recordAudit } from "../../lib/audit.js";
import { slugify } from "../../lib/slug.js";
import { hashPassword } from "../../lib/auth.js";
import { SELLER_KYC_STATUSES, SELLER_STATUSES } from "../../lib/constants.js";
import { staffActor } from "./catalog.js";
import {
  getSeller,
  previewPayout,
  sellerWithRelations,
  serializeSeller,
} from "../../services/sellers.js";
import { getSettings } from "../../services/settings.js";
import { defaultRange, getSellerAnalytics } from "../../services/analytics.js";

const sellerCreateSchema = z.object({
  ownerId: z.string().min(1).optional(),
  ownerEmail: z.string().email().optional(),
  ownerName: z.string().max(120).optional(),
  storeName: z.string().min(2).max(120),
  slug: z.string().min(2).max(120).optional(),
  logoUrl: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(40).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(40).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().length(2).default("US"),
  vendorId: z.string().optional(),
  kycStatus: z.enum(SELLER_KYC_STATUSES).default("pending"),
  commissionRateBps: z.number().int().min(0).max(5000).nullable().optional(),
  payoutMethod: z.enum(["bank_transfer", "paypal", "stripe_connect"]).default("bank_transfer"),
  payoutDetailsMasked: z.string().max(120).optional(),
  payoutVerificationStatus: z.enum(["unverified", "pending", "verified", "failed"]).default("unverified"),
  status: z.enum(SELLER_STATUSES).default("pending"),
});

const sellerPatchSchema = sellerCreateSchema.omit({ ownerId: true, ownerEmail: true, ownerName: true }).partial();

const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "reinstate"]),
  reason: z.string().max(500).optional(),
});

const commissionSchema = z.object({ commissionRateBps: z.number().int().min(0).max(5000).nullable() });

const kycDocSchema = z.object({
  type: z.enum(["business_license", "tax_id", "id_proof", "address_proof", "bank_statement"]),
  documentNumber: z.string().max(120).optional(),
  fileUrl: z.string().max(500).optional(),
});

const onboardingReviewSchema = z.object({
  action: z.enum(["approve", "reject", "request_info"]),
  reviewNote: z.string().max(500).optional(),
});

const rangeSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

export async function adminSellerRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------ sellers
  app.get(
    "/sellers",
    { schema: { tags: ["Admin · Sellers"], summary: "List marketplace sellers" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(
        pageSchema.extend({
          q: z.string().max(120).optional(),
          status: z.enum(SELLER_STATUSES).optional(),
          kycStatus: z.enum(SELLER_KYC_STATUSES).optional(),
          state: z.string().length(2).optional(),
        }),
        request.query,
      );
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.kycStatus) where.kycStatus = query.kycStatus;
      if (query.state) where.state = query.state.toUpperCase();
      if (query.q) where.OR = [{ storeName: { contains: query.q } }, { slug: { contains: query.q } }, { contactEmail: { contains: query.q } }];
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, sellers, settings] = await Promise.all([
        prisma.seller.count({ where: where as never }),
        prisma.seller.findMany({ where: where as never, include: sellerWithRelations(), orderBy: { createdAt: "desc" }, skip, take }),
        getSettings(),
      ]);
      return reply.send(paginated(sellers.map((seller) => serializeSeller(seller, settings.marketplace.defaultCommissionBps)), total, page, pageSize));
    },
  );

  app.get(
    "/sellers/:id",
    { schema: { tags: ["Admin · Sellers"], summary: "Seller detail with ledger and payouts" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const seller = await getSeller(id);
      const settings = await getSettings();
      const [ledger, payouts, preview, listings] = await Promise.all([
        prisma.sellerLedgerEntry.findMany({ where: { sellerId: seller.id }, orderBy: { occurredAt: "desc" }, take: 50 }),
        prisma.payout.findMany({ where: { sellerId: seller.id }, orderBy: { periodEnd: "desc" }, take: 24 }),
        previewPayout(seller.id),
        prisma.rentalListing.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" }, take: 20 }),
      ]);
      return reply.send({
        data: {
          ...serializeSeller(seller, settings.marketplace.defaultCommissionBps),
          ledgerEntries: ledger,
          payouts,
          payoutPreview: preview,
          rentalListings: listings.map((listing) => ({
            id: listing.id,
            slug: listing.slug,
            title: listing.title,
            status: listing.status,
            dailyRateMinor: listing.dailyRateMinor,
            depositMinor: listing.depositMinor,
            state: listing.state,
          })),
        },
      });
    },
  );

  app.post(
    "/sellers",
    { schema: { tags: ["Admin · Sellers"], summary: "Create a seller account" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const input = parse(sellerCreateSchema, request.body);
      if (!input.ownerId && !input.ownerEmail) throw badRequest("ownerId or ownerEmail is required");
      const slug = slugify(input.slug ?? input.storeName);
      if (await prisma.seller.findUnique({ where: { slug } })) throw conflict("Seller slug already exists", { slug });

      let ownerId = input.ownerId;
      if (!ownerId) {
        const existing = await prisma.user.findUnique({ where: { email: input.ownerEmail! } });
        if (existing) ownerId = existing.id;
        else {
          const created = await prisma.user.create({
            data: {
              email: input.ownerEmail!,
              passwordHash: await hashPassword(crypto.randomBytes(18).toString("hex")),
              firstName: input.ownerName ?? input.storeName,
              role: "customer",
            },
          });
          ownerId = created.id;
        }
      }
      if (input.vendorId) {
        const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
        if (!vendor) throw notFound("Vendor not found");
      }

      const seller = await prisma.seller.create({
        data: {
          ownerId,
          vendorId: input.vendorId ?? null,
          storeName: input.storeName,
          slug,
          logoUrl: input.logoUrl ?? null,
          description: input.description ?? null,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone ?? null,
          addressLine1: input.addressLine1 ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          postalCode: input.postalCode ?? null,
          country: input.country,
          kycStatus: input.kycStatus,
          commissionRateBps: input.commissionRateBps ?? null,
          payoutMethod: input.payoutMethod,
          payoutDetailsMasked: input.payoutDetailsMasked ?? null,
          payoutVerificationStatus: input.payoutVerificationStatus,
          status: input.status,
          joinedAt: new Date(),
        },
        include: sellerWithRelations(),
      });
      await recordAudit({
        actor,
        action: "seller.created",
        entityType: "seller",
        entityId: seller.id,
        after: { storeName: seller.storeName, kycStatus: seller.kycStatus, status: seller.status },
      });
      const settings = await getSettings();
      return reply.status(201).send({ data: serializeSeller(seller, settings.marketplace.defaultCommissionBps) });
    },
  );

  app.patch(
    "/sellers/:id",
    { schema: { tags: ["Admin · Sellers"], summary: "Update seller profile and payout details" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(sellerPatchSchema, request.body);
      const before = await getSeller(id);
      if (input.slug) {
        const slug = slugify(input.slug);
        if (await prisma.seller.findFirst({ where: { slug, id: { not: id } } })) throw conflict("Seller slug already exists", { slug });
      }
      const updated = await prisma.seller.update({
        where: { id: before.id },
        data: {
          ...(input.storeName !== undefined ? { storeName: input.storeName } : {}),
          ...(input.slug !== undefined ? { slug: slugify(input.slug) } : {}),
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
          ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
          ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.commissionRateBps !== undefined ? { commissionRateBps: input.commissionRateBps } : {}),
          ...(input.payoutMethod !== undefined ? { payoutMethod: input.payoutMethod } : {}),
          ...(input.payoutDetailsMasked !== undefined ? { payoutDetailsMasked: input.payoutDetailsMasked } : {}),
          ...(input.payoutVerificationStatus !== undefined ? { payoutVerificationStatus: input.payoutVerificationStatus } : {}),
        },
        include: sellerWithRelations(),
      });
      await recordAudit({
        actor,
        action: "seller.updated",
        entityType: "seller",
        entityId: id,
        before: { storeName: before.storeName, payoutMethod: before.payoutMethod },
        after: input,
      });
      const settings = await getSettings();
      return reply.send({ data: serializeSeller(updated, settings.marketplace.defaultCommissionBps) });
    },
  );

  app.post(
    "/sellers/:id/review",
    { schema: { tags: ["Admin · Sellers"], summary: "KYC/store review: approve, reject, suspend or reinstate" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(reviewSchema, request.body);
      const before = await getSeller(id);
      const data =
        input.action === "approve"
          ? { kycStatus: "approved", status: "active" }
          : input.action === "reject"
            ? { kycStatus: "rejected", status: "rejected" }
            : input.action === "suspend"
              ? { kycStatus: "suspended", status: "suspended" }
              : { kycStatus: "approved", status: "active" };
      const updated = await prisma.seller.update({ where: { id: before.id }, data, include: sellerWithRelations() });
      await recordAudit({
        actor,
        action: `seller.review.${input.action}`,
        entityType: "seller",
        entityId: before.id,
        before: { kycStatus: before.kycStatus, status: before.status },
        after: { ...data, reason: input.reason },
      });
      const settings = await getSettings();
      return reply.send({ data: serializeSeller(updated, settings.marketplace.defaultCommissionBps) });
    },
  );

  app.patch(
    "/sellers/:id/commission",
    { schema: { tags: ["Admin · Sellers"], summary: "Set per-seller commission override (null clears it)" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(commissionSchema, request.body);
      const before = await getSeller(id);
      const updated = await prisma.seller.update({
        where: { id: before.id },
        data: { commissionRateBps: input.commissionRateBps },
        include: sellerWithRelations(),
      });
      const settings = await getSettings();
      await recordAudit({
        actor,
        action: "seller.commission.update",
        entityType: "seller",
        entityId: before.id,
        before: { commissionRateBps: before.commissionRateBps },
        after: { commissionRateBps: input.commissionRateBps, effectiveBps: input.commissionRateBps ?? settings.marketplace.defaultCommissionBps },
      });
      return reply.send({ data: serializeSeller(updated, settings.marketplace.defaultCommissionBps) });
    },
  );

  app.post(
    "/sellers/:id/kyc-documents",
    { schema: { tags: ["Admin · Sellers"], summary: "Register a KYC document for a seller" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(kycDocSchema, request.body);
      await getSeller(id);
      const document = await prisma.sellerKycDocument.create({
        data: { sellerId: id, ...input },
      });
      await recordAudit({
        actor,
        action: "seller.kyc.document.add",
        entityType: "sellerKycDocument",
        entityId: document.id,
        after: { sellerId: id, type: input.type },
      });
      return reply.status(201).send({ data: document });
    },
  );

  app.post(
    "/sellers/kyc-documents/:documentId/review",
    { schema: { tags: ["Admin · Sellers"], summary: "Approve or reject a KYC document" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { documentId } = parse(z.object({ documentId: z.string().min(1) }), request.params);
      const input = parse(
        z.object({ status: z.enum(["approved", "rejected"]), reviewNote: z.string().max(300).optional() }),
        request.body,
      );
      const document = await prisma.sellerKycDocument.findUnique({ where: { id: documentId } });
      if (!document) throw notFound("KYC document not found");
      const updated = await prisma.sellerKycDocument.update({
        where: { id: documentId },
        data: { status: input.status, reviewNote: input.reviewNote ?? null, reviewerId: actor.id, reviewedAt: new Date() },
      });
      await recordAudit({
        actor,
        action: `seller.kyc.document.${input.status}`,
        entityType: "sellerKycDocument",
        entityId: documentId,
        before: { status: document.status },
        after: { status: input.status },
      });
      return reply.send({ data: updated });
    },
  );

  // --------------------------------------------------------------- onboarding
  app.get(
    "/sellers/onboarding/requests",
    { schema: { tags: ["Admin · Sellers"], summary: "List seller onboarding requests" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(pageSchema.extend({ status: z.string().optional() }), request.query);
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, rows] = await Promise.all([
        prisma.sellerOnboardingRequest.count({ where: where as never }),
        prisma.sellerOnboardingRequest.findMany({ where: where as never, orderBy: { submittedAt: "desc" }, skip, take }),
      ]);
      return reply.send(paginated(rows, total, page, pageSize));
    },
  );

  app.post(
    "/sellers/onboarding/requests/:id/review",
    { schema: { tags: ["Admin · Sellers"], summary: "Approve, reject or request more info on an onboarding request" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(onboardingReviewSchema, request.body);
      const requestRow = await prisma.sellerOnboardingRequest.findUnique({ where: { id } });
      if (!requestRow) throw notFound("Onboarding request not found");
      if (["approved", "rejected"].includes(requestRow.status) && input.action !== "request_info") {
        throw conflict("Onboarding request has already been decided", { status: requestRow.status });
      }

      if (input.action === "request_info") {
        const updated = await prisma.sellerOnboardingRequest.update({
          where: { id },
          data: { status: "info_requested", reviewNote: input.reviewNote ?? null, reviewedById: actor.id, reviewedAt: new Date() },
        });
        await recordAudit({ actor, action: "seller.onboarding.request_info", entityType: "sellerOnboardingRequest", entityId: id, after: { reviewNote: input.reviewNote } });
        return reply.send({ data: updated });
      }

      if (input.action === "reject") {
        const updated = await prisma.sellerOnboardingRequest.update({
          where: { id },
          data: { status: "rejected", reviewNote: input.reviewNote ?? null, reviewedById: actor.id, reviewedAt: new Date() },
        });
        await recordAudit({ actor, action: "seller.onboarding.rejected", entityType: "sellerOnboardingRequest", entityId: id, after: { reviewNote: input.reviewNote } });
        return reply.send({ data: updated });
      }

      // Approve: create (or reuse) an owner account and a seller profile.
      const slug = slugify(requestRow.proposedSlug ?? requestRow.proposedStoreName);
      if (await prisma.seller.findUnique({ where: { slug } })) throw conflict("Seller slug already exists", { slug });
      let owner = await prisma.user.findUnique({ where: { email: requestRow.applicantEmail } });
      if (!owner) {
        owner = await prisma.user.create({
          data: {
            email: requestRow.applicantEmail,
            passwordHash: await hashPassword(crypto.randomBytes(18).toString("hex")),
            firstName: requestRow.applicantName,
            role: "customer",
          },
        });
      }
      const seller = await prisma.$transaction(async (tx) => {
        const created = await tx.seller.create({
          data: {
            ownerId: owner!.id,
            storeName: requestRow.proposedStoreName,
            slug,
            description: requestRow.description,
            contactEmail: requestRow.applicantEmail,
            contactPhone: requestRow.contactPhone,
            city: requestRow.city,
            state: requestRow.state,
            country: requestRow.country,
            kycStatus: "approved",
            status: "active",
            joinedAt: new Date(),
          },
          include: sellerWithRelations(),
        });
        await tx.sellerOnboardingRequest.update({
          where: { id },
          data: { status: "approved", sellerId: created.id, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: input.reviewNote ?? null },
        });
        return created;
      });
      await recordAudit({
        actor,
        action: "seller.onboarding.approved",
        entityType: "seller",
        entityId: seller.id,
        after: { onboardingRequestId: id, storeName: seller.storeName },
      });
      const settings = await getSettings();
      return reply.send({ data: serializeSeller(seller, settings.marketplace.defaultCommissionBps) });
    },
  );

  // --------------------------------------------------------------- analytics
  app.get(
    "/analytics/sellers",
    { schema: { tags: ["Admin · Sellers"], summary: "GMV, commission, payouts and ratings per seller" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      return reply.send({ data: await getSellerAnalytics(defaultRange(query.from, query.to)) });
    },
  );

  app.get(
    "/analytics/sellers/top",
    { schema: { tags: ["Admin · Sellers"], summary: "Top sellers by GMV" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      const data = await getSellerAnalytics(defaultRange(query.from, query.to));
      return reply.send({ data: { range: data.range, topSellers: data.topSellers } });
    },
  );

  app.get(
    "/analytics/sellers/payout-due",
    { schema: { tags: ["Admin · Sellers"], summary: "Outstanding seller payout liability" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      const data = await getSellerAnalytics(defaultRange(query.from, query.to));
      return reply.send({
        data: {
          payoutDueMinor: data.totals.payoutDueMinor,
          sellers: data.sellers
            .filter((seller) => seller.payoutDueMinor > 0)
            .sort((a, b) => b.payoutDueMinor - a.payoutDueMinor),
        },
      });
    },
  );

  app.get(
    "/sellers/:id/payout-preview",
    { schema: { tags: ["Admin · Payouts"], summary: "Preview a seller's next payout" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      await getSeller(id);
      return reply.send({ data: await previewPayout(id) });
    },
  );
}
