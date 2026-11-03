import type { Coupon } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";

export interface CouponLine {
  productId: string;
  categoryId: string;
  lineTotalMinor: number;
  quantity: number;
}

export interface CouponValidation {
  valid: boolean;
  code: string;
  coupon: Coupon | null;
  reason: string | null;
  discountMinor: number;
  eligibleSubtotalMinor: number;
}

interface RedeemContext {
  userId?: string | null;
  email?: string | null;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validate a coupon against a cart. Pure calculation + DB checks; the caller
 * applies the discount to totals. Dates and caps are enforced server-side.
 */
export async function validateCoupon(
  code: string,
  lines: CouponLine[],
  context: RedeemContext = {},
  now = new Date(),
): Promise<CouponValidation> {
  const coupon = await prisma.coupon.findUnique({ where: { code: normalizeCode(code) } });
  const base: CouponValidation = {
    valid: false,
    code: normalizeCode(code),
    coupon: null,
    reason: "Coupon not found",
    discountMinor: 0,
    eligibleSubtotalMinor: 0,
  };
  if (!coupon) return base;

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const eligibleLines = coupon.categoryId
    ? lines.filter((line) => line.categoryId === coupon.categoryId)
    : lines;
  const eligibleSubtotal = eligibleLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);

  const fail = (reason: string): CouponValidation => ({
    ...base,
    coupon,
    reason,
    eligibleSubtotalMinor: eligibleSubtotal,
  });

  if (!coupon.isActive) return fail("Coupon is not active");
  if (coupon.startsAt && coupon.startsAt > now) return fail("Coupon is not active yet");
  if (coupon.endsAt && coupon.endsAt < now) return fail("Coupon has expired");
  if (coupon.minSubtotalMinor > 0 && subtotal < coupon.minSubtotalMinor) {
    return fail(`Minimum spend of ${coupon.minSubtotalMinor / 100} not met`);
  }
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return fail("Coupon usage limit reached");
  }
  if (coupon.categoryId && eligibleSubtotal === 0) {
    return fail("Coupon does not apply to items in this cart");
  }

  if (context.email || context.userId) {
    const used = await prisma.couponRedemption.count({
      where: {
        couponId: coupon.id,
        OR: [
          ...(context.userId ? [{ userId: context.userId }] : []),
          ...(context.email ? [{ email: context.email.toLowerCase() }] : []),
        ],
      },
    });
    if (used >= coupon.perCustomerLimit) return fail("You have already used this coupon");
  }

  const discount =
    coupon.kind === "percent"
      ? Math.round((eligibleSubtotal * Math.min(Math.max(coupon.value, 0), 100)) / 100)
      : Math.min(coupon.value, eligibleSubtotal);

  return {
    valid: true,
    code: coupon.code,
    coupon,
    reason: null,
    discountMinor: Math.max(0, discount),
    eligibleSubtotalMinor: eligibleSubtotal,
  };
}

export async function validateOrThrow(
  code: string,
  lines: CouponLine[],
  context: RedeemContext = {},
): Promise<CouponValidation> {
  const result = await validateCoupon(code, lines, context);
  if (!result.valid) throw badRequest(result.reason ?? "Coupon is not valid", { code: result.code });
  return result;
}

export async function consumeCoupon(
  couponId: string,
  discountMinor: number,
  orderId: string,
  email: string,
  userId?: string | null,
): Promise<void> {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) throw notFound("Coupon not found");
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    throw conflict("Coupon usage limit reached");
  }
  await prisma.coupon.update({
    where: { id: couponId },
    data: { redemptionCount: { increment: 1 } },
  });
  await prisma.couponRedemption.create({
    data: {
      couponId,
      orderId,
      email: email.toLowerCase(),
      userId: userId ?? null,
      discountMinor,
    },
  });
}
