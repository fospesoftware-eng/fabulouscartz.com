import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parse } from "../lib/validate.js";
import { getActor, requireActor } from "../lib/guards.js";
import { conflict, notFound } from "../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../lib/pagination.js";
import { productInclude, serializeProduct } from "../lib/serialize.js";
import { recordAudit } from "../lib/audit.js";

export async function recalculateProductRating(productId: string): Promise<void> {
  const aggregate = await prisma.review.aggregate({
    where: { productId, status: "approved" },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAvg: Number((aggregate._avg.rating ?? 0).toFixed(2)),
      ratingCount: aggregate._count.rating,
    },
  });
}

const reviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().min(3).max(2000),
  authorName: z.string().min(1).max(80).optional(),
});

export async function engagementRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/products/:slug/reviews",
    { schema: { tags: ["Reviews"], summary: "Approved reviews for a product" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const query = parse(pageSchema, request.query);
      const { skip, take, page, pageSize } = pageArgs(query);
      const product = await prisma.product.findUnique({ where: { slug } });
      if (!product) throw notFound("Product not found");

      const where = { productId: product.id, status: "approved" };
      const [total, reviews, aggregate] = await Promise.all([
        prisma.review.count({ where }),
        prisma.review.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: { id: true, authorName: true, rating: true, title: true, body: true, createdAt: true },
        }),
        prisma.review.aggregate({ where, _avg: { rating: true }, _count: { rating: true } }),
      ]);

      return reply.send({
        ...paginated(reviews, total, page, pageSize),
        summary: {
          average: Number((aggregate._avg.rating ?? 0).toFixed(2)),
          count: aggregate._count.rating,
        },
      });
    },
  );

  app.post(
    "/reviews",
    { schema: { tags: ["Reviews"], summary: "Submit a review (moderated)" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const input = parse(reviewSchema, request.body);
      const product = await prisma.product.findUnique({ where: { id: input.productId } });
      if (!product || product.status !== "active") throw notFound("Product not found");

      if (actor) {
        const existing = await prisma.review.findFirst({
          where: { productId: product.id, userId: actor.id },
        });
        if (existing) throw conflict("You have already reviewed this product");
      }
      if (!actor && !input.authorName) throw conflict("authorName is required for guest reviews");

      let authorName = input.authorName ?? "";
      if (actor) {
        const user = await prisma.user.findUnique({ where: { id: actor.id } });
        authorName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "Customer";
      }

      const review = await prisma.review.create({
        data: {
          productId: product.id,
          userId: actor?.id ?? null,
          authorName,
          rating: input.rating,
          title: input.title ?? null,
          body: input.body,
          status: "pending",
        },
      });
      await recordAudit({
        actor,
        action: "review.create",
        entityType: "review",
        entityId: review.id,
        after: { productId: product.id, rating: input.rating, status: "pending" },
        request,
      });

      return reply.status(201).send({
        data: { ...review, message: "Review submitted for moderation" },
      });
    },
  );

  app.get(
    "/wishlist",
    { schema: { tags: ["Wishlist"], summary: "List own wishlist" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const items = await prisma.wishlistItem.findMany({
        where: { userId: actor.id },
        include: { product: { include: productInclude } },
        orderBy: { createdAt: "desc" },
      });
      return reply.send({
        data: items.map((item) => ({ id: item.id, addedAt: item.createdAt, product: serializeProduct(item.product) })),
      });
    },
  );

  app.post(
    "/wishlist",
    { schema: { tags: ["Wishlist"], summary: "Add a product to the wishlist" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { productId } = parse(z.object({ productId: z.string().min(1) }), request.body);
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) throw notFound("Product not found");
      const existing = await prisma.wishlistItem.findFirst({ where: { userId: actor.id, productId } });
      if (existing) return reply.send({ data: existing, alreadyExists: true });
      const item = await prisma.wishlistItem.create({ data: { userId: actor.id, productId } });
      await recordAudit({
        actor,
        action: "wishlist.add",
        entityType: "wishlist",
        entityId: item.id,
        after: { productId },
        request,
      });
      return reply.status(201).send({ data: item });
    },
  );

  app.delete(
    "/wishlist/:productId",
    { schema: { tags: ["Wishlist"], summary: "Remove a product from the wishlist" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { productId } = parse(z.object({ productId: z.string().min(1) }), request.params);
      const result = await prisma.wishlistItem.deleteMany({ where: { userId: actor.id, productId } });
      if (result.count === 0) throw notFound("Product is not in the wishlist");
      return reply.status(204).send();
    },
  );
}
