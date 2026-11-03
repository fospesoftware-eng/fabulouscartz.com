import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { auth, createProduct, loginAs, makeApp, STAFF } from "./helpers.js";

let app: FastifyInstance;
let managerToken: string;

beforeAll(async () => {
  app = await makeApp();
  managerToken = (await loginAs(app, STAFF.manager)).accessToken;
});

afterAll(async () => {
  await app.close();
});

describe("catalogue", () => {
  it("lists the seeded storefront catalogue with pagination metadata", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/products?pageSize=5" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(5);
    expect(body.meta.page).toBe(1);
    expect(body.meta.pageSize).toBe(5);
    expect(body.meta.total).toBeGreaterThanOrEqual(19);
    expect(body.meta.totalPages).toBeGreaterThanOrEqual(4);
  });

  it("filters by category, vendor, mode and price and sorts", async () => {
    const byCategory = await app.inject({
      method: "GET",
      url: "/api/v1/products?category=handmade-jewelry&pageSize=50",
    });
    expect(byCategory.statusCode).toBe(200);
    for (const product of byCategory.json().data) {
      expect(product.category.slug).toBe("handmade-jewelry");
    }

    const byVendor = await app.inject({
      method: "GET",
      url: "/api/v1/products?vendor=viya-crafts&pageSize=50",
    });
    expect(byVendor.statusCode).toBe(200);
    expect(byVendor.json().data.length).toBeGreaterThan(0);
    for (const product of byVendor.json().data) {
      expect(product.vendor.slug).toBe("viya-crafts");
    }

    const rentals = await app.inject({ method: "GET", url: "/api/v1/products?mode=rent&pageSize=50" });
    expect(rentals.statusCode).toBe(200);
    for (const product of rentals.json().data) {
      expect(product.rentEnabled).toBe(true);
    }

    const cheapest = await app.inject({
      method: "GET",
      url: "/api/v1/products?maxPrice=20&sort=price_asc&pageSize=50",
    });
    expect(cheapest.statusCode).toBe(200);
    const prices = cheapest.json().data.map((product: { priceMinor: number }) => product.priceMinor);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    for (const price of prices) expect(price).toBeLessThanOrEqual(2000);
  });

  it("searches by keyword and requires a query", async () => {
    const search = await app.inject({ method: "GET", url: "/api/v1/search?q=lehenga" });
    expect(search.statusCode).toBe(200);
    expect(search.json().data.length).toBeGreaterThan(0);

    const missing = await app.inject({ method: "GET", url: "/api/v1/search" });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe("BAD_REQUEST");
  });

  it("exposes categories, vendors, banners and published posts", async () => {
    const categories = await app.inject({ method: "GET", url: "/api/v1/categories" });
    expect(categories.statusCode).toBe(200);
    expect(categories.json().data).toHaveLength(6);

    const vendors = await app.inject({ method: "GET", url: "/api/v1/vendors" });
    expect(vendors.statusCode).toBe(200);
    expect(vendors.json().data.length).toBeGreaterThanOrEqual(6);

    const banners = await app.inject({ method: "GET", url: "/api/v1/banners" });
    expect(banners.statusCode).toBe(200);
    expect(banners.json().data.length).toBeGreaterThan(0);

    const posts = await app.inject({ method: "GET", url: "/api/v1/posts" });
    expect(posts.statusCode).toBe(200);
    expect(posts.json().data.length).toBeGreaterThan(0);
  });

  it("supports admin product CRUD with visibility rules", async () => {
    const product = await createProduct(app, managerToken, { status: "draft" });

    const publicDraft = await app.inject({ method: "GET", url: `/api/v1/products/${product.slug}` });
    expect(publicDraft.statusCode).toBe(404);

    const adminDetail = await app.inject({
      method: "GET",
      url: `/api/v1/admin/products/${product.id}`,
      headers: auth(managerToken),
    });
    expect(adminDetail.statusCode).toBe(200);
    expect(adminDetail.json().data.status).toBe("draft");

    const publish = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/products/${product.id}`,
      headers: auth(managerToken),
      payload: { status: "active", title: `${product.slug} published`, priceMinor: 5500 },
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().data.status).toBe("active");

    const publicLive = await app.inject({ method: "GET", url: `/api/v1/products/${product.slug}` });
    expect(publicLive.statusCode).toBe(200);
    expect(publicLive.json().data.priceMinor).toBe(5500);

    const archive = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/products/${product.id}`,
      headers: auth(managerToken),
      payload: { status: "archived" },
    });
    expect(archive.statusCode).toBe(200);

    const publicArchived = await app.inject({ method: "GET", url: `/api/v1/products/${product.slug}` });
    expect(publicArchived.statusCode).toBe(404);
  });

  it("adjusts variant stock and records an audit entry", async () => {
    const admin = await loginAs(app, STAFF.admin);
    const product = await createProduct(app, admin.accessToken, {
      variants: [
        {
          sku: `STOCK-${Date.now()}`,
          size: "M",
          priceMinor: 4500,
          stockQuantity: 5,
          lowStockThreshold: 2,
        },
      ],
    });

    const adjust = await app.inject({
      method: "POST",
      url: "/api/v1/admin/inventory/adjustments",
      headers: auth(admin.accessToken),
      payload: { variantId: product.variantId, delta: 7, reason: "restock", note: "Restock" },
    });
    expect(adjust.statusCode).toBe(201);
    const body = adjust.json();
    expect(body.data.after).toBe(12);

    const adjustments = await app.inject({
      method: "GET",
      url: `/api/v1/admin/inventory/adjustments?variantId=${product.variantId}`,
      headers: auth(admin.accessToken),
    });
    expect(adjustments.statusCode).toBe(200);
    expect(adjustments.json().meta.total).toBeGreaterThanOrEqual(2);

    const lowStock = await app.inject({
      method: "GET",
      url: "/api/v1/admin/inventory?lowOnly=true",
      headers: auth(admin.accessToken),
    });
    expect(lowStock.statusCode).toBe(200);
  });

  it("validates admin input with zod", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers: auth(managerToken),
      payload: { title: "x", priceMinor: -1 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(response.json().error.details)).toBe(true);
  });
});
