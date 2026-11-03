import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parse } from "../lib/validate.js";
import { getActor, requireActor } from "../lib/guards.js";
import { badRequest, notFound } from "../lib/errors.js";
import {
  addItem,
  applyCoupon,
  getCartView,
  mergeGuestCart,
  removeCoupon,
  removeItem,
  resolveCart,
  updateItem,
} from "../services/cart.js";
import { validateCoupon } from "../services/coupons.js";
import { itemPricing } from "../services/cart.js";

const CART_HEADER = "x-cart-token";

function tokenFrom(request: FastifyRequest): string | undefined {
  const header = request.headers[CART_HEADER];
  return typeof header === "string" && header.length > 0 ? header : undefined;
}

const itemSchema = z.object({
  variantId: z.string().min(1),
  mode: z.enum(["buy", "rent"]).default("buy"),
  quantity: z.number().int().min(1).max(20).default(1),
  rentalStart: z.coerce.date().optional().nullable(),
  rentalEnd: z.coerce.date().optional().nullable(),
});

const updateSchema = z.object({
  quantity: z.number().int().min(1).max(20).optional(),
  rentalStart: z.coerce.date().nullable().optional(),
  rentalEnd: z.coerce.date().nullable().optional(),
});

export async function cartRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/cart",
    { schema: { tags: ["Cart"], summary: "Create or return the active cart" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { cart } = await resolveCart(actor, tokenFrom(request), { create: true });
      const view = await getCartView(cart.id);
      if (view.cartToken) reply.header(CART_HEADER, view.cartToken);
      return reply.status(201).send({ data: view });
    },
  );

  app.get(
    "/cart",
    { schema: { tags: ["Cart"], summary: "Get the active cart" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { cart } = await resolveCart(actor, tokenFrom(request), { create: false });
      const view = await getCartView(cart.id);
      if (view.cartToken) reply.header(CART_HEADER, view.cartToken);
      return reply.send({ data: view });
    },
  );

  app.post(
    "/cart/items",
    { schema: { tags: ["Cart"], summary: "Add a variant to the cart" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { cart } = await resolveCart(actor, tokenFrom(request), { create: true });
      const input = parse(itemSchema, request.body);
      const view = await addItem(cart.id, input);
      if (view.cartToken) reply.header(CART_HEADER, view.cartToken);
      return reply.status(201).send({ data: view });
    },
  );

  app.patch(
    "/cart/items/:itemId",
    { schema: { tags: ["Cart"], summary: "Update quantity or rental window" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { cart } = await resolveCart(actor, tokenFrom(request), { create: false });
      const { itemId } = parse(z.object({ itemId: z.string().min(1) }), request.params);
      const view = await updateItem(cart.id, itemId, parse(updateSchema, request.body));
      if (view.cartToken) reply.header(CART_HEADER, view.cartToken);
      return reply.send({ data: view });
    },
  );

  app.delete(
    "/cart/items/:itemId",
    { schema: { tags: ["Cart"], summary: "Remove a cart item" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { cart } = await resolveCart(actor, tokenFrom(request), { create: false });
      const { itemId } = parse(z.object({ itemId: z.string().min(1) }), request.params);
      const view = await removeItem(cart.id, itemId);
      if (view.cartToken) reply.header(CART_HEADER, view.cartToken);
      return reply.send({ data: view });
    },
  );

  app.post(
    "/cart/coupon",
    { schema: { tags: ["Cart"], summary: "Apply a coupon to the cart" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { cart } = await resolveCart(actor, tokenFrom(request), { create: false });
      const { code } = parse(z.object({ code: z.string().min(1).max(64) }), request.body);
      const view = await applyCoupon(cart.id, code);
      if (view.cartToken) reply.header(CART_HEADER, view.cartToken);
      return reply.send({ data: view });
    },
  );

  app.delete(
    "/cart/coupon",
    { schema: { tags: ["Cart"], summary: "Remove the cart coupon" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const { cart } = await resolveCart(actor, tokenFrom(request), { create: false });
      const view = await removeCoupon(cart.id);
      if (view.cartToken) reply.header(CART_HEADER, view.cartToken);
      return reply.send({ data: view });
    },
  );

  app.post(
    "/cart/merge",
    { schema: { tags: ["Cart"], summary: "Merge a guest cart into the customer cart" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const input = parse(z.object({ cartToken: z.string().min(5) }), request.body);
      const view = await mergeGuestCart(actor, input.cartToken);
      return reply.send({ data: view });
    },
  );

  app.post(
    "/coupons/validate",
    { schema: { tags: ["Discounts"], summary: "Validate a coupon for the current cart" } },
    async (request, reply) => {
      const actor = await getActor(request);
      const body = parse(
        z.object({
          code: z.string().min(1).max(64),
          items: z
            .array(
              z.object({
                variantId: z.string().min(1),
                quantity: z.number().int().min(1).max(20).default(1),
                mode: z.enum(["buy", "rent"]).default("buy"),
                rentalStart: z.coerce.date().optional().nullable(),
                rentalEnd: z.coerce.date().optional().nullable(),
              }),
            )
            .max(50)
            .optional(),
        }),
        request.body,
      );

      let lines: Array<{ productId: string; categoryId: string; lineTotalMinor: number; quantity: number }> = [];
      if (body.items && body.items.length > 0) {
        for (const item of body.items) {
          const variant = await prisma.productVariant.findUnique({
            where: { id: item.variantId },
            include: { product: true },
          });
          if (!variant) throw notFound("Variant not found");
          const asCartItem = {
            id: "preview",
            cartId: "preview",
            productId: variant.productId,
            variantId: variant.id,
            mode: item.mode,
            quantity: item.quantity,
            rentalStart: item.rentalStart ?? null,
            rentalEnd: item.rentalEnd ?? null,
            addedPriceMinor: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            product: { ...variant.product, images: [] },
            variant,
          } as unknown as Parameters<typeof itemPricing>[0];
          const pricing = itemPricing(asCartItem);
          lines.push({
            productId: variant.productId,
            categoryId: variant.product.categoryId,
            lineTotalMinor: pricing.lineTotalMinor,
            quantity: item.quantity,
          });
        }
      } else {
        const resolved = await resolveCart(actor, tokenFrom(request), { create: false }).catch(() => null);
        if (!resolved) throw badRequest("Provide cart items or a cart token to validate a coupon");
        lines = resolved.cart.items.map((item) => ({
          productId: item.productId,
          categoryId: item.product.categoryId,
          lineTotalMinor: itemPricing(item).lineTotalMinor,
          quantity: item.quantity,
        }));
      }

      const validation = await validateCoupon(body.code, lines, {
        userId: actor?.id ?? null,
      });

      return reply.send({
        data: {
          valid: validation.valid,
          code: validation.code,
          reason: validation.reason,
          discountMinor: validation.discountMinor,
          eligibleSubtotalMinor: validation.eligibleSubtotalMinor,
          coupon: validation.coupon
            ? {
                code: validation.coupon.code,
                kind: validation.coupon.kind,
                value: validation.coupon.value,
                minSubtotalMinor: validation.coupon.minSubtotalMinor,
                endsAt: validation.coupon.endsAt,
              }
            : null,
        },
      });
    },
  );
}
