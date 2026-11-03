/* Contract + guard tests for the marketplace / rental admin API.
   Run with the API on :4000:  npm test
   Read-only except for deliberately invalid requests that must be rejected. */
import assert from "node:assert/strict";

const API = process.env.API_BASE ?? "http://localhost:4000/api";
const ALLOWED = {
  requested: ["approved"],
  approved: ["deposit_authorized"],
  deposit_authorized: ["dispatched"],
  dispatched: ["in_use"],
  in_use: ["return_due"],
  return_due: ["returned", "overdue"],
  returned: ["inspection"],
  inspection: ["completed", "disputed"],
  completed: [],
  overdue: ["returned", "disputed"],
  disputed: ["completed"],
};

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

async function login(email, password) {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `login failed for ${email}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "no session cookie");
  return cookie;
}

function client(cookie) {
  return async function call(path, init = {}) {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
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

console.log("Admin API · marketplace + rentals");
const adminCookie = await login("admin@fabulouscartz.com", "Admin#2026");
const admin = client(adminCookie);

/* Sellers */
const sellers = await admin("/admin/sellers");
check("GET /admin/sellers paginates", sellers.status === 200 && Array.isArray(sellers.body?.data), String(sellers.status));
check("seller facets expose the KYC pipeline", ["pending", "approved", "rejected", "suspended"].every((key) => typeof sellers.body?.facets?.[key] === "number"));
const pendingSeller = sellers.body.data.find((row) => row.kycStatus === "pending");
check("seeded pending sellers exist", Boolean(pendingSeller));
const workspace = await admin(`/admin/sellers/${pendingSeller.id}`);
check("GET /admin/sellers/:id returns workspace", workspace.status === 200 && Boolean(workspace.body?.seller) && Array.isArray(workspace.body?.listings) && Array.isArray(workspace.body?.payouts));
const rejectNoReason = await admin(`/admin/sellers/${pendingSeller.id}/review`, {
  method: "POST",
  body: JSON.stringify({ decision: "reject" }),
});
check("KYC reject requires a reason", [400, 422].includes(rejectNoReason.status), String(rejectNoReason.status));

/* Payouts */
const payouts = await admin("/admin/payouts?period=2026-10");
check("GET /admin/payouts returns summary", payouts.status === 200 && payouts.body?.summary && Array.isArray(payouts.body?.data));
check("payout summary totals due + paid + failed", ["due", "paid", "failed"].every((key) => typeof payouts.body.summary[key] === "number"));

/* Listings */
const listings = await admin("/admin/rentals/listings");
check("GET /admin/rentals/listings returns facets + cities", listings.status === 200 && Array.isArray(listings.body?.data) && Array.isArray(listings.body?.cities));
const firstListing = listings.body.data[0];
const badModeration = await admin(`/admin/rentals/listings/${firstListing.id}/moderate`, {
  method: "POST",
  body: JSON.stringify({ action: "unsuspend" }),
});
check("unknown moderation action is rejected", [400, 422].includes(badModeration.status), String(badModeration.status));

/* Bookings + state machine */
const bookings = await admin("/admin/rentals/bookings");
check("GET /admin/rentals/bookings returns rows", bookings.status === 200 && Array.isArray(bookings.body?.data));
check("all eleven booking states are seeded", new Set(bookings.body.data.map((row) => row.state)).size === 11);
for (const booking of bookings.body.data) {
  const detail = await admin(`/admin/rentals/bookings/${booking.id}`);
  if (detail.status !== 200) {
    check(`detail ${booking.number} loads`, false, String(detail.status));
    continue;
  }
  const expected = ALLOWED[detail.body.state];
  check(
    `${booking.number} (${detail.body.state}) allowedTransitions match the state machine`,
    JSON.stringify(detail.body.allowedTransitions) === JSON.stringify(expected),
    JSON.stringify(detail.body.allowedTransitions),
  );
}
const invalid = await admin(`/admin/rentals/bookings/${bookings.body.data[0].id}/transition`, {
  method: "POST",
  body: JSON.stringify({ to: "completed" }),
});
check("invalid transition is blocked by the server", invalid.status === 409, String(invalid.status));

/* Calendar, deposits, overdue, disputes, analytics */
const today = new Date();
const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const to = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().slice(0, 10);
const calendar = await admin(`/admin/rentals/calendar?from=${from}&to=${to}`);
check("calendar returns bookings and blackouts", calendar.status === 200 && Array.isArray(calendar.body?.bookings) && Array.isArray(calendar.body?.blackouts));
const deposits = await admin("/admin/rentals/deposits");
check("deposits expose age + expiry countdown", deposits.status === 200 && deposits.body?.data?.[0]?.ageDays >= 0 && typeof deposits.body?.data?.[0]?.daysToExpiry === "number");
const held = deposits.body.data.find((row) => row.state === "authorized");
const overdue = await admin("/admin/rentals/overdue");
check("overdue queue returns days late + accrued fee", overdue.status === 200 && overdue.body?.data?.length > 0 && overdue.body.data[0].daysLate > 0);
const disputes = await admin("/admin/rentals/disputes");
check("disputes expose evidence + outcome", disputes.status === 200 && Array.isArray(disputes.body?.data));
const openDispute = disputes.body.data.find((row) => row.status === "open");
const badOutcome = await admin(`/admin/rentals/disputes/${openDispute.id}/resolve`, {
  method: "POST",
  body: JSON.stringify({ outcome: "nobody_pays", amount: 10, note: "invalid" }),
});
check("unknown dispute outcome is rejected", [400, 422].includes(badOutcome.status), String(badOutcome.status));
const analytics = await admin("/admin/rentals/analytics?range=30");
check(
  "rental analytics has the command-strip metrics",
  analytics.status === 200 && ["rentalRevenue", "activeBookings", "utilization", "depositsHeld", "overdueCount"].every((key) => typeof analytics.body[key] === "number"),
);

/* Role gating — fulfilment can read but cannot move money */
const fulfilCookie = await login("fulfilment@fabulouscartz.com", "Fulfil#2026");
const fulfil = client(fulfilCookie);
const fulfilPayouts = await fulfil("/admin/payouts");
check("fulfilment can read payouts", fulfilPayouts.status === 200, String(fulfilPayouts.status));
const duePayout = payouts.body.data.find((row) => row.status === "due") ?? payouts.body.data[0];
const fulfilMarkPaid = await fulfil(`/admin/payouts/${duePayout.id}/mark-paid`, {
  method: "POST",
  body: JSON.stringify({ reference: "TEST-REF" }),
});
check("fulfilment cannot mark a payout paid", fulfilMarkPaid.status === 403, String(fulfilMarkPaid.status));
const fulfilCommission = await fulfil(`/admin/sellers/${pendingSeller.id}/commission`, {
  method: "PATCH",
  body: JSON.stringify({ rate: 12 }),
});
check("fulfilment cannot change commission", fulfilCommission.status === 403, String(fulfilCommission.status));
const fulfilCapture = await fulfil(`/admin/rentals/bookings/${held.bookingId}/deposit/capture`, {
  method: "POST",
  body: JSON.stringify({ amount: 1, reason: "role test" }),
});
check("fulfilment cannot capture a deposit", fulfilCapture.status === 403, String(fulfilCapture.status));
const fulfilRead = await fulfil(`/admin/rentals/bookings/${held.bookingId}`);
check("fulfilment can still read booking operations", fulfilRead.status === 200, String(fulfilRead.status));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
