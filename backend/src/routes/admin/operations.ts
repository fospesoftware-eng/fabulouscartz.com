import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { parse } from "../../lib/validate.js";
import { conflict, notFound, badRequest } from "../../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../../lib/pagination.js";
import { recordAudit } from "../../lib/audit.js";
import { adjustStock } from "../../services/inventory.js";
import { getOrderView, refundOrder, transitionOrder, allowedTransitions } from "../../services/orders.js";
import { ORDER_STATUSES, STOCK_REASONS, type OrderStatus } from "../../lib/constants.js";
import { serializeProduct } from "../../lib/serialize.js";
import { productInclude } from "../../lib/serialize.js";
import { recalculateProductRating } from "../engagement.js";
import { slugify } from "../../lib/slug.js";
import { staffActor } from "./catalog.js";

export async function adminOperationsRoutes(app: FastifyInstance): Promise<void> {
  // --------------------------------------------------------------- inventory
  app.get(
    "/inventory",
    { schema: { tags: ["Admin · Inventory"], summary: "Stock levels across variants" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(
        pageSchema.extend({
          lowOnly: z.enum(["true", "false"]).optional(),
          q: z.string().max(120).optional(),
          productId: z.string().optional(),
        }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);

      const variants = await prisma.productVariant.findMany({
        where: {
          isActive: true,
          ...(query.productId ? { productId: query.productId } : {}),
          ...(query.q ? { OR: [{ sku: { contains: query.q } }, { product: { title: { contains: query.q } } }] } : {}),
        },
        include: { product: { select: { id: true, title: true, slug: true, status: true, vendor: { select: { name: true } } } } },
        orderBy: { stockQuantity: "asc" },
      });
      const filtered = query.lowOnly === "true" ? variants.filter((variant) => variant.stockQuantity <= variant.lowStockThreshold) : variants;
      const total = filtered.length;
      const data = filtered.slice(skip, skip + take).map((variant) => ({
        variantId: variant.id,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        stockQuantity: variant.stockQuantity,
        reservedQuantity: variant.reservedQuantity,
        available: Math.max(0, variant.stockQuantity - variant.reservedQuantity),
        lowStockThreshold: variant.lowStockThreshold,
        isLowStock: variant.stockQuantity <= variant.lowStockThreshold,
        product: variant.product,
      }));
      return reply.send(paginated(data, total, page, pageSize));
    },
  );

  app.post(
    "/inventory/adjustments",
    { schema: { tags: ["Admin · Inventory"], summary: "Adjust stock with a reason code" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager", "fulfilment"]);
      const input = parse(
        z.object({
          variantId: z.string().min(1),
          delta: z.number().int().min(-1000).max(1000).refine((n) => n !== 0, "delta cannot be zero"),
          reason: z.enum(STOCK_REASONS),
          note: z.string().max(300).optional(),
        }),
        request.body,
      );
      const result = await adjustStock({ ...input, actorId: actor.id });
      await recordAudit({
        actor,
        action: "inventory.adjust",
        entityType: "productVariant",
        entityId: input.variantId,
        before: { stockQuantity: result.before },
        after: { stockQuantity: result.after, delta: input.delta, reason: input.reason },
        request,
      });
      return reply.status(201).send({ data: { ...input, ...result } });
    },
  );

  app.get(
    "/inventory/adjustments",
    { schema: { tags: ["Admin · Inventory"], summary: "Immutable stock adjustment ledger" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(
        pageSchema.extend({ variantId: z.string().optional(), reason: z.enum(STOCK_REASONS).optional() }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);
      const where = {
        ...(query.variantId ? { variantId: query.variantId } : {}),
        ...(query.reason ? { reason: query.reason } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.stockAdjustment.count({ where }),
        prisma.stockAdjustment.findMany({
          where,
          include: { variant: { select: { sku: true, product: { select: { title: true } } } } },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(rows, total, page, pageSize));
    },
  );

  app.get(
    "/inventory/reservations",
    { schema: { tags: ["Admin · Inventory"], summary: "Active and historical reservations" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(
        pageSchema.extend({ status: z.enum(["active", "committed", "released"]).optional(), orderId: z.string().optional() }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.stockReservation.count({ where }),
        prisma.stockReservation.findMany({
          where,
          include: { variant: { select: { sku: true, product: { select: { title: true } } } } },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(rows, total, page, pageSize));
    },
  );

  app.patch(
    "/inventory/variants/:id/threshold",
    { schema: { tags: ["Admin · Inventory"], summary: "Set a low-stock threshold" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager", "fulfilment"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const { lowStockThreshold } = parse(
        z.object({ lowStockThreshold: z.number().int().min(0).max(1000) }),
        request.body,
      );
      const variant = await prisma.productVariant.findUnique({ where: { id } });
      if (!variant) throw notFound("Variant not found");
      await prisma.productVariant.update({ where: { id }, data: { lowStockThreshold } });
      await recordAudit({
        actor,
        action: "inventory.threshold",
        entityType: "productVariant",
        entityId: id,
        before: { lowStockThreshold: variant.lowStockThreshold },
        after: { lowStockThreshold },
        request,
      });
      return reply.send({ data: { id, lowStockThreshold } });
    },
  );

  // -------------------------------------------------------------------- orders
  app.get(
    "/orders",
    { schema: { tags: ["Admin · Orders"], summary: "List orders with filters" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(
        pageSchema.extend({
          status: z.enum(ORDER_STATUSES).optional(),
          q: z.string().max(160).optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
        }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.q) {
        where.OR = [
          { orderNumber: { contains: query.q } },
          { email: { contains: query.q } },
        ];
      }
      if (query.from || query.to) {
        where.placedAt = {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {}),
        };
      }
      const [total, orders] = await Promise.all([
        prisma.order.count({ where: where as never }),
        prisma.order.findMany({
          where: where as never,
          include: { items: true, shippingAddress: true, payments: true },
          orderBy: { placedAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(orders, total, page, pageSize));
    },
  );

  app.get(
    "/orders/:id",
    { schema: { tags: ["Admin · Orders"], summary: "Order detail with timeline and payments" } },
    async (request, reply) => {
      await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const order = await getOrderView(id);
      return reply.send({ data: order, allowedTransitions: allowedTransitions(order.status as OrderStatus) });
    },
  );

  app.patch(
    "/orders/:id/status",
    { schema: { tags: ["Admin · Orders"], summary: "Transition order status (state machine enforced)" } },
    async (request, reply) => {
      const actor = await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(
        z.object({ status: z.enum(ORDER_STATUSES), note: z.string().max(300).optional() }),
        request.body,
      );
      if (input.status === "paid" || input.status === "refunded") {
        throw badRequest("Paid is set by payments; use the refunds endpoint for refunds");
      }
      if (actor.role === "fulfilment" && !["confirmed", "shipped", "delivered"].includes(input.status)) {
        throw conflict("Fulfilment can only confirm, ship or deliver orders");
      }
      const order = await transitionOrder({ orderId: id, to: input.status, actor, note: input.note });
      return reply.send({ data: order, allowedTransitions: allowedTransitions(order.status as OrderStatus) });
    },
  );

  app.post(
    "/orders/:id/refunds",
    { schema: { tags: ["Admin · Orders"], summary: "Create a partial/full refund" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(
        z.object({
          amountMinor: z.number().int().positive().optional(),
          reason: z.string().max(300).optional(),
          idempotencyKey: z.string().max(120).optional(),
        }),
        request.body,
      );
      const current = await getOrderView(id);
      const already = current.refunds.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amountMinor, 0);
      const amount = input.amountMinor ?? current.totalMinor - already;
      const order = await refundOrder({
        orderId: id,
        amountMinor: amount,
        reason: input.reason,
        actor,
        idempotencyKey: input.idempotencyKey,
      });
      return reply.status(201).send({ data: order });
    },
  );

  // ----------------------------------------------------------------- customers
  app.get(
    "/customers",
    { schema: { tags: ["Admin · Customers"], summary: "List customers with spend" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(pageSchema.extend({ q: z.string().max(120).optional() }), request.query);
      const { skip, take, page, pageSize } = pageArgs(query);
      const where = {
        role: "customer",
        ...(query.q
          ? { OR: [{ email: { contains: query.q } }, { firstName: { contains: query.q } }, { lastName: { contains: query.q } }] }
          : {}),
      };
      const [total, customers] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          include: {
            orders: {
              where: { status: { in: ["paid", "confirmed", "shipped", "delivered"] } },
              select: { totalMinor: true },
            },
            _count: { select: { orders: true, reviews: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      const data = customers.map((customer) => ({
        id: customer.id,
        email: customer.email,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
        phone: customer.phone,
        isActive: customer.isActive,
        ordersCount: customer._count.orders,
        reviewsCount: customer._count.reviews,
        lifetimeSpendMinor: customer.orders.reduce((sum, order) => sum + order.totalMinor, 0),
        createdAt: customer.createdAt,
        lastLoginAt: customer.lastLoginAt,
      }));
      return reply.send(paginated(data, total, page, pageSize));
    },
  );

  app.get(
    "/customers/:id",
    { schema: { tags: ["Admin · Customers"], summary: "Customer detail with orders" } },
    async (request, reply) => {
      await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const customer = await prisma.user.findFirst({
        where: { id, role: "customer" },
        include: {
          orders: { orderBy: { placedAt: "desc" }, take: 20, include: { items: true } },
          addresses: true,
          wishlist: { include: { product: { include: productInclude } } },
        },
      });
      if (!customer) throw notFound("Customer not found");
      return reply.send({
        data: {
          id: customer.id,
          email: customer.email,
          name: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
          phone: customer.phone,
          isActive: customer.isActive,
          createdAt: customer.createdAt,
          addresses: customer.addresses,
          orders: customer.orders,
          wishlist: customer.wishlist.map((item) => serializeProduct(item.product)),
        },
      });
    },
  );

  app.patch(
    "/customers/:id",
    { schema: { tags: ["Admin · Customers"], summary: "Enable/disable a customer" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const { isActive } = parse(z.object({ isActive: z.boolean() }), request.body);
      const customer = await prisma.user.findFirst({ where: { id, role: "customer" } });
      if (!customer) throw notFound("Customer not found");
      const updated = await prisma.user.update({ where: { id }, data: { isActive } });
      await recordAudit({
        actor,
        action: "customer.status",
        entityType: "user",
        entityId: id,
        before: { isActive: customer.isActive },
        after: { isActive },
        request,
      });
      return reply.send({ data: { id: updated.id, isActive: updated.isActive } });
    },
  );

  // ------------------------------------------------------------------- coupons
  app.get(
    "/coupons",
    { schema: { tags: ["Admin · Discounts"], summary: "List coupons" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(pageSchema.extend({ q: z.string().max(60).optional() }), request.query);
      const { skip, take, page, pageSize } = pageArgs(query);
      const where = query.q ? { code: { contains: query.q.toUpperCase() } } : {};
      const [total, coupons] = await Promise.all([
        prisma.coupon.count({ where }),
        prisma.coupon.findMany({
          where,
          include: { category: { select: { id: true, name: true, slug: true } }, _count: { select: { redemptions: true } } },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(coupons.map((coupon) => ({ ...coupon, redemptionCountActual: coupon._count.redemptions })), total, page, pageSize));
    },
  );

  const couponSchema = z.object({
    code: z.string().min(3).max(60).transform((value) => value.trim().toUpperCase()),
    description: z.string().max(200).optional(),
    kind: z.enum(["percent", "flat"]),
    value: z.number().int().positive(),
    minSubtotalMinor: z.number().int().min(0).default(0),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    maxRedemptions: z.number().int().positive().nullable().optional(),
    perCustomerLimit: z.number().int().positive().default(1),
    categoryId: z.string().nullable().optional(),
    isActive: z.boolean().default(true),
  });

  app.post(
    "/coupons",
    { schema: { tags: ["Admin · Discounts"], summary: "Create a coupon" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const input = parse(couponSchema, request.body);
      if (input.kind === "percent" && input.value > 100) throw badRequest("Percent coupons cannot exceed 100");
      if (input.categoryId) {
        const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
        if (!category) throw notFound("Category not found");
      }
      const coupon = await prisma.coupon.create({ data: input });
      await recordAudit({
        actor,
        action: "coupon.create",
        entityType: "coupon",
        entityId: coupon.id,
        after: coupon,
        request,
      });
      return reply.status(201).send({ data: coupon });
    },
  );

  app.patch(
    "/coupons/:id",
    { schema: { tags: ["Admin · Discounts"], summary: "Update a coupon" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(couponSchema.partial(), request.body);
      if (input.kind === "percent" && input.value != null && input.value > 100) {
        throw badRequest("Percent coupons cannot exceed 100");
      }
      const before = await prisma.coupon.findUnique({ where: { id } });
      if (!before) throw notFound("Coupon not found");
      const coupon = await prisma.coupon.update({ where: { id }, data: input });
      await recordAudit({
        actor,
        action: "coupon.update",
        entityType: "coupon",
        entityId: id,
        before,
        after: coupon,
        request,
      });
      return reply.send({ data: coupon });
    },
  );

  app.delete(
    "/coupons/:id",
    { schema: { tags: ["Admin · Discounts"], summary: "Deactivate a coupon" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const coupon = await prisma.coupon.findUnique({ where: { id } });
      if (!coupon) throw notFound("Coupon not found");
      await prisma.coupon.update({ where: { id }, data: { isActive: false } });
      await recordAudit({
        actor,
        action: "coupon.deactivate",
        entityType: "coupon",
        entityId: id,
        before: { isActive: coupon.isActive },
        after: { isActive: false },
        request,
      });
      return reply.send({ data: { id, isActive: false } });
    },
  );

  app.get(
    "/coupons/:id/redemptions",
    { schema: { tags: ["Admin · Discounts"], summary: "Coupon redemption history" } },
    async (request, reply) => {
      await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const coupon = await prisma.coupon.findUnique({ where: { id } });
      if (!coupon) throw notFound("Coupon not found");
      const redemptions = await prisma.couponRedemption.findMany({
        where: { couponId: id },
        include: { order: { select: { orderNumber: true, status: true, totalMinor: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return reply.send({ data: redemptions });
    },
  );

  // -------------------------------------------------------------- reviews & content
  app.get(
    "/reviews",
    { schema: { tags: ["Admin · Reviews"], summary: "Review moderation queue" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(
        pageSchema.extend({ status: z.enum(["pending", "approved", "rejected"]).optional(), productId: z.string().optional() }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);
      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
      };
      const [total, reviews] = await Promise.all([
        prisma.review.count({ where }),
        prisma.review.findMany({
          where,
          include: { product: { select: { id: true, title: true, slug: true } } },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(reviews, total, page, pageSize));
    },
  );

  app.patch(
    "/reviews/:id",
    { schema: { tags: ["Admin · Reviews"], summary: "Approve or reject a review" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const { status } = parse(z.object({ status: z.enum(["approved", "rejected"]) }), request.body);
      const before = await prisma.review.findUnique({ where: { id } });
      if (!before) throw notFound("Review not found");
      const review = await prisma.review.update({
        where: { id },
        data: { status, moderatedAt: new Date(), moderatedById: actor.id },
      });
      await recalculateProductRating(review.productId);
      await recordAudit({
        actor,
        action: `review.${status}`,
        entityType: "review",
        entityId: id,
        before: { status: before.status },
        after: { status },
        request,
      });
      return reply.send({ data: review });
    },
  );

  const bannerSchema = z.object({
    title: z.string().min(2).max(160),
    subtitle: z.string().max(300).optional(),
    imageUrl: z.string().max(500).optional(),
    linkUrl: z.string().max(500).optional(),
    linkLabel: z.string().max(80).optional(),
    placement: z.string().max(60).default("home_hero"),
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  });

  app.get(
    "/banners",
    { schema: { tags: ["Admin · Content"], summary: "List all banners" } },
    async (request, reply) => {
      await staffActor(request);
      const banners = await prisma.banner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] });
      return reply.send({ data: banners });
    },
  );

  app.post(
    "/banners",
    { schema: { tags: ["Admin · Content"], summary: "Create a banner" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const input = parse(bannerSchema, request.body);
      const banner = await prisma.banner.create({ data: input });
      await recordAudit({ actor, action: "banner.create", entityType: "banner", entityId: banner.id, after: banner, request });
      return reply.status(201).send({ data: banner });
    },
  );

  app.patch(
    "/banners/:id",
    { schema: { tags: ["Admin · Content"], summary: "Update a banner" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(bannerSchema.partial(), request.body);
      const before = await prisma.banner.findUnique({ where: { id } });
      if (!before) throw notFound("Banner not found");
      const banner = await prisma.banner.update({ where: { id }, data: input });
      await recordAudit({ actor, action: "banner.update", entityType: "banner", entityId: id, before, after: banner, request });
      return reply.send({ data: banner });
    },
  );

  app.delete(
    "/banners/:id",
    { schema: { tags: ["Admin · Content"], summary: "Delete a banner" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const before = await prisma.banner.findUnique({ where: { id } });
      if (!before) throw notFound("Banner not found");
      await prisma.banner.delete({ where: { id } });
      await recordAudit({ actor, action: "banner.delete", entityType: "banner", entityId: id, before, request });
      return reply.status(204).send();
    },
  );

  const postSchema = z.object({
    slug: z.string().min(2).max(120).optional(),
    title: z.string().min(2).max(200),
    excerpt: z.string().max(400).optional(),
    body: z.string().min(1).max(20000),
    coverImage: z.string().max(500).optional(),
    tag: z.string().max(60).default("editorial"),
    status: z.enum(["draft", "published"]).default("draft"),
  });

  app.get(
    "/posts",
    { schema: { tags: ["Admin · Content"], summary: "List all posts including drafts" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(pageSchema, request.query);
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, posts] = await Promise.all([
        prisma.contentPost.count(),
        prisma.contentPost.findMany({ orderBy: { updatedAt: "desc" }, skip, take }),
      ]);
      return reply.send(paginated(posts, total, page, pageSize));
    },
  );

  app.post(
    "/posts",
    { schema: { tags: ["Admin · Content"], summary: "Create an editorial post" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const input = parse(postSchema, request.body);
      const post = await prisma.contentPost.create({
        data: {
          ...input,
          slug: slugify(input.slug ?? input.title),
          authorId: actor.id,
          publishedAt: input.status === "published" ? new Date() : null,
        },
      });
      await recordAudit({ actor, action: "post.create", entityType: "contentPost", entityId: post.id, after: post, request });
      return reply.status(201).send({ data: post });
    },
  );

  app.patch(
    "/posts/:id",
    { schema: { tags: ["Admin · Content"], summary: "Update a post" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(postSchema.partial(), request.body);
      const before = await prisma.contentPost.findUnique({ where: { id } });
      if (!before) throw notFound("Post not found");
      const post = await prisma.contentPost.update({
        where: { id },
        data: {
          ...input,
          ...(input.slug ? { slug: slugify(input.slug) } : {}),
          ...(input.status === "published" && !before.publishedAt ? { publishedAt: new Date() } : {}),
        },
      });
      await recordAudit({ actor, action: "post.update", entityType: "contentPost", entityId: id, before, after: post, request });
      return reply.send({ data: post });
    },
  );

  app.post(
    "/posts/:id/publish",
    { schema: { tags: ["Admin · Content"], summary: "Publish a post" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const before = await prisma.contentPost.findUnique({ where: { id } });
      if (!before) throw notFound("Post not found");
      const post = await prisma.contentPost.update({
        where: { id },
        data: { status: "published", publishedAt: before.publishedAt ?? new Date() },
      });
      await recordAudit({ actor, action: "post.publish", entityType: "contentPost", entityId: id, before, after: post, request });
      return reply.send({ data: post });
    },
  );

  app.delete(
    "/posts/:id",
    { schema: { tags: ["Admin · Content"], summary: "Delete a post" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const before = await prisma.contentPost.findUnique({ where: { id } });
      if (!before) throw notFound("Post not found");
      await prisma.contentPost.delete({ where: { id } });
      await recordAudit({ actor, action: "post.delete", entityType: "contentPost", entityId: id, before, request });
      return reply.status(204).send();
    },
  );
}
