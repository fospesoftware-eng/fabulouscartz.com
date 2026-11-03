import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parse } from "../lib/validate.js";
import { getActor, requireActor } from "../lib/guards.js";
import { conflict, forbidden, notFound } from "../lib/errors.js";
import { resolveCart } from "../services/cart.js";
import { createOrder, getOrderByNumber, getOrderView, orderForGuest } from "../services/orders.js";
import { confirmMockPayment, createPaymentIntent, processWebhook } from "../services/payments.js";
import { listProviders } from "../services/payments/providers.js";
import { pageArgs, pageSchema, paginated } from "../lib/pagination.js";

function tokenFrom(headers: Record<string, unknown>): string | undefined {
  const header = headers["x-cart-token"];
  return typeof header === "string" && header.length > 0 ? header : undefined;
}

const addressSchema = z.object({
  recipient: z.string().min(1).max(120),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(2).max(20),
  country: z.string().min(2).max(60).default("IN"),
  phone: z.string().max(30).nullable().optional(),
});

const checkoutSchema = z.object({
  email: z.string().email().optional(),
  shippingAddress: addressSchema,
  paymentMethod: z.enum(["mock", "phonepe", "razorpay", "upi", "card"]).default("mock"),
  couponCode: z.string().max(64).optional(),
  notes: z.string().max(500).optional(),
});

async function assertOrderAccess(orderId: string, orderNumber: string, email: string | undefined, actorEmail: string | undefined) {
  const order = await getOrderByNumber(orderNumber);
  if (!order) throw notFound("Order not found");
  if (order.id !== orderId) throw notFound("Order not found");
  const actor = await prisma.user.findFirst({ where: { email: actorEmail ?? "" } });
  if (actor && actor.role !== "customer") return order;
  if (email && order.email.toLowerCase() === email.toLowerCase()) return order;
  if (actorEmail && order.email.toLowerCase() === actorEmail.toLowerCase()) return order;
  throw notFound("Order not found");
}

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/checkout",
    { schema: { tags: ["Checkout"], summary: "Create an order from the active cart" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { cart } = await resolveCart(actor, tokenFrom(request.headers), { create: false });
      const input = parse(checkoutSchema, request.body);
      const email = input.email ?? actor?.email;
      if (!email) throw conflict("Email is required for guest checkout");

      const order = await createOrder({
        cart,
        email,
        shippingAddress: input.shippingAddress,
        paymentMethod: input.paymentMethod,
        couponCode: input.couponCode,
        notes: input.notes,
        actor,
      });

      return reply.status(201).send({
        data: order,
        payment: order.payments[0] ?? null,
        next:
          order.payments[0]?.provider === "mock"
            ? {
                action: "confirm_mock_payment",
                method: "POST",
                path: `/api/v1/payments/${order.payments[0].id}/confirm`,
              }
            : { action: "redirect_to_provider", provider: order.payments[0]?.provider },
      });
    },
  );

  app.get(
    "/orders/:orderNumber",
    { schema: { tags: ["Orders"], summary: "Order detail (customer or email access)" } },
    async (request, reply) => {
      const { orderNumber } = parse(z.object({ orderNumber: z.string().min(1) }), request.params);
      const { email } = parse(z.object({ email: z.string().email().optional() }), request.query);
      const actor = await getActor(request);
      const order = await getOrderByNumber(orderNumber);
      if (!order) throw notFound("Order not found");

      const isStaff = actor && actor.role !== "customer";
      const isOwner = actor && order.userId === actor.id;
      const emailMatches = email && order.email.toLowerCase() === email.toLowerCase();
      if (!isStaff && !isOwner && !emailMatches) throw forbidden("Order access denied");
      return reply.send({ data: order });
    },
  );

  app.get(
    "/orders",
    { schema: { tags: ["Orders"], summary: "List own orders" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const query = parse(pageSchema, request.query);
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, orders] = await Promise.all([
        prisma.order.count({ where: { userId: actor.id } }),
        prisma.order.findMany({
          where: { userId: actor.id },
          include: { items: true, shippingAddress: true, payments: true },
          orderBy: { placedAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(orders, total, page, pageSize));
    },
  );
}

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/payments/providers",
    { schema: { tags: ["Payments"], summary: "Available payment providers" } },
    async (_request, reply) => reply.send({ data: listProviders() }),
  );

  app.post(
    "/payments/intents",
    { schema: { tags: ["Payments"], summary: "Create a provider payment intent" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const input = parse(
        z.object({
          orderId: z.string().min(1),
          provider: z.enum(["mock", "phonepe", "razorpay", "upi", "card"]).optional(),
          email: z.string().email().optional(),
        }),
        request.body,
      );
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) throw notFound("Order not found");
      const isStaff = actor && actor.role !== "customer";
      const isOwner = actor && order.userId === actor.id;
      const emailMatches = input.email && order.email.toLowerCase() === input.email.toLowerCase();
      if (!isStaff && !isOwner && !emailMatches) throw forbidden("Order access denied");

      const result = await createPaymentIntent({
        orderId: order.id,
        provider: input.provider ?? order.paymentMethod,
        email: input.email,
        actor,
      });
      return reply.status(201).send(result);
    },
  );

  app.post(
    "/payments/:paymentId/confirm",
    { schema: { tags: ["Payments"], summary: "Confirm a mock payment (local dev)" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { paymentId } = parse(z.object({ paymentId: z.string().min(1) }), request.params);
      const result = await confirmMockPayment({ paymentId, actor });
      return reply.send({ data: result.order, alreadyProcessed: result.alreadyProcessed });
    },
  );

  app.post(
    "/webhooks/payments/:provider",
    { schema: { tags: ["Payments"], summary: "Signed payment provider webhook" } },
    async (request, reply) => {
      const { provider } = parse(z.object({ provider: z.string().min(1) }), request.params);
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
      const signature = (request.headers["x-webhook-signature"] ??
        request.headers["x-razorpay-signature"] ??
        request.headers["x-phonepe-signature"]) as string | undefined;

      const event = parse(
        z.object({
          eventId: z.string().min(1).max(120),
          type: z.enum(["payment.succeeded", "payment.failed", "refund.succeeded"]),
          paymentId: z.string().optional(),
          providerPaymentId: z.string().optional(),
          orderId: z.string().optional(),
          amountMinor: z.number().int().positive().optional(),
          reason: z.string().max(300).optional(),
        }),
        request.body,
      );

      const result = await processWebhook({ provider, rawBody, signature, event });
      return reply.send({ received: true, duplicate: result.duplicate, eventId: result.eventId });
    },
  );

  app.get(
    "/orders/:orderNumber/payments",
    { schema: { tags: ["Payments"], summary: "Payment records for an order" } },
    async (request, reply) => {
      const { orderNumber } = parse(z.object({ orderNumber: z.string().min(1) }), request.params);
      const { email } = parse(z.object({ email: z.string().email().optional() }), request.query);
      const actor = await getActor(request);
      const order = await getOrderByNumber(orderNumber);
      if (!order) throw notFound("Order not found");
      const allowed =
        (actor && actor.role !== "customer") ||
        (actor && order.userId === actor.id) ||
        (email && order.email.toLowerCase() === email.toLowerCase());
      if (!allowed) throw forbidden("Order access denied");
      return reply.send({ data: order.payments });
    },
  );

  app.get(
    "/orders/:orderNumber/status",
    { schema: { tags: ["Orders"], summary: "Order status and event timeline" } },
    async (request, reply) => {
      const { orderNumber } = parse(z.object({ orderNumber: z.string().min(1) }), request.params);
      const { email } = parse(z.object({ email: z.string().email().optional() }), request.query);
      const actor = await getActor(request);
      const order = await getOrderByNumber(orderNumber);
      if (!order) throw notFound("Order not found");
      const allowed =
        (actor && actor.role !== "customer") ||
        (actor && order.userId === actor.id) ||
        (email && order.email.toLowerCase() === email.toLowerCase());
      if (!allowed) throw forbidden("Order access denied");
      return reply.send({
        data: {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          timeline: order.events,
        },
      });
    },
  );
}

export { getOrderView, orderForGuest, assertOrderAccess };
