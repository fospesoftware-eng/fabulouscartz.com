/* Pure coverage for the geo boundary mapper: rows, minor-unit conversion,
   excluded passthrough, empty window. No network, no fixtures. */
import assert from "node:assert/strict";
import { mapGeo } from "../src/lib/geo";

let passed = 0;
let failed = 0;

function check(name: string, run: () => void) {
  try {
    run();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(error as Error).message}`);
  }
}

const envelope = {
  data: [
    {
      stateCode: "CA",
      stateName: "California",
      orderCount: 10,
      orderRevenueMinor: 1_250_000,
      bookingCount: 2,
      bookingRevenueMinor: 400_000,
    },
    {
      stateCode: "OR",
      stateName: "Oregon",
      orderCount: 0,
      orderRevenueMinor: 0,
      bookingCount: 2,
      bookingRevenueMinor: 300_000,
    },
  ],
  meta: {
    metric: "orders",
    include: { orders: true, bookings: true },
    range: { from: "2025-11-04T00:00:00.000Z", to: "2026-11-04T23:59:59.000Z" },
    totals: {
      orderCount: 10,
      orderRevenueMinor: 1_250_000,
      bookingCount: 4,
      bookingRevenueMinor: 700_000,
      states: 2,
    },
    ranking: [{ stateCode: "CA", stateName: "California", value: 10 }],
    excluded: {
      nonUsOrders: 20,
      unknownStateOrders: 0,
      nonUsBookings: 3,
      unknownStateBookings: 1,
    },
  },
};

check("maps every row with its state code and name", () => {
  const result = mapGeo(envelope);
  assert.equal(result.states.length, 2);
  assert.deepEqual(
    result.states.map((row) => [row.code, row.name]),
    [
      ["CA", "California"],
      ["OR", "Oregon"],
    ],
  );
  assert.equal(result.states[0].orders, 10);
  assert.equal(result.states[1].bookings, 2);
});

check("converts minor units to dollars exactly once", () => {
  const result = mapGeo(envelope);
  assert.equal(result.states[0].orderRevenue, 12500);
  assert.equal(result.states[0].bookingRevenue, 4000);
  assert.equal(result.states[0].aov, 1250);
  assert.equal(result.totals.revenue, 12500);
  assert.equal(result.totals.bookingRevenue, 7000);
});

check("passes meta.excluded through unchanged", () => {
  const result = mapGeo(envelope);
  assert.deepEqual(result.excluded, {
    nonUsOrders: 20,
    unknownStateOrders: 0,
    nonUsBookings: 3,
    unknownStateBookings: 1,
  });
});

check("carries the applied window straight from meta.range", () => {
  const result = mapGeo(envelope);
  assert.deepEqual(result.range, {
    from: "2025-11-04T00:00:00.000Z",
    to: "2026-11-04T23:59:59.000Z",
  });
  assert.equal(result.metric, "orders");
});

check("empty window yields no states and zero totals without throwing", () => {
  const result = mapGeo({
    data: [],
    meta: {
      metric: "bookings",
      range: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z" },
      totals: {},
      ranking: [],
      excluded: { nonUsOrders: 4, unknownStateOrders: 0, nonUsBookings: 0, unknownStateBookings: 0 },
    },
  });
  assert.deepEqual(result.states, []);
  assert.deepEqual(result.ranking, []);
  assert.equal(result.metric, "bookings");
  assert.equal(result.totals.orders, 0);
  assert.equal(result.totals.revenue, 0);
  assert.equal(result.totals.states, 0);
  assert.equal(result.excluded.nonUsOrders, 4);
});

check("tolerates a missing meta block", () => {
  const result = mapGeo({ data: [] });
  assert.deepEqual(result.states, []);
  assert.equal(result.metric, "orders");
  assert.equal(result.excluded.nonUsOrders, 0);
});

console.log(`\ngeo normaliser: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
