import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { config } from "../src/config.js";
import { auth, createProduct, getProduct, loginAs, makeApp, placeGuestOrder, STAFF } from "./helpers.js";

let app: FastifyInstance;
let adminToken: string;

beforeAll(async () => {
  app = await makeApp();
  adminToken = (await loginAs(app, STAFF.admin)).accessToken;
});

afterAll(async () => {
  await app.close();
});

function sign(rawBody: string): string {
  return crypto.createHmac("sha256", config.MOCK_WEBHOOK_SECRET).update(rawBody).digest("hex");
}

async function sendWebhook(body: unknown, signature: string) {
  const rawBody = JSON.stringify(body);
  return app.inject({
    method: "POST",
    url: "/api/v1/webhooks/payments/mock",
    headers: { "content-type": "application/json", "x-webhook-signature": signature },
    payload: rawBody,
  });
}

describe("payment webhooks", () => {
  it("rejects an invalid signature", async () => {
    const product = await createProduct(app, adminToken);
    const order = await placeGuestOrder(app, product.variantId);
    const response = await sendWebhook(
      { eventId: `bad-${Date.now()}`, type: "payment.succeeded", paymentId: order.paymentId },
      "deadbeef",
    );
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_SIGNATURE");
  });

  it("settles a payment exactly once across duplicate webhook deliveries", async () => {
    const product = await createProduct(app, adminToken);
    const order = await placeGuestOrder(app, product.variantId, { quantity: 2 });

    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const payload = {
      eventId,
      type: "payment.succeeded",
      paymentId: order.paymentId,
      amountMinor: order.totalMinor,
    };
    const rawBody = JSON.stringify(payload);

    const first = await sendWebhook(payload, sign(rawBody));
    expect(first.statusCode).toBe(200);
    expect(first.json().duplicate).toBe(false);

    const afterFirst = await getProduct(app, product.slug);
    expect(afterFirst.json().data.variants[0].stockQuantity).toBe(8);
    expect(afterFirst.json().data.variants[0].reservedQuantity).toBe(0);

    const orderView = await app.inject({
      method: "GET",
      url: `/api/v1/admin/orders/${order.orderId}`,
      headers: auth(adminToken),
    });
    expect(orderView.json().data.status).toBe("paid");
    expect(orderView.json().data.paymentStatus).toBe("succeeded");

    const second = await sendWebhook(payload, sign(rawBody));
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);

    const afterSecond = await getProduct(app, product.slug);
    expect(afterSecond.json().data.variants[0].stockQuantity).toBe(8);
  });

  it("records a failed payment webhook without settling the order", async () => {
    const product = await createProduct(app, adminToken);
    const order = await placeGuestOrder(app, product.variantId);

    const payload = {
      eventId: `fail-${Date.now()}`,
      type: "payment.failed",
      paymentId: order.paymentId,
      reason: "Card declined",
    };
    const rawBody = JSON.stringify(payload);
    const response = await sendWebhook(payload, sign(rawBody));
    expect(response.statusCode).toBe(200);

    const orderView = await app.inject({
      method: "GET",
      url: `/api/v1/admin/orders/${order.orderId}`,
      headers: auth(adminToken),
    });
    expect(orderView.json().data.paymentStatus).toBe("failed");
    expect(orderView.json().data.status).toBe("pending");
  });
});
