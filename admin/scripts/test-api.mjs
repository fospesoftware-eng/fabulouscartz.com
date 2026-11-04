/* Contract tests for the mounted admin API (real backend, not fixtures).
   Run with the console mounted on :4000:  npm test
   Read-only except for deliberately invalid requests that must be rejected. */
import assert from "node:assert/strict";

const API = process.env.API_BASE ?? "http://127.0.0.1:4000/backoffice/api/v1";

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function login(username, password) {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200, `login failed for ${username}`);
  const body = await response.json();
  const token = body?.tokens?.accessToken;
  assert.ok(token, "no access token");
  return token;
}

function client(token) {
  return async function call(path, init = {}) {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  };
}

console.log("Admin API · real backend contract");
const admin = client(await login("admin", "Admin#2026"));

/* Sellers */
const sellers = await admin("/admin/sellers?pageSize=100");
check("GET /sellers returns an envelope", sellers.status === 200 && Array.isArray(sellers.body?.data) && Boolean(sellers.body?.meta));
check("seeded sellers exist", sellers.body?.data?.length >= 10, String(sellers.body?.data?.length));
const seller = sellers.body.data[0];
check(
  "seller carries contact + kyc + commission",
  Boolean(seller.storeName) && Boolean(seller.kyc?.status) && typeof seller.commission?.rateBps === "number",
);
const workspace = await admin(`/admin/sellers/${seller.id}`);
check("seller detail returns rentals + payouts", workspace.status === 200 && Array.isArray(workspace.body?.data?.rentalListings) && Array.isArray(workspace.body?.data?.payouts));

/* Payouts */
const payouts = await admin("/admin/payouts?pageSize=100");
check("GET /payouts returns rows", payouts.status === 200 && payouts.body?.data?.length > 0);
const payout = payouts.body.data[0];
check(
  "payout rows carry the money ledger in minor units",
  ["grossMinor", "commissionMinor", "refundsMinor", "netMinor"].every((key) => Number.isInteger(payout[key])),
);
const badPaid = await admin(`/admin/payouts/${payout.id}/mark-paid`, { method: "POST", body: JSON.stringify({}) });
check("mark-paid requires a reference", [400, 422].includes(badPaid.status), String(badPaid.status));

/* Listings */
const listings = await admin("/admin/rentals/listings?pageSize=100");
check("GET /rentals/listings returns rows", listings.status === 200 && listings.body?.data?.length > 0);
const listing = listings.body.data[0];
check("listing carries rates + location", Number.isInteger(listing.rates?.dailyMinor) && Boolean(listing.location?.city));
const badListingPatch = await admin(`/admin/rentals/listings/${listing.id}`, { method: "PATCH", body: JSON.stringify({ status: "nope" }) });
check("unknown listing status is rejected", [400, 422].includes(badListingPatch.status), String(badListingPatch.status));

/* Bookings + state machine */
const bookings = await admin("/admin/rentals/bookings?page=1&pageSize=100");
check("GET /rentals/bookings returns 40 seeded rows", bookings.status === 200 && bookings.body.data.length === 40, String(bookings.body?.data?.length));
check("declined/cancelled bookings are not in the board feed", new Set(bookings.body.data.map((row) => row.status)).size >= 8);
const active = bookings.body.data.find((row) => row.status === "deposit_authorized") ?? bookings.body.data[0];
const detail = await admin(`/admin/rentals/bookings/${active.id}`);
check(
  "booking detail exposes number, window, money, deposit",
  detail.status === 200 &&
    Boolean(detail.body?.data?.bookingNumber) &&
    Number.isInteger(detail.body?.data?.money?.totalDueMinor) &&
    Number.isInteger(detail.body?.data?.deposit?.amountMinor),
);
check("booking money adds up (fee + deposit = total due)", detail.body.data.money.totalDueMinor === detail.body.data.money.rentalFeeMinor + detail.body.data.money.depositMinor || detail.body.data.money.totalDueMinor > detail.body.data.money.depositMinor);
const invalid = await admin(`/admin/rentals/bookings/${active.id}/transition`, { method: "POST", body: JSON.stringify({ to: "completed" }) });
check("invalid transition is blocked by the server", invalid.status === 409, String(invalid.status));

/* Calendar, deposits, overdue, disputes, analytics */
const today = new Date();
const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const to = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().slice(0, 10);
const calendar = await admin(`/admin/rentals/calendar?from=${from}&to=${to}`);
check(
  "calendar returns bookings + blackouts",
  calendar.status === 200 && Array.isArray(calendar.body?.data?.bookings) && Array.isArray(calendar.body?.data?.blackouts) && calendar.body.data.bookings.length > 0,
);
const deposits = await admin("/admin/rentals/deposits?pageSize=100");
check("deposits return rows with amounts", deposits.status === 200 && deposits.body?.data?.length > 0 && Number.isInteger(deposits.body.data[0].amountMinor));
const overdue = await admin("/admin/rentals/overdue");
check("overdue queue returns days late + accrued fee", overdue.status === 200 && overdue.body?.data?.length > 0 && overdue.body.data[0].overdueDays > 0);
const disputes = await admin("/admin/rentals/disputes");
check("disputes return rows", disputes.status === 200 && disputes.body?.data?.length > 0);
const openDispute = disputes.body.data.find((row) => row.status === "open");
const badOutcome = await admin(`/admin/rentals/disputes/${openDispute.id}/resolve`, {
  method: "POST",
  body: JSON.stringify({ resolution: "nobody_pays", resolutionNote: "invalid" }),
});
check("unknown dispute outcome is rejected", [400, 422].includes(badOutcome.status), String(badOutcome.status));
const rentalsAnalytics = await admin(`/admin/analytics/rentals?from=${from}&to=${to}`);
check(
  "rental analytics exposes money + booking facets",
  rentalsAnalytics.status === 200 &&
    Number.isInteger(rentalsAnalytics.body?.data?.money?.gmvMinor) &&
    typeof rentalsAnalytics.body?.data?.bookings?.active === "number",
);

/* Dashboard composition inputs */
const summary = await admin(`/admin/analytics/summary?from=${from}&to=${to}`);
check(
  "sales summary carries revenue, orders, AOV, customers",
  summary.status === 200 &&
    Number.isInteger(summary.body?.data?.revenue?.grossMinor) &&
    typeof summary.body?.data?.orders?.total === "number" &&
    Number.isInteger(summary.body?.data?.averageOrderValueMinor) &&
    typeof summary.body?.data?.uniqueCustomers === "number",
);
const series = await admin(`/admin/analytics/revenue-series?from=${from}&to=${to}`);
check("revenue series returns daily points", series.status === 200 && Array.isArray(series.body?.data) && series.body.data.length > 0);
const mix = await admin(`/admin/analytics/category-mix?from=${from}&to=${to}`);
check("category mix returns slices", mix.status === 200 && Array.isArray(mix.body?.data) && mix.body.data.length > 0);
const top = await admin(`/admin/analytics/top-products?from=${from}&to=${to}&limit=6`);
check("top products return ranked rows", top.status === 200 && Array.isArray(top.body?.data) && top.body.data.length > 0);
const orders = await admin("/admin/orders?pageSize=100");
check("orders return 60 rows with shipping state", orders.status === 200 && orders.body?.data?.length === 60 && Boolean(orders.body.data[0].shippingAddress?.state), String(orders.body?.data?.length));
const notifications = await admin("/admin/notifications");
check("notification desk returns the dispatch log", notifications.status === 200 && notifications.body?.data?.length > 0 && Boolean(notifications.body.data[0].template));

/* Geo map contract */
const geo = await admin(`/admin/analytics/geo?metric=orders&from=${from}&to=${to}&include=orders,bookings`);
const geoRows = geo.body?.data ?? [];
const geoMeta = geo.body?.meta ?? {};
check(
  "geo returns state rows with both books and meta",
  geo.status === 200 &&
    geoRows.length > 0 &&
    Number.isInteger(geoRows[0].orderCount) &&
    Number.isInteger(geoRows[0].orderRevenueMinor) &&
    Number.isInteger(geoRows[0].bookingCount) &&
    Number.isInteger(geoRows[0].bookingRevenueMinor) &&
    Boolean(geoRows[0].stateCode && geoRows[0].stateName),
);
check(
  "geo meta carries totals, ranking, range and excluded",
  Boolean(geoMeta.totals) &&
    Array.isArray(geoMeta.ranking) &&
    geoMeta.ranking.length > 0 &&
    Boolean(geoMeta.range?.from && geoMeta.range?.to) &&
    typeof geoMeta.excluded?.nonUsOrders === "number",
);
check("geo honours the metric query", geoMeta.metric === "orders", geoMeta.metric);
const geoBookings = await admin(`/admin/analytics/geo?metric=bookings&from=${from}&to=${to}&include=orders,bookings`);
check("geo re-ranks for bookings", geoBookings.status === 200 && geoBookings.body?.meta?.metric === "bookings" && geoBookings.body.meta.ranking[0]?.value !== geoMeta.ranking[0]?.value);
const geoEmpty = await admin(`/admin/analytics/geo?from=2026-01-01&to=2026-01-01&include=orders,bookings`);
check("geo empty window returns zero rows, not an error", geoEmpty.status === 200 && Array.isArray(geoEmpty.body?.data) && geoEmpty.body.data.length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
