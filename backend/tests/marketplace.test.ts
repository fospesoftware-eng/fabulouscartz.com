import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { auth, createProduct, loginAs, makeApp, placeGuestOrder, STAFF } from "./helpers.js";

let app: FastifyInstance;
let adminToken: string;
let managerToken: string;
let fulfilmentToken: string;
let renterToken: string;
let secondRenterToken: string;

const RENTER = { email: "ananya.raghavan@example.com", password: "Customer#2026" };
const SECOND_RENTER = { email: "diya.menon@example.com", password: "Customer#2026" };

function isoDaysFromNow(days: number, hour = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function requestBooking(listingId: string, token: string, startDays: number, lengthDays: number, note?: string) {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/rentals/${listingId}/bookings`,
    headers: auth(token),
    payload: {
      startDate: isoDaysFromNow(startDays, 9),
      endDate: isoDaysFromNow(startDays + lengthDays, 9),
      note,
    },
  });
  return response;
}

async function adminTransition(bookingId: string, to: string, token = adminToken) {
  return app.inject({
    method: "POST",
    url: `/api/v1/admin/rentals/bookings/${bookingId}/transition`,
    headers: auth(token),
    payload: { to },
  });
}

beforeAll(async () => {
  app = await makeApp();
  adminToken = (await loginAs(app, STAFF.admin)).accessToken;
  managerToken = (await loginAs(app, STAFF.manager)).accessToken;
  fulfilmentToken = (await loginAs(app, STAFF.fulfilment)).accessToken;
  renterToken = (await loginAs(app, RENTER)).accessToken;
  secondRenterToken = (await loginAs(app, SECOND_RENTER)).accessToken;
});

afterAll(async () => {
  await app.close();
});

describe("peer-to-peer rentals", () => {
  it("rejects overlapping bookings on the same listing", async () => {
    const first = await requestBooking("lst_002", renterToken, 200, 5, "First hold");
    expect(first.statusCode).toBe(201);
    const firstBody = first.json().data;
    expect(firstBody.status).toBe("requested");
    expect(firstBody.listing.id).toBe("lst_002");
    expect(firstBody.allowedTransitions).toEqual(["approved", "declined", "cancelled_by_renter"]);

    const overlapping = await requestBooking("lst_002", secondRenterToken, 201, 5, "Overlapping hold");
    expect(overlapping.statusCode).toBe(409);
    expect(overlapping.json().error.code).toBe("CONFLICT");

    // Adjacent dates do not overlap.
    const adjacent = await requestBooking("lst_002", secondRenterToken, 206, 3, "Adjacent hold");
    expect(adjacent.statusCode).toBe(201);
  });

  it("returns 409 and the allowed transitions for illegal booking transitions", async () => {
    const illegal = await adminTransition("bkg_001", "dispatched");
    expect(illegal.statusCode).toBe(409);
    expect(illegal.json().error.code).toBe("CONFLICT");
    expect(illegal.json().error.details.allowed).toEqual([]);

    const booking = await requestBooking("lst_006", renterToken, 300, 4);
    expect(booking.statusCode, booking.body).toBe(201);
    const bookingId = booking.json().data.id;
    const skip = await adminTransition(bookingId, "deposit_authorized");
    expect(skip.statusCode).toBe(409);
    expect(skip.json().error.details.allowed).toEqual(["approved", "declined", "cancelled_by_renter"]);
  });

  it("rejects a deposit capture greater than the authorized hold", async () => {
    const booking = await requestBooking("lst_004", renterToken, 310, 5);
    expect(booking.statusCode).toBe(201);
    const bookingId = booking.json().data.id;

    expect((await adminTransition(bookingId, "approved")).statusCode).toBe(200);
    const authorized = await adminTransition(bookingId, "deposit_authorized");
    expect(authorized.statusCode).toBe(200);
    const deposit = authorized.json().data.deposit;
    expect(deposit.status).toBe("authorized");
    expect(deposit.amountMinor).toBeGreaterThan(0);

    const tooMuch = await app.inject({
      method: "POST",
      url: `/api/v1/admin/rentals/deposits/${deposit.id}/capture`,
      headers: auth(adminToken),
      payload: { amountMinor: deposit.amountMinor + 1, reason: "damage_claim" },
    });
    expect(tooMuch.statusCode).toBe(409);
    expect(tooMuch.json().error.code).toBe("CONFLICT");
    expect(tooMuch.json().error.details.authorizedMinor).toBe(deposit.amountMinor);
  });

  it("releases a deposit idempotently with a single ledger entry", async () => {
    const booking = await requestBooking("lst_005", renterToken, 330, 5);
    const bookingId = booking.json().data.id;
    expect((await adminTransition(bookingId, "approved")).statusCode).toBe(200);
    const authorized = await adminTransition(bookingId, "deposit_authorized");
    const depositId = authorized.json().data.deposit.id;

    const payload = { reason: "returned_in_good_condition", idempotencyKey: "release-idem-001" };
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/admin/rentals/deposits/${depositId}/release`,
      headers: auth(adminToken),
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().idempotent).toBe(false);
    expect(first.json().data.status).toBe("released");

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/admin/rentals/deposits/${depositId}/release`,
      headers: auth(adminToken),
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().idempotent).toBe(true);

    const depositList = await app.inject({
      method: "GET",
      url: "/api/v1/admin/rentals/deposits?bookingId=" + bookingId,
      headers: auth(adminToken),
    });
    expect(depositList.statusCode).toBe(200);
    const ledger = depositList.json().data[0].ledgerEntries as Array<{ type: string }>;
    expect(ledger.filter((entry) => entry.type === "release")).toHaveLength(1);
  });

  it("computes commission and payout math correctly per seller", async () => {
    const beforePreview = await app.inject({
      method: "GET",
      url: "/api/v1/admin/sellers/sel_lakshmi/payout-preview",
      headers: auth(adminToken),
    });
    expect(beforePreview.statusCode).toBe(200);
    const before = beforePreview.json().data;

    // sel_lakshmi has an 8% override; 2 × 10000 minor = 20000 gross.
    const product = await createProduct(app, adminToken, {
      vendorId: "ven_lakshmi",
      sellerId: "sel_lakshmi",
      priceMinor: 10000,
      variants: [
        {
          sku: `COMM-${Date.now()}`,
          size: "OS",
          priceMinor: 10000,
          stockQuantity: 10,
          lowStockThreshold: 2,
        },
      ],
    });
    const order = await placeGuestOrder(app, product.variantId, { quantity: 2 });
    const paid = await app.inject({ method: "POST", url: `/api/v1/payments/${order.paymentId}/confirm`, payload: {} });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().data.status).toBe("paid");

    const afterPreview = await app.inject({
      method: "GET",
      url: "/api/v1/admin/sellers/sel_lakshmi/payout-preview",
      headers: auth(adminToken),
    });
    const after = afterPreview.json().data;
    expect(after.grossMinor - before.grossMinor).toBe(20000);
    expect(after.commissionMinor - before.commissionMinor).toBe(1600);
    expect(after.netMinor - before.netMinor).toBe(18400);
    expect(after.entryCount - before.entryCount).toBe(1);

    const generated = await app.inject({
      method: "POST",
      url: "/api/v1/admin/payouts",
      headers: auth(adminToken),
      payload: {
        sellerId: "sel_lakshmi",
        periodStart: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        periodEnd: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
    expect(generated.statusCode).toBe(201);
    const payout = generated.json().data;
    expect(payout.netMinor).toBe(18400);
    expect(payout.grossMinor).toBe(20000);
    expect(payout.commissionMinor).toBe(1600);

    const marked = await app.inject({
      method: "POST",
      url: `/api/v1/admin/payouts/${payout.id}/mark-paid`,
      headers: auth(managerToken),
      payload: { reference: "ACH-TEST-001" },
    });
    expect(marked.statusCode).toBe(200);
    expect(marked.json().data.status).toBe("paid");
    expect(marked.json().data.reference).toBe("ACH-TEST-001");
  });

  it("forbids Fulfilment from money endpoints but allows dispatch and inspection states", async () => {
    const booking = await requestBooking("lst_007", renterToken, 360, 5);
    const bookingId = booking.json().data.id;
    expect((await adminTransition(bookingId, "approved")).statusCode).toBe(200);

    const fulfilmentMoney = await adminTransition(bookingId, "deposit_authorized", fulfilmentToken);
    expect(fulfilmentMoney.statusCode).toBe(403);

    expect((await adminTransition(bookingId, "deposit_authorized")).statusCode).toBe(200);

    const forbiddenCalls = [
      { method: "GET" as const, url: "/api/v1/admin/payouts" },
      { method: "GET" as const, url: "/api/v1/admin/rentals/deposits" },
      { method: "POST" as const, url: "/api/v1/admin/rentals/overdue/sweep", payload: {} },
      { method: "POST" as const, url: "/api/v1/admin/rentals/disputes/dis_001/resolve", payload: { resolution: "owner_pays" } },
    ];
    for (const call of forbiddenCalls) {
      const response = await app.inject({ ...call, headers: auth(fulfilmentToken) });
      expect([401, 403]).toContain(response.statusCode);
    }

    const dispatched = await adminTransition(bookingId, "dispatched", fulfilmentToken);
    expect(dispatched.statusCode).toBe(200);
    expect(dispatched.json().data.status).toBe("dispatched");

    const returned = await app.inject({
      method: "POST",
      url: `/api/v1/rentals/bookings/${bookingId}/return`,
      headers: auth(renterToken),
      payload: {},
    });
    expect(returned.statusCode).toBe(400);

    for (const target of ["in_use", "return_due", "returned", "inspection"]) {
      const step = await adminTransition(bookingId, target, fulfilmentToken);
      expect(step.statusCode).toBe(200);
    }
    const inspection = await app.inject({
      method: "POST",
      url: `/api/v1/admin/rentals/bookings/${bookingId}/inspection`,
      headers: auth(fulfilmentToken),
      payload: { condition: "minor_wear", photos: ["/img/hero/craft.webp"], damageClaimMinor: 0 },
    });
    expect(inspection.statusCode).toBe(201);
  });

  it("blocks new listings for a suspended seller", async () => {
    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/admin/products",
      headers: auth(adminToken),
      payload: {
        title: "Suspended Seller Product",
        description: "Should not be created",
        categoryId: "cat_womens",
        vendorId: "ven_omana",
        sellerId: "sel_suspended",
        priceMinor: 5000,
        status: "active",
        buyEnabled: true,
        variants: [{ sku: `SUSP-${Date.now()}`, priceMinor: 5000, stockQuantity: 5, lowStockThreshold: 1 }],
      },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("CONFLICT");

    const publicSellers = await app.inject({ method: "GET", url: "/api/v1/sellers" });
    expect(publicSellers.statusCode).toBe(200);
    const sellerIds = (publicSellers.json().data as Array<{ id: string }>).map((seller) => seller.id);
    expect(sellerIds).not.toContain("sel_suspended");
    expect(sellerIds).not.toContain("sel_grace");
  });
});
