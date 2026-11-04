import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { auth, loginAs, STAFF, type LoginResult } from "./helpers.js";

let app: FastifyInstance;
let admin: LoginResult;
let manager: LoginResult;
let fulfilment: LoginResult;
let customer: LoginResult;

async function geo(token: string, query = "") {
  const response = await app.inject({
    method: "GET",
    url: `/api/v1/admin/analytics/geo${query}`,
    headers: auth(token),
  });
  return response;
}

beforeAll(async () => {
  app = await buildApp();
  admin = await loginAs(app, STAFF.admin);
  manager = await loginAs(app, STAFF.manager);
  fulfilment = await loginAs(app, STAFF.fulfilment);
  customer = await loginAs(app, {
    email: "ananya.raghavan@example.com",
    password: "Customer#2026",
  });
});

afterAll(async () => {
  await app.close();
});

describe("GET /admin/analytics/geo", () => {
  it("returns per-state rows with both datasets, totals and exclusions", async () => {
    const response = await geo(admin.accessToken);
    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    for (const row of body.data) {
      expect(row).toMatchObject({
        stateCode: expect.any(String),
        stateName: expect.any(String),
        orderCount: expect.any(Number),
        orderRevenueMinor: expect.any(Number),
        bookingCount: expect.any(Number),
        bookingRevenueMinor: expect.any(Number),
      });
      expect(row.stateCode).toMatch(/^[A-Z]{2}$/);
    }

    const byCode = new Map(body.data.map((row: { stateCode: string }) => [row.stateCode, row]));
    expect(byCode.get("CA")).toBeTruthy();
    expect(byCode.get("NY")).toBeTruthy();
    expect(byCode.get("TX")).toBeTruthy();

    expect(body.data.some((row: { orderCount: number }) => row.orderCount > 0)).toBe(true);
    expect(body.data.some((row: { bookingCount: number }) => row.bookingCount > 0)).toBe(true);

    const sum = body.data.reduce(
      (acc: { orders: number; revenue: number; bookings: number; bookingRevenue: number }, row: { orderCount: number; orderRevenueMinor: number; bookingCount: number; bookingRevenueMinor: number }) => ({
        orders: acc.orders + row.orderCount,
        revenue: acc.revenue + row.orderRevenueMinor,
        bookings: acc.bookings + row.bookingCount,
        bookingRevenue: acc.bookingRevenue + row.bookingRevenueMinor,
      }),
      { orders: 0, revenue: 0, bookings: 0, bookingRevenue: 0 },
    );

    expect(body.meta.metric).toBe("orders");
    expect(body.meta.include).toEqual(["orders", "bookings"]);
    expect(body.meta.totals).toMatchObject({
      states: body.data.length,
      orderCount: sum.orders,
      orderRevenueMinor: sum.revenue,
      bookingCount: sum.bookings,
      bookingRevenueMinor: sum.bookingRevenue,
    });
    expect(body.meta.totals.orderCount).toBeGreaterThan(0);
    expect(body.meta.totals.bookingCount).toBeGreaterThan(0);
    expect(Date.parse(body.meta.range.from)).toBeLessThan(Date.parse(body.meta.range.to));

    // Mixed-address reality: seeded non-US orders must show up as exclusions.
    expect(body.meta.excluded.nonUsOrders).toBeGreaterThan(0);
    expect(body.meta.excluded).toMatchObject({
      nonUsOrders: expect.any(Number),
      unknownStateOrders: expect.any(Number),
      nonUsBookings: expect.any(Number),
      unknownStateBookings: expect.any(Number),
    });
  });

  it("switches the ranking metric while rows keep both datasets", async () => {
    const ordersResponse = await geo(admin.accessToken, "?metric=orders");
    const bookingsResponse = await geo(admin.accessToken, "?metric=bookings");
    expect(ordersResponse.statusCode).toBe(200);
    expect(bookingsResponse.statusCode).toBe(200);

    const orders = ordersResponse.json();
    const bookings = bookingsResponse.json();

    expect(orders.meta.metric).toBe("orders");
    expect(bookings.meta.metric).toBe("bookings");

    const maxOrderCount = Math.max(...orders.data.map((row: { orderCount: number }) => row.orderCount));
    const maxBookingCount = Math.max(...bookings.data.map((row: { bookingCount: number }) => row.bookingCount));
    expect(orders.meta.ranking[0].value).toBe(maxOrderCount);
    expect(bookings.meta.ranking[0].value).toBe(maxBookingCount);

    // The weighted order distribution concentrates in CA; rentals are spread
    // across more states, so the two rankings must not be identical.
    expect(orders.meta.ranking[0].stateCode).not.toBe(bookings.meta.ranking[0].stateCode);
    expect(bookings.data.every((row: { orderCount: number; bookingCount: number }) => row.orderCount >= 0 && row.bookingCount >= 0)).toBe(true);
  });

  it("applies an explicit date window and reports it in meta", async () => {
    const from = "2026-10-27T00:00:00.000Z";
    const to = "2026-11-03T23:59:59.000Z";
    const response = await geo(admin.accessToken, `?from=${from}&to=${to}`);
    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.meta.range.from).toBe(from);
    expect(body.meta.range.to).toBe(to);

    const defaultResponse = await geo(admin.accessToken);
    const defaultTotals = defaultResponse.json().meta.totals;
    expect(body.meta.totals.orderCount).toBeLessThan(defaultTotals.orderCount);
    expect(body.meta.totals.orderCount).toBeGreaterThan(0);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("allows managers and rejects fulfilment/customer roles", async () => {
    const managerResponse = await geo(manager.accessToken);
    expect(managerResponse.statusCode).toBe(200);

    const fulfilmentResponse = await geo(fulfilment.accessToken);
    expect(fulfilmentResponse.statusCode).toBe(403);
    expect(fulfilmentResponse.json().error.code).toBe("FORBIDDEN");

    const customerResponse = await geo(customer.accessToken);
    expect(customerResponse.statusCode).toBe(403);
    expect(customerResponse.json().error.code).toBe("FORBIDDEN");
  });

  it("returns a stable empty state when the window has no data", async () => {
    const response = await geo(admin.accessToken, "?from=2000-01-01T00:00:00.000Z&to=2000-01-02T00:00:00.000Z");
    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.data).toEqual([]);
    expect(body.meta.totals).toEqual({
      orderCount: 0,
      orderRevenueMinor: 0,
      bookingCount: 0,
      bookingRevenueMinor: 0,
      states: 0,
    });
    expect(body.meta.ranking).toEqual([]);
    expect(body.meta.excluded).toEqual({
      nonUsOrders: 0,
      unknownStateOrders: 0,
      nonUsBookings: 0,
      unknownStateBookings: 0,
    });
  });

  it("serves the same payload through the /backoffice mount", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/backoffice/api/v1/admin/analytics/geo?include=bookings",
      headers: auth(admin.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.meta.include).toEqual(["bookings"]);
    expect(body.meta.totals.orderCount).toBe(0);
    expect(body.meta.totals.bookingCount).toBeGreaterThan(0);
    expect(body.data.some((row: { orderCount: number }) => row.orderCount > 0)).toBe(false);
  });
});
