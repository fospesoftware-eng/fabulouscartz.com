import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { cartToken as makeCartToken, CART_MODES } from "../lib/constants.js";
import { rentalDays, rentalPriceMinor, depositForProduct } from "../lib/money.js";
import { assertStock, availableForBuy } from "./inventory.js";
import { computeTaxAndShipping } from "./pricing.js";
import { validateCoupon } from "./coupons.js";
import type { Actor } from "../lib/guards.js";

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          category: true,
          vendor: true,
        },
      },
      variant: true,
    },
    orderBy: { createdAt: "asc" },
  },
  coupon: true,
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CartItemWithProduct = CartWithItems["items"][number];

function itemPricing(item: CartItemWithProduct) {
  if (item.mode === "rent" && item.rentalStart && item.rentalEnd) {
    const days = rentalDays(item.rentalStart, item.rentalEnd);
    const unit = rentalPriceMinor(item.product, days);
    const deposit = depositForProduct(item.product, item.variant);
    return {
      rentalDays: days,
      depositMinor: deposit,
      unitPriceMinor: unit,
      lineTotalMinor: (unit + deposit) * item.quantity,
    };
  }
  const unit = item.variant.priceMinor ?? item.product.priceMinor;
  return {
    rentalDays: null,
    depositMinor: 0,
    unitPriceMinor: unit,
    lineTotalMinor: unit * item.quantity,
  };
}

export interface CartView {
  id: string;
  cartToken: string | null;
  status: string;
  currency: string;
  userId: string | null;
  items: Array<{
    id: string;
    productId: string;
    variantId: string;
    slug: string;
    title: string;
    image: string | null;
    sku: string;
    size: string | null;
    color: string | null;
    mode: string;
    quantity: number;
    rentalStart: Date | null;
    rentalEnd: Date | null;
    unitPriceMinor: number;
    depositMinor: number;
    lineTotalMinor: number;
  }>;
  coupon: {
    code: string | null;
    valid: boolean;
    reason: string | null;
    discountMinor: number;
  };
  totals: {
    itemCount: number;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    shippingMinor: number;
    depositMinor: number;
    totalMinor: number;
    currency: string;
  };
  expiresAt: Date | null;
}

export async function buildCartView(cart: CartWithItems): Promise<CartView> {
  const lines = cart.items.map((item) => {
    const pricing = itemPricing(item);
    return {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      slug: item.product.slug,
      title: item.product.title,
      image: item.product.images[0]?.url ?? null,
      sku: item.variant.sku,
      size: item.variant.size,
      color: item.variant.color,
      mode: item.mode,
      quantity: item.quantity,
      rentalStart: item.rentalStart,
      rentalEnd: item.rentalEnd,
      unitPriceMinor: pricing.unitPriceMinor,
      depositMinor: pricing.depositMinor,
      lineTotalMinor: pricing.lineTotalMinor,
    };
  });

  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const depositMinor = lines.reduce((sum, line) => sum + line.depositMinor * line.quantity, 0);

  let discountMinor = 0;
  let couponValid = false;
  let couponReason: string | null = cart.coupon ? null : "No coupon applied";
  if (cart.coupon) {
    const validation = await validateCoupon(
      cart.coupon.code,
      cart.items.map((item) => ({
        productId: item.productId,
        categoryId: item.product.categoryId,
        lineTotalMinor: itemPricing(item).lineTotalMinor,
        quantity: item.quantity,
      })),
      { userId: cart.userId },
    );
    couponValid = validation.valid;
    couponReason = validation.reason;
    if (validation.valid) discountMinor = validation.discountMinor;
  }

  const taxableSubtotal = Math.max(0, subtotalMinor - discountMinor);
  const { taxMinor, shippingMinor } = await computeTaxAndShipping(taxableSubtotal);

  return {
    id: cart.id,
    cartToken: cart.guestToken,
    status: cart.status,
    currency: cart.currency,
    userId: cart.userId,
    items: lines,
    coupon: {
      code: cart.coupon?.code ?? null,
      valid: couponValid,
      reason: couponReason,
      discountMinor,
    },
    totals: {
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotalMinor,
      discountMinor,
      taxMinor,
      shippingMinor,
      depositMinor,
      totalMinor: Math.max(0, taxableSubtotal + taxMinor + shippingMinor),
      currency: cart.currency,
    },
    expiresAt: cart.expiresAt,
  };
}

async function loadCart(id: string): Promise<CartWithItems> {
  const cart = await prisma.cart.findUnique({ where: { id }, include: cartInclude });
  if (!cart) throw notFound("Cart not found");
  return cart;
}

export async function getCartView(id: string): Promise<CartView> {
  return buildCartView(await loadCart(id));
}

/**
 * Resolve the active cart for the caller. Logged-in customers use their user
 * cart; guests use the x-cart-token header. With create=true a new cart is
 * minted (guest token included in the response).
 */
export async function resolveCart(
  actor: Actor | null,
  guestToken: string | undefined,
  opts: { create: boolean },
): Promise<{ cart: CartWithItems; created: boolean }> {
  if (actor) {
    const existing = await prisma.cart.findFirst({
      where: { userId: actor.id, status: "active" },
      include: cartInclude,
      orderBy: { updatedAt: "desc" },
    });
    if (existing) {
      if (existing.expiresAt && existing.expiresAt < new Date()) {
        await prisma.cart.update({ where: { id: existing.id }, data: { status: "abandoned" } });
      } else {
        return { cart: existing, created: false };
      }
    }
    if (!opts.create) throw notFound("No active cart");
    const created = await prisma.cart.create({
      data: {
        userId: actor.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      include: cartInclude,
    });
    return { cart: created, created: true };
  }

  if (guestToken) {
    const existing = await prisma.cart.findUnique({ where: { guestToken }, include: cartInclude });
    if (existing && existing.status === "active") {
      if (existing.expiresAt && existing.expiresAt < new Date()) {
        await prisma.cart.update({ where: { id: existing.id }, data: { status: "abandoned" } });
      } else {
        return { cart: existing, created: false };
      }
    }
  }
  if (!opts.create) throw notFound("No active cart");
  const created = await prisma.cart.create({
    data: {
      guestToken: makeCartToken(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    include: cartInclude,
  });
  return { cart: created, created: true };
}

export async function addItem(
  cartId: string,
  input: {
    variantId: string;
    mode: "buy" | "rent";
    quantity: number;
    rentalStart?: Date | null;
    rentalEnd?: Date | null;
  },
): Promise<CartView> {
  if (!CART_MODES.includes(input.mode)) throw badRequest("mode must be buy or rent");

  const variant = await prisma.productVariant.findUnique({
    where: { id: input.variantId },
    include: { product: true },
  });
  if (!variant || !variant.isActive) throw notFound("Variant not found");
  if (variant.product.status !== "active") throw conflict("Product is not available");
  if (input.mode === "buy" && !variant.product.buyEnabled) throw conflict("This product is not available for purchase");
  if (input.mode === "rent" && !variant.product.rentEnabled) throw conflict("This product is not available for rental");
  if (input.mode === "rent" && (!input.rentalStart || !input.rentalEnd)) {
    throw badRequest("rentalStart and rentalEnd are required for rentals");
  }
  if (input.rentalStart && input.rentalEnd) {
    if (input.rentalEnd <= input.rentalStart) throw badRequest("rentalEnd must be after rentalStart");
    if (input.rentalStart < new Date(Date.now() - 60 * 1000)) throw badRequest("rentalStart must be in the future");
    const days = rentalDays(input.rentalStart, input.rentalEnd);
    if (days > 60) throw badRequest("Rental windows are limited to 60 days");
  }

  await assertStock(
    input.variantId,
    input.mode,
    input.quantity,
    input.rentalStart ?? null,
    input.rentalEnd ?? null,
  );

  const existing = await prisma.cartItem.findFirst({
    where: {
      cartId,
      variantId: input.variantId,
      mode: input.mode,
      rentalStart: input.rentalStart ?? null,
      rentalEnd: input.rentalEnd ?? null,
    },
  });

  const unitPrice =
    input.mode === "rent" && input.rentalStart && input.rentalEnd
      ? rentalPriceMinor(variant.product, rentalDays(input.rentalStart, input.rentalEnd))
      : variant.priceMinor ?? variant.product.priceMinor;

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: { increment: input.quantity }, addedPriceMinor: unitPrice },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId,
        productId: variant.productId,
        variantId: variant.id,
        mode: input.mode,
        quantity: input.quantity,
        rentalStart: input.rentalStart ?? null,
        rentalEnd: input.rentalEnd ?? null,
        addedPriceMinor: unitPrice,
      },
    });
  }

  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  return getCartView(cartId);
}

export async function updateItem(
  cartId: string,
  itemId: string,
  input: { quantity?: number; rentalStart?: Date | null; rentalEnd?: Date | null },
): Promise<CartView> {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId } });
  if (!item) throw notFound("Cart item not found");

  const nextStart = input.rentalStart !== undefined ? input.rentalStart : item.rentalStart;
  const nextEnd = input.rentalEnd !== undefined ? input.rentalEnd : item.rentalEnd;
  const nextQty = input.quantity ?? item.quantity;

  if (item.mode === "rent") {
    if (!nextStart || !nextEnd) throw badRequest("Rental window is required");
    if (nextEnd <= nextStart) throw badRequest("rentalEnd must be after rentalStart");
  }

  await assertStock(
    item.variantId,
    item.mode as "buy" | "rent",
    nextQty,
    nextStart,
    nextEnd,
  );

  await prisma.cartItem.update({
    where: { id: item.id },
    data: {
      quantity: nextQty,
      rentalStart: nextStart,
      rentalEnd: nextEnd,
    },
  });
  await prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  return getCartView(cartId);
}

export async function removeItem(cartId: string, itemId: string): Promise<CartView> {
  const deleted = await prisma.cartItem.deleteMany({ where: { id: itemId, cartId } });
  if (deleted.count === 0) throw notFound("Cart item not found");
  return getCartView(cartId);
}

export async function applyCoupon(cartId: string, code: string): Promise<CartView> {
  const cart = await loadCart(cartId);
  if (cart.items.length === 0) throw badRequest("Cart is empty");
  const validation = await validateCoupon(
    code,
    cart.items.map((item) => ({
      productId: item.productId,
      categoryId: item.product.categoryId,
      lineTotalMinor: itemPricing(item).lineTotalMinor,
      quantity: item.quantity,
    })),
    { userId: cart.userId },
  );
  if (!validation.valid || !validation.coupon) {
    throw badRequest(validation.reason ?? "Coupon is not valid", { code });
  }
  await prisma.cart.update({ where: { id: cartId }, data: { couponId: validation.coupon.id } });
  return getCartView(cartId);
}

export async function removeCoupon(cartId: string): Promise<CartView> {
  await prisma.cart.update({ where: { id: cartId }, data: { couponId: null } });
  return getCartView(cartId);
}

/** Merge a guest cart into the authenticated customer's cart. */
export async function mergeGuestCart(actor: Actor, token: string): Promise<CartView> {
  const guest = await prisma.cart.findUnique({ where: { guestToken: token }, include: cartInclude });
  if (!guest || guest.status !== "active") throw notFound("Guest cart not found");
  const { cart: target } = await resolveCart(actor, undefined, { create: true });

  for (const item of guest.items) {
    const existing = target.items.find(
      (candidate) =>
        candidate.variantId === item.variantId &&
        candidate.mode === item.mode &&
        sameDate(candidate.rentalStart, item.rentalStart) &&
        sameDate(candidate.rentalEnd, item.rentalEnd),
    );
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + item.quantity },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: target.id,
          productId: item.productId,
          variantId: item.variantId,
          mode: item.mode,
          quantity: item.quantity,
          rentalStart: item.rentalStart,
          rentalEnd: item.rentalEnd,
          addedPriceMinor: item.addedPriceMinor,
        },
      });
    }
  }

  if (guest.couponId && !target.couponId) {
    await prisma.cart.update({ where: { id: target.id }, data: { couponId: guest.couponId } });
  }
  await prisma.cart.update({ where: { id: guest.id }, data: { status: "abandoned" } });
  return getCartView(target.id);
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

export { itemPricing };
