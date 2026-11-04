/* Pure geo mapping for GET /admin/analytics/geo. No I/O, no wire leakage:
   money is converted from minor units here and nowhere else. */

export type GeoMetric = "orders" | "revenue" | "bookings";

export interface GeoStateRow {
  code: string;
  name: string;
  orders: number;
  orderRevenue: number;
  bookings: number;
  bookingRevenue: number;
  aov: number;
  share: number;
}

export interface GeoRankEntry {
  code: string;
  name: string;
  value: number;
}

export interface GeoResult {
  metric: GeoMetric;
  range: { from: string; to: string };
  states: GeoStateRow[];
  totals: { orders: number; revenue: number; bookings: number; bookingRevenue: number; states: number };
  ranking: GeoRankEntry[];
  excluded: { nonUsOrders: number; unknownStateOrders: number; nonUsBookings: number; unknownStateBookings: number };
}

type Raw = Record<string, any>;

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arr(value: unknown): Raw[] {
  return Array.isArray(value) ? (value as Raw[]) : [];
}

function metricOf(value: unknown): GeoMetric {
  return value === "revenue" || value === "bookings" ? value : "orders";
}

export function mapGeo(raw: Raw): GeoResult {
  const meta = (raw.meta ?? {}) as Raw;
  const metric = metricOf(meta.metric);
  const totalsRaw = (meta.totals ?? {}) as Raw;
  const states: GeoStateRow[] = arr(raw.data).map((row) => {
    const orders = num(row.orderCount);
    const orderRevenue = num(row.orderRevenueMinor) / 100;
    return {
      code: text(row.stateCode),
      name: text(row.stateName),
      orders,
      orderRevenue,
      bookings: num(row.bookingCount),
      bookingRevenue: num(row.bookingRevenueMinor) / 100,
      aov: orders ? orderRevenue / orders : 0,
      share: num(totalsRaw.orderCount) ? (orders / num(totalsRaw.orderCount)) * 100 : 0,
    };
  });
  const excluded = (meta.excluded ?? {}) as Raw;
  return {
    metric,
    range: {
      from: text(meta.range?.from),
      to: text(meta.range?.to),
    },
    states,
    totals: {
      orders: num(totalsRaw.orderCount),
      revenue: num(totalsRaw.orderRevenueMinor) / 100,
      bookings: num(totalsRaw.bookingCount),
      bookingRevenue: num(totalsRaw.bookingRevenueMinor) / 100,
      states: num(totalsRaw.states, states.length),
    },
    ranking: arr(meta.ranking).map((row) => ({
      code: text(row.stateCode),
      name: text(row.stateName),
      value: num(row.value),
    })),
    excluded: {
      nonUsOrders: num(excluded.nonUsOrders),
      unknownStateOrders: num(excluded.unknownStateOrders),
      nonUsBookings: num(excluded.nonUsBookings),
      unknownStateBookings: num(excluded.unknownStateBookings),
    },
  };
}
