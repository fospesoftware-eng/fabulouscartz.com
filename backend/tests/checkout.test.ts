import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { getProvider } from "../src/services/payments/providers.js";
import {
  ADDRESS,
  auth,
  createProduct,
  getProduct,
  loginAs,
  makeApp,
  placeGuestOrder,
  STAFF,
} from "./helpers.js";

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
  app = await makeApp();
  adminToken = (await loginAs(app, STAFF.admin)).accessToken;
});

afterAll(async () => {
  await app.close();
});

describe("cart and coupons", () => {
  it("creates a guest cart and adds a variant", async () => {
    const product = await createProduct(app, adminToken);
    const cart = await app.inject({ method: "POST", url: "/api/v1/cart" });
    expect(cart.statusCode).toBe(201);
    const cartToken = cart.json().data.cartToken as string;

    const added = await app.inject({
      method: "POST",
      url: "/api/v1/cart/items",
      headers: { "x-cart-token": cartToken },
      payload: { variantId: product.variantId, mode: "buy", quantity: 2 },
    });
    expect(added.statusCode).toBe(201);
    const body = added.json().data;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].quantity).toBe(2);
    expect(body.totals.subtotalMinor).toBe(9000);

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/cart/items/${body.items[0].id}`,
      headers: { "x-cart-token": cartToken },
      payload: { quantity: 1 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.totals.subtotalMinor).toBe(4500);

    const missing = await app.inject({
      method: "POST",
      url: "/api/v1/cart/items",
      headers: { "x-cart-token": cartToken },
      payload: { variantId: "does-not-exist", mode: "buy", quantity: 1 },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("validates coupons: valid, unknown, min spend, category restriction", async () => {
    const product = await createProduct(app, adminToken);

    const valid = await app.inject({
      method: "POST",
      url: "/api/v1/coupons/validate",
      payload: { code: "FESTIVE20", items: [{ variantId: product.variantId, quantity: 1, mode: "buy" }] },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().data.valid).toBe(true);
    expect(valid.json().data.discountMinor).toBe(900);

    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/coupons/validate",
      payload: { code: "NOPE", items: [{ variantId: product.variantId, quantity: 1, mode: "buy" }] },
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json().data.valid).toBe(false);

    const cheap = await createProduct(app, adminToken, {
      priceMinor: 1000,
      variants: [
        {
          sku: `CHEAP-${Date.now()}`,
          size: "OS",
          priceMinor: 1000,
          stockQuantity: 5,
          lowStockThreshold: 1,
        },
      ],
    });
    const belowMinimum = await app.inject({
      method: "POST",
      url: "/api/v1/coupons/validate",
      payload: { code: "FESTIVE20", items: [{ variantId: cheap.variantId, quantity: 1, mode: "buy" }] },
    });
    expect(belowMinimum.json().data.valid).toBe(false);
    expect(belowMinimum.json().data.reason).toMatch(/minimum/i);

    const danceOnly = await app.inject({
      method: "POST",
      url: "/api/v1/coupons/validate",
      payload: { code: "DANCE15", items: [{ variantId: product.variantId, quantity: 2, mode: "buy" }] },
    });
    expect(danceOnly.json().data.valid).toBe(false);
  });

  it("applies and removes a coupon on the cart", async () => {
    const product = await createProduct(app, adminToken, {
      priceMinor: 5000,
      variants: [
        {
          sku: `CART-COUPON-${Date.now()}`,
          size: "M",
          priceMinor: 5000,
          stockQuantity: 8,
          lowStockThreshold: 2,
        },
      ],
    });
    const cart = await app.inject({ method: "POST", url: "/api/v1/cart" });
    const cartToken = cart.json().data.cartToken as string;
    await app.inject({
      method: "POST",
      url: "/api/v1/cart/items",
      headers: { "x-cart-token": cartToken },
      payload: { variantId: product.variantId, mode: "buy", quantity: 1 },
    });

    const applied = await app.inject({
      method: "POST",
      url: "/api/v1/cart/coupon",
      headers: { "x-cart-token": cartToken },
      payload: { code: "FESTIVE20" },
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().data.totals.discountMinor).toBe(1000);
    expect(applied.json().data.totals.totalMinor).toBe(5400);

    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/cart/coupon",
      headers: { "x-cart-token": cartToken },
      payload: { code: "DIWALI18" },
    });
    expect(rejected.statusCode).toBe(400);

    const removed = await app.inject({
      method: "DELETE",
      url: "/api/v1/cart/coupon",
      headers: { "x-cart-token": cartToken },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data.totals.discountMinor).toBe(0);
  });
});

describe("checkout, payment and order state machine", () => {
  it("reserves stock at checkout, decrements on payment and records the snapshot price", async () => {
    const product = await createProduct(app, adminToken);
    const order = await placeGuestOrder(app, product.variantId, { quantity: 2, couponCode: "FESTIVE20" });

    const reserved = await getProduct(app, product.slug);
    const variant = reserved.json().data.variants[0];
    expect(variant.stockQuantity).toBe(10);
    expect(variant.reservedQuantity).toBe(2);
    expect(variant.availableQuantity).toBe(8);

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${order.orderNumber}?email=wrong%40example.com`,
    });
    expect(detail.statusCode).toBe(403);

    const paid = await app.inject({
      method: "POST",
      url: `/api/v1/payments/${order.paymentId}/confirm`,
      payload: {},
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().data.status).toBe("paid");
    expect(paid.json().data.paymentStatus).toBe("succeeded");
    expect(paid.json().alreadyProcessed).toBe(false);

    const afterPayment = await getProduct(app, product.slug);
    const committed = afterPayment.json().data.variants[0];
    expect(committed.stockQuantity).toBe(8);
    expect(committed.reservedQuantity).toBe(0);

    const again = await app.inject({
      method: "POST",
      url: `/api/v1/payments/${order.paymentId}/confirm`,
      payload: {},
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().alreadyProcessed).toBe(true);

    const afterSecondConfirm = await getProduct(app, product.slug);
    expect(afterSecondConfirm.json().data.variants[0].stockQuantity).toBe(8);

    const view = await app.inject({
      method: "GET",
      url: `/api/v1/admin/orders/${order.orderId}`,
      headers: auth(adminToken),
    });
    expect(view.statusCode).toBe(200);
    const placed = view.json().data;
    expect(placed.items[0].unitPriceMinor).toBe(4500);
    expect(placed.items[0].lineTotalMinor).toBe(9000);
    expect(placed.status).toBe("paid");
  });

  it("enforces allowed order transitions", async () => {
    const product = await createProduct(app, adminToken);
    const order = await placeGuestOrder(app, product.variantId);

    const illegalFromPending = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.orderId}/status`,
      headers: auth(adminToken),
      payload: { status: "confirmed" },
    });
    expect(illegalFromPending.statusCode).toBe(409);

    await app.inject({ method: "POST", url: `/api/v1/payments/${order.paymentId}/confirm`, payload: {} });

    const confirmed = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.orderId}/status`,
      headers: auth(adminToken),
      payload: { status: "confirmed" },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().allowedTransitions).toEqual(["shipped", "refunded"]);

    const shipped = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.orderId}/status`,
      headers: auth(adminToken),
      payload: { status: "shipped" },
    });
    expect(shipped.statusCode).toBe(200);

    const delivered = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.orderId}/status`,
      headers: auth(adminToken),
      payload: { status: "delivered" },
    });
    expect(delivered.statusCode).toBe(200);

    const backwards = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.orderId}/status`,
      headers: auth(adminToken),
      payload: { status: "confirmed" },
    });
    expect(backwards.statusCode).toBe(409);

    const directRefund = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.orderId}/status`,
      headers: auth(adminToken),
      payload: { status: "refunded" },
    });
    expect(directRefund.statusCode).toBe(400);

    const timeline = await app.inject({
      method: "GET",
      url: `/api/v1/orders/${order.orderNumber}/status`,
    });
    // no email supplied: access denied for guest order
    expect(timeline.statusCode).toBe(403);
  });

  it("cancelling a pending order releases the reservation", async () => {
    const product = await createProduct(app, adminToken);
    const order = await placeGuestOrder(app, product.variantId, { quantity: 2 });

    const cancel = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/orders/${order.orderId}/status`,
      headers: auth(adminToken),
      payload: { status: "cancelled", note: "Buyer changed their mind" },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().data.status).toBe("cancelled");

    const after = await getProduct(app, product.slug);
    expect(after.json().data.variants[0].reservedQuantity).toBe(0);
    expect(after.json().data.variants[0].stockQuantity).toBe(10);
  });

  it("fails fast when a live provider has no credentials", async () => {
    const enable = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/settings/payments",
      headers: auth(adminToken),
      payload: { razorpay: true },
    });
    expect(enable.statusCode).toBe(200);

    const product = await createProduct(app, adminToken);
    const cart = await app.inject({ method: "POST", url: "/api/v1/cart" });
    const cartToken = cart.json().data.cartToken as string;
    await app.inject({
      method: "POST",
      url: "/api/v1/cart/items",
      headers: { "x-cart-token": cartToken },
      payload: { variantId: product.variantId, mode: "buy", quantity: 1 },
    });

    const checkout = await app.inject({
      method: "POST",
      url: "/api/v1/checkout",
      headers: { "x-cart-token": cartToken },
      payload: { email: "provider-test@example.com", shippingAddress: ADDRESS, paymentMethod: "razorpay" },
    });
    expect(checkout.statusCode).toBe(201);
    const intent = await app.inject({
      method: "POST",
      url: "/api/v1/payments/intents",
      payload: {
        orderId: checkout.json().data.id,
        provider: "razorpay",
        email: "provider-test@example.com",
      },
    });
    expect(intent.statusCode).toBe(201);
    expect(intent.json().payment.provider).toBe("razorpay");

    await expect(
      getProvider("razorpay").createIntent({
        orderId: checkout.json().data.id,
        orderNumber: checkout.json().data.orderNumber,
        amountMinor: 4500,
        currency: "INR",
        email: "provider-test@example.com",
      }),
    ).rejects.toMatchObject({ statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });

    const providers = await app.inject({ method: "GET", url: "/api/v1/payments/providers" });
    expect(providers.json().data).toEqual(["mock", "razorpay", "phonepe", "upi", "card"]);

    await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/settings/payments",
      headers: auth(adminToken),
      payload: { razorpay: false },
    });
  });

  it("blocks checkout with an empty cart", async () => {
    const cart = await app.inject({ method: "POST", url: "/api/v1/cart" });
    const cartToken = cart.json().data.cartToken as string;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/checkout",
      headers: { "x-cart-token": cartToken },
      payload: { email: "empty@example.com", shippingAddress: ADDRESS, paymentMethod: "mock" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("BAD_REQUEST");
  });
});
