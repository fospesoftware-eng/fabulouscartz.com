import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { auth, createProduct, loginAs, makeApp, STAFF } from "./helpers.js";

let app: FastifyInstance;
let customerToken: string;

beforeAll(async () => {
  app = await makeApp();
  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: `rbac-${Date.now()}@example.com`,
      password: "Customer#2026",
      firstName: "Rbac",
    },
  });
  customerToken = registered.json().tokens.accessToken;
});

afterAll(async () => {
  await app.close();
});

describe("RBAC", () => {
  it("denies unauthenticated admin access", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/admin/products" });
    expect(response.statusCode).toBe(401);
  });

  it("denies customer access to admin routes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/orders",
      headers: auth(customerToken),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("denies fulfilment the product-create permission but allows order operations", async () => {
    const fulfilment = await loginAs(app, STAFF.fulfilment);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers: auth(fulfilment.accessToken),
      payload: {
        title: "Forbidden product",
        categoryId: "cat_womens",
        vendorId: "ven_omana",
        priceMinor: 1000,
        variants: [{ sku: `RBAC-${Date.now()}`, stockQuantity: 1 }],
      },
    });
    expect(create.statusCode).toBe(403);

    const orders = await app.inject({
      method: "GET",
      url: "/api/v1/admin/orders?pageSize=5",
      headers: auth(fulfilment.accessToken),
    });
    expect(orders.statusCode).toBe(200);
    expect(orders.json().meta.total).toBeGreaterThan(0);

    const lowStock = await app.inject({
      method: "GET",
      url: "/api/v1/admin/analytics/low-stock",
      headers: auth(fulfilment.accessToken),
    });
    expect(lowStock.statusCode).toBe(200);

    const summary = await app.inject({
      method: "GET",
      url: "/api/v1/admin/analytics/summary",
      headers: auth(fulfilment.accessToken),
    });
    expect(summary.statusCode).toBe(403);
  });

  it("allows managers to create products", async () => {
    const manager = await loginAs(app, STAFF.manager);
    const product = await createProduct(app, manager.accessToken, {
      variants: [
        {
          sku: `RBAC-MGR-${Date.now()}`,
          size: "M",
          priceMinor: 5000,
          stockQuantity: 4,
          lowStockThreshold: 2,
        },
      ],
    });
    expect(product.id).toBeTruthy();
  });

  it("rejects a token whose session was revoked", async () => {
    const session = await loginAs(app, STAFF.admin);
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: auth(session.accessToken),
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/products",
      headers: auth(session.accessToken),
    });
    expect(response.statusCode).toBe(401);
  });
});
