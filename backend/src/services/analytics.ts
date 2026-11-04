import { prisma } from "../db.js";
import { US_STATES, normalizeUsState } from "../lib/us-states.js";

export type PaidStatus = "paid" | "confirmed" | "shipped" | "delivered";
const PAID_STATUSES: PaidStatus[] = ["paid", "confirmed", "shipped", "delivered"];

export interface DateRange {
  from: Date;
  to: Date;
}

export function defaultRange(from?: Date, to?: Date): DateRange {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
  return { from: start, to: end };
}

function rangeWhere(range: DateRange) {
  return { gte: range.from, lte: range.to };
}

export async function getSummary(range: DateRange) {
  const [allOrders, paidOrders, refunds, carts, convertedCarts] = await Promise.all([
    prisma.order.findMany({
      where: { placedAt: rangeWhere(range) },
      select: { totalMinor: true, status: true, email: true, placedAt: true },
    }),
    prisma.order.findMany({
      where: { placedAt: rangeWhere(range), status: { in: PAID_STATUSES } },
      select: { totalMinor: true, email: true, placedAt: true, discountMinor: true, taxMinor: true },
    }),
    prisma.refund.findMany({
      where: { createdAt: rangeWhere(range), status: "succeeded" },
      select: { amountMinor: true },
    }),
    prisma.cart.count({ where: { createdAt: rangeWhere(range) } }),
    prisma.cart.count({ where: { createdAt: rangeWhere(range), status: "converted" } }),
  ]);

  const grossRevenueMinor = paidOrders.reduce((sum, order) => sum + order.totalMinor, 0);
  const refundsMinor = refunds.reduce((sum, refund) => sum + refund.amountMinor, 0);
  const netRevenueMinor = grossRevenueMinor - refundsMinor;
  const paidCount = paidOrders.length;
  const uniqueCustomers = new Set(paidOrders.map((order) => order.email)).size;
  const taxMinor = paidOrders.reduce((sum, order) => sum + order.taxMinor, 0);
  const discountMinor = paidOrders.reduce((sum, order) => sum + order.discountMinor, 0);

  return {
    range,
    orders: {
      total: allOrders.length,
      paid: paidCount,
      cancelled: allOrders.filter((order) => order.status === "cancelled").length,
      refunded: allOrders.filter((order) => order.status === "refunded").length,
    },
    revenue: {
      grossMinor: grossRevenueMinor,
      refundsMinor,
      netMinor: netRevenueMinor,
      taxMinor,
      discountMinor,
    },
    averageOrderValueMinor: paidCount === 0 ? 0 : Math.round(grossRevenueMinor / paidCount),
    uniqueCustomers,
    conversion: {
      carts: carts,
      convertedCarts,
      cartToOrderRate: carts === 0 ? 0 : Number(((convertedCarts / carts) * 100).toFixed(2)),
    },
  };
}

export async function getFunnel(range: DateRange) {
  const [carts, converted, placed, paid, delivered] = await Promise.all([
    prisma.cart.count({ where: { createdAt: rangeWhere(range) } }),
    prisma.cart.count({ where: { createdAt: rangeWhere(range), status: "converted" } }),
    prisma.order.count({ where: { placedAt: rangeWhere(range) } }),
    prisma.order.count({ where: { placedAt: rangeWhere(range), status: { in: PAID_STATUSES } } }),
    prisma.order.count({ where: { placedAt: rangeWhere(range), status: "delivered" } }),
  ]);

  const rate = (numerator: number, denominator: number) =>
    denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(2));

  return {
    range,
    steps: [
      { step: "carts_created", value: carts },
      { step: "carts_converted", value: converted, rateFromPrevious: rate(converted, carts) },
      { step: "orders_placed", value: placed, rateFromPrevious: rate(placed, converted || carts) },
      { step: "orders_paid", value: paid, rateFromPrevious: rate(paid, placed) },
      { step: "orders_delivered", value: delivered, rateFromPrevious: rate(delivered, paid) },
    ],
  };
}

export async function getCategoryMix(range: DateRange) {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { placedAt: rangeWhere(range), status: { in: PAID_STATUSES } },
      productId: { not: null },
    },
    include: { product: { include: { category: true } } },
  });

  const map = new Map<string, { category: string; slug: string; revenueMinor: number; units: number; orders: number }>();
  for (const item of items) {
    if (!item.product) continue;
    const key = item.product.categoryId;
    const entry = map.get(key) ?? {
      category: item.product.category.name,
      slug: item.product.category.slug,
      revenueMinor: 0,
      units: 0,
      orders: 0,
    };
    entry.revenueMinor += item.lineTotalMinor;
    entry.units += item.quantity;
    entry.orders += 1;
    map.set(key, entry);
  }

  const total = [...map.values()].reduce((sum, entry) => sum + entry.revenueMinor, 0);
  return [...map.values()]
    .map((entry) => ({
      ...entry,
      sharePercent: total === 0 ? 0 : Number(((entry.revenueMinor / total) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.revenueMinor - a.revenueMinor);
}

export async function getTopProducts(range: DateRange, limit = 10) {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { placedAt: rangeWhere(range), status: { in: PAID_STATUSES } },
      productId: { not: null },
    },
    select: {
      productId: true,
      title: true,
      sku: true,
      quantity: true,
      lineTotalMinor: true,
    },
  });

  const map = new Map<string, { productId: string; title: string; sku: string; units: number; revenueMinor: number }>();
  for (const item of items) {
    if (!item.productId) continue;
    const entry = map.get(item.productId) ?? {
      productId: item.productId,
      title: item.title,
      sku: item.sku,
      units: 0,
      revenueMinor: 0,
    };
    entry.units += item.quantity;
    entry.revenueMinor += item.lineTotalMinor;
    map.set(item.productId, entry);
  }

  return [...map.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, limit);
}

export async function getLowStock(limit = 50) {
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true },
    include: {
      product: {
        select: { id: true, title: true, slug: true, status: true, vendor: { select: { name: true } } },
      },
    },
    orderBy: { stockQuantity: "asc" },
    take: 500,
  });

  return variants
    .filter((variant) => variant.stockQuantity <= variant.lowStockThreshold)
    .slice(0, limit)
    .map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      productId: variant.product.id,
      product: variant.product.title,
      slug: variant.product.slug,
      vendor: variant.product.vendor.name,
      stockQuantity: variant.stockQuantity,
      reservedQuantity: variant.reservedQuantity,
      threshold: variant.lowStockThreshold,
      available: Math.max(0, variant.stockQuantity - variant.reservedQuantity),
    }));
}

export async function getRevenueSeries(range: DateRange) {
  const orders = await prisma.order.findMany({
    where: { placedAt: rangeWhere(range), status: { in: PAID_STATUSES } },
    select: { placedAt: true, totalMinor: true },
  });
  const buckets = new Map<string, { date: string; revenueMinor: number; orders: number }>();
  for (const order of orders) {
    const key = order.placedAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { date: key, revenueMinor: 0, orders: 0 };
    bucket.revenueMinor += order.totalMinor;
    bucket.orders += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export async function exportCsv(dataset: string, range: DateRange): Promise<{ filename: string; csv: string }> {
  switch (dataset) {
    case "orders": {
      const orders = await prisma.order.findMany({
        where: { placedAt: rangeWhere(range) },
        orderBy: { placedAt: "desc" },
      });
      return {
        filename: `orders-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv`,
        csv: toCsv(
          orders.map((order) => ({
            orderNumber: order.orderNumber,
            placedAt: order.placedAt.toISOString(),
            email: order.email,
            status: order.status,
            paymentStatus: order.paymentStatus,
            subtotal: (order.subtotalMinor / 100).toFixed(2),
            discount: (order.discountMinor / 100).toFixed(2),
            tax: (order.taxMinor / 100).toFixed(2),
            shipping: (order.shippingMinor / 100).toFixed(2),
            total: (order.totalMinor / 100).toFixed(2),
            currency: order.currency,
            coupon: order.couponCode ?? "",
          })),
        ),
      };
    }
    case "products": {
      const products = await prisma.product.findMany({
        include: { category: true, vendor: true, variants: true },
        orderBy: { createdAt: "desc" },
      });
      return {
        filename: "products.csv",
        csv: toCsv(
          products.map((product) => ({
            slug: product.slug,
            title: product.title,
            category: product.category.name,
            vendor: product.vendor.name,
            status: product.status,
            price: (product.priceMinor / 100).toFixed(2),
            currency: product.currency,
            stock: product.variants.reduce((sum, variant) => sum + variant.stockQuantity, 0),
            reserved: product.variants.reduce((sum, variant) => sum + variant.reservedQuantity, 0),
            rating: product.ratingAvg.toFixed(2),
          })),
        ),
      };
    }
    case "low-stock": {
      const rows = await getLowStock(200);
      return {
        filename: "low-stock.csv",
        csv: toCsv(rows.map((row) => ({ ...row }))),
      };
    }
    case "customers": {
      const customers = await prisma.user.findMany({
        where: { role: "customer" },
        include: { orders: { where: { status: { in: PAID_STATUSES } } } },
        orderBy: { createdAt: "desc" },
      });
      return {
        filename: "customers.csv",
        csv: toCsv(
          customers.map((customer) => ({
            email: customer.email,
            name: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
            orders: customer.orders.length,
            spend: (customer.orders.reduce((sum, order) => sum + order.totalMinor, 0) / 100).toFixed(2),
            createdAt: customer.createdAt.toISOString(),
          })),
        ),
      };
    }
    default:
      throw new Error(`Unknown CSV dataset: ${dataset}`);
  }
}

// ---------------------------------------------------------------------------
// Marketplace / seller analytics
// ---------------------------------------------------------------------------

export async function getSellerAnalytics(range: DateRange) {
  const [sellers, entries, pendingEntries] = await Promise.all([
    prisma.seller.findMany({ orderBy: { storeName: "asc" } }),
    prisma.sellerLedgerEntry.findMany({
      where: { occurredAt: rangeWhere(range) },
      select: {
        sellerId: true,
        orderId: true,
        grossMinor: true,
        commissionMinor: true,
        refundMinor: true,
        netMinor: true,
      },
    }),
    prisma.sellerLedgerEntry.findMany({
      where: { payoutId: null, status: "pending" },
      select: { sellerId: true, netMinor: true },
    }),
  ]);

  const bySeller = new Map<
    string,
    { gmvMinor: number; commissionMinor: number; refundsMinor: number; netMinor: number; orders: Set<string> }
  >();
  for (const entry of entries) {
    const row = bySeller.get(entry.sellerId) ?? {
      gmvMinor: 0,
      commissionMinor: 0,
      refundsMinor: 0,
      netMinor: 0,
      orders: new Set<string>(),
    };
    row.gmvMinor += entry.grossMinor;
    row.commissionMinor += entry.commissionMinor;
    row.refundsMinor += entry.refundMinor;
    row.netMinor += entry.netMinor;
    if (entry.orderId) row.orders.add(entry.orderId);
    bySeller.set(entry.sellerId, row);
  }
  const payoutDue = new Map<string, number>();
  for (const entry of pendingEntries) {
    payoutDue.set(entry.sellerId, (payoutDue.get(entry.sellerId) ?? 0) + entry.netMinor);
  }

  const rows = sellers.map((seller) => {
    const aggregates = bySeller.get(seller.id);
    return {
      sellerId: seller.id,
      storeName: seller.storeName,
      slug: seller.slug,
      status: seller.status,
      kycStatus: seller.kycStatus,
      rating: seller.rating,
      commissionRateBps: seller.commissionRateBps,
      gmvMinor: aggregates?.gmvMinor ?? 0,
      commissionMinor: aggregates?.commissionMinor ?? 0,
      refundsMinor: aggregates?.refundsMinor ?? 0,
      netMinor: aggregates?.netMinor ?? 0,
      orders: aggregates?.orders.size ?? 0,
      payoutDueMinor: payoutDue.get(seller.id) ?? 0,
    };
  });

  return {
    range,
    totals: {
      gmvMinor: rows.reduce((sum, row) => sum + row.gmvMinor, 0),
      commissionMinor: rows.reduce((sum, row) => sum + row.commissionMinor, 0),
      refundsMinor: rows.reduce((sum, row) => sum + row.refundsMinor, 0),
      netMinor: rows.reduce((sum, row) => sum + row.netMinor, 0),
      payoutDueMinor: rows.reduce((sum, row) => sum + row.payoutDueMinor, 0),
    },
    topSellers: [...rows].sort((a, b) => b.gmvMinor - a.gmvMinor).slice(0, 10),
    sellers: rows,
  };
}

// ---------------------------------------------------------------------------
// Geographic analytics
// ---------------------------------------------------------------------------

export type GeoMetric = "orders" | "revenue" | "bookings";
export type GeoInclude = "orders" | "bookings";

export interface GeoRow {
  stateCode: string;
  stateName: string;
  orderCount: number;
  orderRevenueMinor: number;
  bookingCount: number;
  bookingRevenueMinor: number;
}

export interface GeoExclusions {
  nonUsOrders: number;
  unknownStateOrders: number;
  nonUsBookings: number;
  unknownStateBookings: number;
}

const RENTAL_REVENUE_STATUSES = [
  "dispatched",
  "in_use",
  "return_due",
  "overdue",
  "returned",
  "inspection",
  "completed",
  "disputed",
];

function isUsCountry(country: string | null | undefined): boolean {
  return (country ?? "").trim().toUpperCase() === "US";
}

export async function getGeoAnalytics(
  range: DateRange,
  metric: GeoMetric,
  include: GeoInclude[],
) {
  const wantsOrders = include.includes("orders");
  const wantsBookings = include.includes("bookings");

  const [orders, bookings] = await Promise.all([
    wantsOrders
      ? prisma.order.findMany({
          where: { placedAt: rangeWhere(range) },
          select: {
            status: true,
            totalMinor: true,
            shippingAddress: { select: { country: true, state: true } },
          },
        })
      : Promise.resolve([]),
    wantsBookings
      ? prisma.booking.findMany({
          where: { createdAt: rangeWhere(range) },
          select: { status: true, rentalFeeMinor: true, country: true, state: true },
        })
      : Promise.resolve([]),
  ]);

  const rows = new Map<string, GeoRow>();
  const exclusions: GeoExclusions = {
    nonUsOrders: 0,
    unknownStateOrders: 0,
    nonUsBookings: 0,
    unknownStateBookings: 0,
  };

  const ensureRow = (stateCode: string): GeoRow => {
    const existing = rows.get(stateCode);
    if (existing) return existing;
    const row: GeoRow = {
      stateCode,
      stateName: US_STATES[stateCode] ?? stateCode,
      orderCount: 0,
      orderRevenueMinor: 0,
      bookingCount: 0,
      bookingRevenueMinor: 0,
    };
    rows.set(stateCode, row);
    return row;
  };

  for (const order of orders) {
    const address = order.shippingAddress;
    if (!address || !isUsCountry(address.country)) {
      exclusions.nonUsOrders += 1;
      continue;
    }
    const stateCode = normalizeUsState(address.state);
    if (!stateCode) {
      exclusions.unknownStateOrders += 1;
      continue;
    }
    const row = ensureRow(stateCode);
    row.orderCount += 1;
    // Revenue follows the same "paid" definition as the rest of the analytics.
    if (PAID_STATUSES.includes(order.status as PaidStatus)) {
      row.orderRevenueMinor += order.totalMinor;
    }
  }

  for (const booking of bookings) {
    if (!isUsCountry(booking.country)) {
      exclusions.nonUsBookings += 1;
      continue;
    }
    const stateCode = normalizeUsState(booking.state);
    if (!stateCode) {
      exclusions.unknownStateBookings += 1;
      continue;
    }
    const row = ensureRow(stateCode);
    row.bookingCount += 1;
    if (RENTAL_REVENUE_STATUSES.includes(booking.status)) {
      row.bookingRevenueMinor += booking.rentalFeeMinor;
    }
  }

  const metricValue = (row: GeoRow): number => {
    switch (metric) {
      case "revenue":
        return row.orderRevenueMinor + row.bookingRevenueMinor;
      case "bookings":
        return row.bookingCount;
      default:
        return row.orderCount;
    }
  };

  const data = [...rows.values()].sort(
    (a, b) =>
      b.orderCount + b.bookingCount - (a.orderCount + a.bookingCount) ||
      a.stateCode.localeCompare(b.stateCode),
  );

  const ranking = [...data]
    .map((row) => ({ stateCode: row.stateCode, stateName: row.stateName, value: metricValue(row) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.stateCode.localeCompare(b.stateCode))
    .slice(0, 10);

  const totals = data.reduce(
    (acc, row) => ({
      orderCount: acc.orderCount + row.orderCount,
      orderRevenueMinor: acc.orderRevenueMinor + row.orderRevenueMinor,
      bookingCount: acc.bookingCount + row.bookingCount,
      bookingRevenueMinor: acc.bookingRevenueMinor + row.bookingRevenueMinor,
    }),
    { orderCount: 0, orderRevenueMinor: 0, bookingCount: 0, bookingRevenueMinor: 0 },
  );

  return {
    data,
    meta: {
      metric,
      include,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      totals: { ...totals, states: data.length },
      ranking,
      excluded: exclusions,
    },
  };
}

// ---------------------------------------------------------------------------
// Rental analytics
// ---------------------------------------------------------------------------

export async function getRentalAnalytics(range: DateRange) {
  const [bookings, listings, deposits, disputes] = await Promise.all([
    prisma.booking.findMany({
      where: { createdAt: rangeWhere(range) },
      include: { listing: { select: { id: true, title: true, slug: true, state: true, city: true } } },
    }),
    prisma.rentalListing.findMany({ select: { id: true, status: true, state: true } }),
    prisma.rentalDeposit.findMany({ select: { status: true, amountMinor: true, capturedMinor: true, releasedMinor: true } }),
    prisma.dispute.findMany({ select: { status: true, claimAmountMinor: true } }),
  ]);

  const revenueBookings = bookings.filter((booking) => RENTAL_REVENUE_STATUSES.includes(booking.status));
  const gmvMinor = revenueBookings.reduce((sum, booking) => sum + booking.rentalFeeMinor, 0);
  const platformFeeMinor = revenueBookings.reduce((sum, booking) => sum + booking.platformFeeMinor, 0);
  const ownerPayoutMinor = revenueBookings.reduce((sum, booking) => sum + booking.ownerPayoutMinor, 0);
  const lateFeeMinor = bookings.reduce((sum, booking) => sum + booking.lateFeeMinor, 0);
  const depositHeldMinor = deposits
    .filter((deposit) => deposit.status === "authorized")
    .reduce((sum, deposit) => sum + deposit.amountMinor - deposit.capturedMinor, 0);

  const statusCounts: Record<string, number> = {};
  for (const booking of bookings) statusCounts[booking.status] = (statusCounts[booking.status] ?? 0) + 1;

  const stateCounts: Record<string, number> = {};
  for (const booking of bookings) stateCounts[booking.state] = (stateCounts[booking.state] ?? 0) + 1;

  const listingStatusCounts: Record<string, number> = {};
  for (const listing of listings) listingStatusCounts[listing.status] = (listingStatusCounts[listing.status] ?? 0) + 1;

  const topListingsMap = new Map<string, { listingId: string; title: string; slug: string; bookings: number; revenueMinor: number }>();
  for (const booking of revenueBookings) {
    const row = topListingsMap.get(booking.listingId) ?? {
      listingId: booking.listingId,
      title: booking.listing.title,
      slug: booking.listing.slug,
      bookings: 0,
      revenueMinor: 0,
    };
    row.bookings += 1;
    row.revenueMinor += booking.rentalFeeMinor;
    topListingsMap.set(booking.listingId, row);
  }

  return {
    range,
    bookings: {
      total: bookings.length,
      byStatus: statusCounts,
      active: bookings.filter((booking) => ["deposit_authorized", "dispatched", "in_use", "return_due"].includes(booking.status)).length,
      overdue: bookings.filter((booking) => booking.status === "overdue" || booking.overdueFlag).length,
      disputed: bookings.filter((booking) => booking.status === "disputed").length,
      completed: bookings.filter((booking) => booking.status === "completed").length,
    },
    money: {
      gmvMinor,
      platformFeeMinor,
      ownerPayoutMinor,
      lateFeeMinor,
      depositHeldMinor,
    },
    listings: {
      total: listings.length,
      byStatus: listingStatusCounts,
    },
    deposits: {
      authorized: deposits.filter((deposit) => deposit.status === "authorized").length,
      captured: deposits.filter((deposit) => deposit.status === "captured").length,
      released: deposits.filter((deposit) => deposit.status === "released").length,
      expired: deposits.filter((deposit) => deposit.status === "expired").length,
      capturedMinor: deposits.reduce((sum, deposit) => sum + deposit.capturedMinor, 0),
    },
    disputes: {
      open: disputes.filter((dispute) => dispute.status === "open").length,
      resolved: disputes.filter((dispute) => dispute.status === "resolved").length,
      claimAmountMinor: disputes.reduce((sum, dispute) => sum + dispute.claimAmountMinor, 0),
    },
    byState: Object.entries(stateCounts)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
    topListings: [...topListingsMap.values()].sort((a, b) => b.revenueMinor - a.revenueMinor).slice(0, 10),
  };
}

