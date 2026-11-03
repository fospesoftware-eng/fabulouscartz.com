import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { canTransition, newId, orderNumber as makeOrderNumber, type OrderStatus } from "../lib/constants.js";
import { rentalDays, rentalPriceMinor, depositForProduct } from "../lib/money.js";
import { assertStock, commitOrderReservations, releaseOrderReservations, reserveStock } from "./inventory.js";
import { computeTaxAndShipping } from "./pricing.js";
import { validateCoupon } from "./coupons.js";
import { getSettings } from "./settings.js";
import { enqueueNotification } from "./notifications.js";
import { recordAudit } from "../lib/audit.js";
import { recordSellerLedgerForOrder, recordSellerRefundForOrder } from "./sellers.js";
import { itemPricing, type CartWithItems } from "./cart.js";
import type { Actor } from "../lib/guards.js";

const orderInclude = {
  items: { orderBy: { createdAt: "asc" } },
  shippingAddress: true,
  payments: { orderBy: { createdAt: "desc" } },
  refunds: { orderBy: { createdAt: "desc" } },
  events: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface ShippingAddressInput {
  recipient: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  phone?: string | null;
}

export interface CreateOrderInput {
  cart: CartWithItems;
  email: string;
  shippingAddress: ShippingAddressInput;
  paymentMethod: string;
  couponCode?: string;
  notes?: string;
  actor: Actor | null;
}

async function loadOrder(id: string): Promise<OrderWithDetails> {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw notFound("Order not found");
  return order;
}

export async function getOrderView(id: string): Promise<OrderWithDetails> {
  return loadOrder(id);
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderWithDetails | null> {
  return prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
}

export function orderForGuest(order: OrderWithDetails, email: string): OrderWithDetails {
  if (order.email.toLowerCase() !== email.trim().toLowerCase()) throw notFound("Order not found");
  return order;
}

/**
 * Create an order from a server-side cart. Snapshots prices, validates stock,
 * reserves inventory, and writes a pending payment intent — all transactions
 * consistent. Coupons are validated again at checkout.
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderWithDetails> {
  const { cart } = input;
  if (cart.items.length === 0) throw badRequest("Cart is empty");

  const settings = await getSettings();
  const method = input.paymentMethod in settings.payments ? input.paymentMethod : "mock";
  if (!settings.payments[method as keyof typeof settings.payments]) {
    throw badRequest(`Payment method "${input.paymentMethod}" is disabled`);
  }

  const lines = cart.items.map((item) => {
    const pricing = itemPricing(item);
    return {
      item,
      pricing,
      categoryId: item.product.categoryId,
    };
  });

  for (const line of lines) {
    await assertStock(
      line.item.variantId,
      line.item.mode as "buy" | "rent",
      line.item.quantity,
      line.item.rentalStart,
      line.item.rentalEnd,
    );
  }

  const subtotalMinor = lines.reduce((sum, line) => sum + line.pricing.lineTotalMinor, 0);

  let couponId: string | null = null;
  let couponCode: string | null = null;
  let discountMinor = 0;
  const requestedCode = input.couponCode ?? cart.coupon?.code;
  if (requestedCode) {
    const validation = await validateCoupon(
      requestedCode,
      lines.map((line) => ({
        productId: line.item.productId,
        categoryId: line.categoryId,
        lineTotalMinor: line.pricing.lineTotalMinor,
        quantity: line.item.quantity,
      })),
      { userId: input.actor?.id ?? cart.userId, email: input.email },
    );
    if (!validation.valid || !validation.coupon) {
      throw badRequest(validation.reason ?? "Coupon is not valid", { code: requestedCode });
    }
    couponId = validation.coupon.id;
    couponCode = validation.coupon.code;
    discountMinor = validation.discountMinor;
  }

  const taxableSubtotal = Math.max(0, subtotalMinor - discountMinor);
  const { taxMinor, shippingMinor } = await computeTaxAndShipping(taxableSubtotal);
  const totalMinor = taxableSubtotal + taxMinor + shippingMinor;

  const id = newId("ord");
  const number = makeOrderNumber();
  const email = input.email.trim().toLowerCase();

  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        id,
        orderNumber: number,
        userId: input.actor?.id ?? cart.userId ?? null,
        email,
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: method,
        currency: cart.currency,
        subtotalMinor,
        discountMinor,
        taxMinor,
        shippingMinor,
        totalMinor,
        couponCode,
        couponId,
        notes: input.notes ?? null,
        cartId: cart.id,
        items: {
          create: lines.map((line) => ({
            productId: line.item.productId,
            variantId: line.item.variantId,
            title: line.item.product.title,
            sku: line.item.variant.sku,
            mode: line.item.mode,
            quantity: line.item.quantity,
            unitPriceMinor: line.pricing.unitPriceMinor,
            lineTotalMinor: line.pricing.lineTotalMinor,
            rentalStart: line.item.rentalStart,
            rentalEnd: line.item.rentalEnd,
            rentalDays: line.pricing.rentalDays,
            depositMinor: line.pricing.depositMinor,
          })),
        },
        shippingAddress: {
          create: {
            recipient: input.shippingAddress.recipient,
            line1: input.shippingAddress.line1,
            line2: input.shippingAddress.line2 ?? null,
            city: input.shippingAddress.city,
            state: input.shippingAddress.state,
            postalCode: input.shippingAddress.postalCode,
            country: input.shippingAddress.country ?? "IN",
            phone: input.shippingAddress.phone ?? null,
            userId: input.actor?.id ?? null,
          },
        },
        payments: {
          create: {
            provider: method === "mock" ? "mock" : method,
            amountMinor: totalMinor,
            currency: cart.currency,
            idempotencyKey: `intent:${id}`,
            status: "pending",
          },
        },
        events: {
          create: { fromStatus: null, toStatus: "pending", note: "Order placed" },
        },
      },
      include: orderInclude,
    });

    for (const line of lines) {
      await reserveStock(tx, {
        variantId: line.item.variantId,
        orderId: id,
        cartId: cart.id,
        quantity: line.item.quantity,
        startsAt: line.item.rentalStart,
        endsAt: line.item.rentalEnd,
      });
    }

    await tx.cart.update({ where: { id: cart.id }, data: { status: "converted" } });

    await enqueueNotification(
      {
        template: "order_placed",
        toAddress: email,
        subject: `Order ${number} received`,
        payload: { orderNumber: number, totalMinor, currency: cart.currency },
      },
      tx,
    );

    return order;
  });

  await recordAudit({
    actor: input.actor,
    action: "order.create",
    entityType: "order",
    entityId: created.id,
    after: { orderNumber: created.orderNumber, totalMinor, status: "pending" },
  });

  return loadOrder(created.id);
}

/**
 * Move a pending order to paid. Shared by the mock driver, webhook handler and
 * admin tooling. Must be called inside a transaction.
 */
export async function settlePaidOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts: { actorId?: string | null; paymentId?: string | null; note?: string },
): Promise<void> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Order not found");
  if (order.status === "paid" || order.status === "confirmed" || order.status === "shipped" || order.status === "delivered") {
    return;
  }
  if (order.status !== "pending") throw conflict("Only pending orders can be paid", { status: order.status });

  await commitOrderReservations(tx, orderId, opts.actorId ?? null);

  if (order.couponId) {
    const existing = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (!existing) {
      await tx.coupon.update({
        where: { id: order.couponId },
        data: { redemptionCount: { increment: 1 } },
      });
      await tx.couponRedemption.create({
        data: {
          couponId: order.couponId,
          orderId,
          email: order.email,
          userId: order.userId,
          discountMinor: order.discountMinor,
        },
      });
    }
  }

  await tx.order.update({
    where: { id: orderId },
    data: { status: "paid", paymentStatus: "succeeded", paidAt: new Date() },
  });
  await tx.payment.updateMany({
    where: { orderId, status: { in: ["pending", "processing"] } },
    data: { status: "succeeded", succeededAt: new Date() },
  });
  if (opts.paymentId) {
    await tx.payment.update({
      where: { id: opts.paymentId },
      data: { status: "succeeded", succeededAt: new Date() },
    });
  }
  await tx.orderStatusEvent.create({
    data: {
      orderId,
      fromStatus: "pending",
      toStatus: "paid",
      note: opts.note ?? "Payment succeeded",
      actorId: opts.actorId ?? null,
    },
  });
  await recordSellerLedgerForOrder(tx, orderId);
  await enqueueNotification(
    {
      template: "order_paid",
      toAddress: order.email,
      subject: `Payment received for ${order.orderNumber}`,
      payload: { orderNumber: order.orderNumber, totalMinor: order.totalMinor },
    },
    tx,
  );
}

/** Admin/system state transition with business side-effects. */
export async function transitionOrder(input: {
  orderId: string;
  to: OrderStatus;
  actor: Actor | null;
  note?: string;
}): Promise<OrderWithDetails> {
  const order = await loadOrder(input.orderId);
  const from = order.status as OrderStatus;
  if (!canTransition(from, input.to)) {
    throw conflict(`Illegal transition ${from} -> ${input.to}`, {
      allowed: allowedTransitions(from),
    });
  }
  if (input.to === "paid") {
    throw conflict("Use the payment endpoints to mark an order paid");
  }

  await prisma.$transaction(async (tx) => {
    if (input.to === "cancelled") {
      await releaseOrderReservations(tx, order.id, { restock: false, actorId: input.actor?.id });
    }
    if (input.to === "refunded") {
      const payment = order.payments.find((p) => p.status === "succeeded");
      if (!payment) throw conflict("No successful payment to refund");
      const already = order.refunds
        .filter((r) => r.status === "succeeded")
        .reduce((sum, r) => sum + r.amountMinor, 0);
      const remaining = order.totalMinor - already;
      if (remaining <= 0) throw conflict("Order is already fully refunded");
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId: order.id,
          amountMinor: remaining,
          reason: input.note ?? "Full refund via status transition",
          status: "succeeded",
          providerRefundId: `mock_refund_${order.id}`,
          processedAt: new Date(),
        },
      });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "refunded" } });
      await releaseOrderReservations(tx, order.id, {
        restock: true,
        actorId: input.actor?.id,
        note: "Refund restock",
      });
      await enqueueNotification(
        {
          template: "order_refunded",
          toAddress: order.email,
          subject: `Refund issued for ${order.orderNumber}`,
          payload: { orderNumber: order.orderNumber, amountMinor: remaining },
        },
        tx,
      );
    }

    const timestamps: Prisma.OrderUpdateInput = {};
    if (input.to === "confirmed") timestamps.confirmedAt = new Date();
    if (input.to === "shipped") timestamps.shippedAt = new Date();
    if (input.to === "delivered") timestamps.deliveredAt = new Date();
    if (input.to === "cancelled") timestamps.cancelledAt = new Date();
    if (input.to === "refunded") {
      timestamps.refundedAt = new Date();
      timestamps.paymentStatus = "refunded";
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: input.to,
        ...timestamps,
      },
    });
    await tx.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: from,
        toStatus: input.to,
        note: input.note ?? null,
        actorId: input.actor?.id ?? null,
      },
    });
    if (input.to === "cancelled") {
      await enqueueNotification(
        {
          template: "order_cancelled",
          toAddress: order.email,
          subject: `Order ${order.orderNumber} cancelled`,
          payload: { orderNumber: order.orderNumber },
        },
        tx,
      );
    }
  });

  await recordAudit({
    actor: input.actor,
    action: `order.status.${input.to}`,
    entityType: "order",
    entityId: order.id,
    before: { status: from },
    after: { status: input.to },
  });

  return loadOrder(order.id);
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  const map: Record<OrderStatus, OrderStatus[]> = {
    pending: ["paid", "cancelled"],
    paid: ["confirmed", "refunded"],
    confirmed: ["shipped", "refunded"],
    shipped: ["delivered", "refunded"],
    delivered: ["refunded"],
    cancelled: [],
    refunded: [],
  };
  return map[from];
}

/** Partial/full refund. Full refunds restock inventory and close the order. */
export async function refundOrder(input: {
  orderId: string;
  amountMinor: number;
  reason?: string;
  actor: Actor;
  idempotencyKey?: string;
}): Promise<OrderWithDetails> {
  const order = await loadOrder(input.orderId);
  const payment = order.payments.find((p) => p.status === "succeeded" || p.status === "refunded");
  if (!payment) throw conflict("No successful payment to refund");
  if (input.amountMinor <= 0) throw badRequest("Refund amount must be positive");

  const already = order.refunds
    .filter((r) => r.status === "succeeded")
    .reduce((sum, r) => sum + r.amountMinor, 0);
  const remaining = order.totalMinor - already;
  if (input.amountMinor > remaining) {
    throw badRequest("Refund exceeds remaining refundable amount", { remainingMinor: remaining });
  }
  const isFull = input.amountMinor >= remaining;

  if (input.idempotencyKey) {
    const existing = await prisma.refund.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return loadOrder(order.id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.refund.create({
      data: {
        paymentId: payment.id,
        orderId: order.id,
        amountMinor: input.amountMinor,
        reason: input.reason ?? null,
        status: "succeeded",
        providerRefundId: `mock_refund_${newId("rf")}`,
        idempotencyKey: input.idempotencyKey ?? null,
        processedAt: new Date(),
      },
    });

    if (isFull) {
      await releaseOrderReservations(tx, order.id, {
        restock: true,
        actorId: input.actor.id,
        note: "Refund restock",
      });
      await tx.payment.updateMany({
        where: { orderId: order.id, status: "succeeded" },
        data: { status: "refunded" },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "refunded", paymentStatus: "refunded", refundedAt: new Date() },
      });
      await tx.orderStatusEvent.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: "refunded",
          note: input.reason ?? "Full refund",
          actorId: input.actor.id,
        },
      });
      await recordSellerRefundForOrder(tx, order.id, input.reason ?? "Full refund");
      await enqueueNotification(
        {
          template: "order_refunded",
          toAddress: order.email,
          subject: `Refund issued for ${order.orderNumber}`,
          payload: { orderNumber: order.orderNumber, amountMinor: input.amountMinor },
        },
        tx,
      );
    }
  });

  await recordAudit({
    actor: input.actor,
    action: isFull ? "order.refund.full" : "order.refund.partial",
    entityType: "order",
    entityId: order.id,
    before: { status: order.status },
    after: { status: isFull ? "refunded" : order.status, amountMinor: input.amountMinor },
  });

  return loadOrder(order.id);
}
