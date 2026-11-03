import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { conflict, notFound } from "../lib/errors.js";

type Db = Prisma.TransactionClient | typeof prisma;

export async function availableForBuy(
  variantId: string,
  client: Db = prisma,
  excludeCartId?: string,
): Promise<number> {
  const variant = await client.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw notFound("Variant not found");
  return Math.max(0, variant.stockQuantity - variant.reservedQuantity);
}

/**
 * Rental availability counts active reservations whose window overlaps the
 * requested window. Stock already committed (paid) has been decremented and is
 * therefore excluded from stockQuantity.
 */
export async function availableForRental(
  variantId: string,
  startsAt: Date,
  endsAt: Date,
  client: Db = prisma,
  excludeCartId?: string,
): Promise<number> {
  const variant = await client.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw notFound("Variant not found");

  const overlapping = await client.stockReservation.aggregate({
    where: {
      variantId,
      status: "active",
      ...(excludeCartId ? { cartId: { not: excludeCartId } } : {}),
      OR: [
        { startsAt: null },
        {
          startsAt: { lte: endsAt },
          endsAt: { gte: startsAt },
        },
      ],
    },
    _sum: { quantity: true },
  });
  return Math.max(0, variant.stockQuantity - (overlapping._sum.quantity ?? 0));
}

export async function assertStock(
  variantId: string,
  mode: "buy" | "rent",
  quantity: number,
  startsAt?: Date | null,
  endsAt?: Date | null,
): Promise<void> {
  if (quantity < 1) throw conflict("Quantity must be at least 1");
  if (mode === "rent") {
    if (!startsAt || !endsAt) throw conflict("Rental windows are required");
    const available = await availableForRental(variantId, startsAt, endsAt);
    if (available < quantity) {
      throw conflict(`Only ${available} unit(s) available for the selected rental window`, {
        variantId,
        available,
      });
    }
    return;
  }
  const available = await availableForBuy(variantId);
  if (available < quantity) {
    throw conflict(`Only ${available} unit(s) in stock`, { variantId, available });
  }
}

/** Create an active reservation for checkout (inside a transaction). */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  input: {
    variantId: string;
    orderId?: string;
    cartId?: string;
    quantity: number;
    startsAt?: Date | null;
    endsAt?: Date | null;
  },
): Promise<void> {
  await tx.stockReservation.create({
    data: {
      variantId: input.variantId,
      orderId: input.orderId ?? null,
      cartId: input.cartId ?? null,
      quantity: input.quantity,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      status: "active",
    },
  });
  await tx.productVariant.update({
    where: { id: input.variantId },
    data: { reservedQuantity: { increment: input.quantity } },
  });
}

/** Commit reservations on payment: stock leaves the shelf, reserved clears. */
export async function commitOrderReservations(
  tx: Prisma.TransactionClient,
  orderId: string,
  actorId?: string | null,
): Promise<void> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, status: "active" },
  });
  for (const reservation of reservations) {
    const variant = await tx.productVariant.findUnique({ where: { id: reservation.variantId } });
    if (!variant) continue;
    const after = variant.stockQuantity - reservation.quantity;
    if (after < 0) {
      throw conflict("Inventory changed while completing payment; refund required", {
        variantId: variant.id,
        requested: reservation.quantity,
        available: variant.stockQuantity,
      });
    }
    await tx.productVariant.update({
      where: { id: variant.id },
      data: {
        stockQuantity: { decrement: reservation.quantity },
        reservedQuantity: { decrement: reservation.quantity },
      },
    });
    await tx.stockAdjustment.create({
      data: {
        variantId: variant.id,
        delta: -reservation.quantity,
        reason: "sale",
        note: `Order ${orderId} paid`,
        beforeQuantity: variant.stockQuantity,
        afterQuantity: after,
        actorId: actorId ?? null,
      },
    });
    await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { status: "committed" },
    });
  }
}

/**
 * Release reservations when an order is cancelled before payment, or restock
 * committed units when a paid order is refunded.
 */
export async function releaseOrderReservations(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts: { restock: boolean; actorId?: string | null; note?: string },
): Promise<void> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId, status: { in: ["active", "committed"] } },
  });
  for (const reservation of reservations) {
    const variant = await tx.productVariant.findUnique({ where: { id: reservation.variantId } });
    if (!variant) continue;

    if (reservation.status === "active") {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { reservedQuantity: { decrement: reservation.quantity } },
      });
    } else if (opts.restock) {
      const after = variant.stockQuantity + reservation.quantity;
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { stockQuantity: { increment: reservation.quantity } },
      });
      await tx.stockAdjustment.create({
        data: {
          variantId: variant.id,
          delta: reservation.quantity,
          reason: "return",
          note: opts.note ?? `Order ${orderId} refunded`,
          beforeQuantity: variant.stockQuantity,
          afterQuantity: after,
          actorId: opts.actorId ?? null,
        },
      });
    }
    await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { status: "released", releasedAt: new Date() },
    });
  }
}

/** Manual adjustment with an immutable audit row. */
export async function adjustStock(input: {
  variantId: string;
  delta: number;
  reason: string;
  note?: string;
  actorId?: string | null;
}): Promise<{ before: number; after: number }> {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({ where: { id: input.variantId } });
    if (!variant) throw notFound("Variant not found");
    const before = variant.stockQuantity;
    const after = before + input.delta;
    if (after < 0) throw conflict("Adjustment would result in negative stock", { before, delta: input.delta });

    await tx.productVariant.update({
      where: { id: variant.id },
      data: { stockQuantity: after },
    });
    await tx.stockAdjustment.create({
      data: {
        variantId: variant.id,
        delta: input.delta,
        reason: input.reason,
        note: input.note ?? null,
        beforeQuantity: before,
        afterQuantity: after,
        actorId: input.actorId ?? null,
      },
    });
    return { before, after };
  });
}
