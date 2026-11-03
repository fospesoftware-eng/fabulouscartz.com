import type {
  AnalyticsData,
  CategorySlice,
  DashboardData,
  InventoryRow,
  Order,
  SeriesPoint,
  TopProduct,
} from "../../shared/types.js";
import type { Database } from "./store.js";
import { formatMoney } from "./helpers.js";

const PALETTE = ["#1B6B43", "#B8913A", "#B56A4D", "#8DC79B", "#6A4F1B", "#D18A6E"];

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dayKey(date: Date | string): string {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function isBillable(order: Order): boolean {
  return order.status !== "cancelled" && order.status !== "returned";
}

export function buildSeries(orders: Order[], days: number, offset = 0): SeriesPoint[] {
  const today = startOfDay(new Date());
  const points: SeriesPoint[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - index - offset * days);
    const key = dayKey(date);
    const sameDay = orders.filter((order) => isBillable(order) && dayKey(order.createdAt) === key);
    points.push({
      date: date.toISOString(),
      revenue: Math.round(sameDay.reduce((sum, order) => sum + order.total, 0)),
      orders: sameDay.length,
    });
  }
  return points;
}

export function inventoryRows(database: Database): InventoryRow[] {
  return database.products
    .filter((product) => product.status !== "archived")
    .flatMap((product) =>
      product.variants.map((variant) => {
        const available = Math.max(0, variant.stock - variant.rented);
        const status: InventoryRow["status"] =
          variant.stock <= 0 ? "out" : variant.stock <= variant.lowStockThreshold ? "low" : "in_stock";
        return {
          sku: variant.sku,
          productId: product.id,
          productName: product.name,
          image: product.images[0],
          size: variant.size,
          color: variant.color,
          stock: variant.stock,
          rented: variant.rented,
          available,
          lowStockThreshold: variant.lowStockThreshold,
          rentWindowDays: variant.rentWindowDays,
          status,
          price: variant.price,
          updatedAt: product.updatedAt,
        };
      }),
    )
    .sort((a, b) => a.stock - b.stock);
}

export function categoryMix(orders: Order[], database: Database, days: number, categoryId?: string): CategorySlice[] {
  const cutoff = Date.now() - days * 86400000;
  const totals = new Map<string, number>();
  for (const order of orders) {
    if (!isBillable(order) || new Date(order.createdAt).getTime() < cutoff) continue;
    for (const line of order.items) {
      const product = database.products.find((entry) => entry.id === line.productId);
      if (!product) continue;
      if (categoryId && product.categoryId !== categoryId) continue;
      const category = database.categories.find((entry) => entry.id === product.categoryId);
      const label = category?.name ?? "Other";
      totals.set(label, (totals.get(label) ?? 0) + line.unitPrice * line.qty);
    }
  }
  return [...totals.entries()]
    .map(([name, value], index) => ({ name, value: Math.round(value), color: PALETTE[index % PALETTE.length] }))
    .sort((a, b) => b.value - a.value);
}

export function topProducts(orders: Order[], database: Database, days: number, categoryId?: string): TopProduct[] {
  const cutoff = Date.now() - days * 86400000;
  const totals = new Map<string, { revenue: number; units: number }>();
  for (const order of orders) {
    if (!isBillable(order) || new Date(order.createdAt).getTime() < cutoff) continue;
    for (const line of order.items) {
      const product = database.products.find((entry) => entry.id === line.productId);
      if (!product) continue;
      if (categoryId && product.categoryId !== categoryId) continue;
      const current = totals.get(product.id) ?? { revenue: 0, units: 0 };
      totals.set(product.id, {
        revenue: current.revenue + line.unitPrice * line.qty,
        units: current.units + line.qty,
      });
    }
  }
  return [...totals.entries()]
    .map(([id, value]) => {
      const product = database.products.find((entry) => entry.id === id);
      const category = database.categories.find((entry) => entry.id === product?.categoryId);
      return {
        id,
        name: product?.name ?? "Unknown product",
        image: product?.images[0] ?? "",
        revenue: Math.round(value.revenue),
        units: value.units,
        category: category?.name ?? "—",
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);
}

function delta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function buildAnalytics(database: Database, days: number, categoryId?: string): AnalyticsData {
  const cutoff = new Date(Date.now() - days * 86400000);
  const previousCutoff = new Date(Date.now() - days * 2 * 86400000);
  const relevant = database.orders.filter((order) => {
    if (!isBillable(order)) return false;
    if (categoryId && !order.items.some((line) => database.products.find((p) => p.id === line.productId)?.categoryId === categoryId)) {
      return false;
    }
    return new Date(order.createdAt) >= cutoff;
  });
  const previousRelevant = database.orders.filter(
    (order) =>
      isBillable(order) &&
      !categoryId &&
      new Date(order.createdAt) >= previousCutoff &&
      new Date(order.createdAt) < cutoff,
  );

  const ordersInCategory = (order: Order): number =>
    categoryId
      ? order.items
          .filter((line) => database.products.find((p) => p.id === line.productId)?.categoryId === categoryId)
          .reduce((sum, line) => sum + line.unitPrice * line.qty, 0)
      : order.total;

  const revenue = relevant.reduce((sum, order) => sum + ordersInCategory(order), 0);
  const previousRevenue = previousRelevant.reduce((sum, order) => sum + order.total, 0);
  const units = relevant.reduce((sum, order) => sum + order.items.reduce((lineSum, line) => lineSum + line.qty, 0), 0);
  const aov = relevant.length ? revenue / relevant.length : 0;
  const previousAov = previousRelevant.length ? previousRevenue / previousRelevant.length : 0;
  const refunds = database.orders
    .filter((order) => order.paymentStatus === "refunded" && new Date(order.createdAt) >= cutoff)
    .reduce((sum, order) => sum + order.total, 0);
  const firstOrderAt = new Map<string, number>();
  for (const order of database.orders) {
    if (!isBillable(order)) continue;
    const at = new Date(order.createdAt).getTime();
    const seen = firstOrderAt.get(order.customerId);
    if (seen === undefined || at < seen) firstOrderAt.set(order.customerId, at);
  }
  const newCustomers = [...firstOrderAt.values()].filter((at) => at >= cutoff.getTime()).length;

  const paymentTotals = new Map<string, number>();
  relevant.forEach((order) => {
    paymentTotals.set(order.paymentMethod, (paymentTotals.get(order.paymentMethod) ?? 0) + order.total);
  });
  const paymentMix = [...paymentTotals.entries()]
    .map(([name, value]) => ({ name: name === "gpay" ? "G Pay" : name === "phonepe" ? "PhonePe" : name.toUpperCase(), value: Math.round(value), color: PALETTE[[...paymentTotals.keys()].indexOf(name) % PALETTE.length] }))
    .sort((a, b) => b.value - a.value);

  const channelTotals = new Map<string, number>();
  relevant.forEach((order) => {
    channelTotals.set(order.channel, (channelTotals.get(order.channel) ?? 0) + 1);
  });

  return {
    range: days,
    totals: {
      revenue: Math.round(revenue),
      orders: relevant.length,
      aov: Math.round(aov),
      units,
      refunds: Math.round(refunds),
      newCustomers,
    },
    previous: { revenue: Math.round(previousRevenue), orders: previousRelevant.length, aov: Math.round(previousAov) },
    series: buildSeries(database.orders, days),
    categoryMix: categoryMix(database.orders, database, days, categoryId),
    paymentMix,
    topProducts: topProducts(database.orders, database, days, categoryId),
    channelMix: [...channelTotals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
  };
}

export function buildDashboard(database: Database, days = 30): DashboardData {
  const analytics = buildAnalytics(database, days);
  const cutoff = Date.now() - days * 86400000;
  const previousCutoff = cutoff - days * 86400000;
  const currentOrders = database.orders.filter((order) => isBillable(order) && new Date(order.createdAt).getTime() >= cutoff);
  const previousOrders = database.orders.filter(
    (order) =>
      isBillable(order) &&
      new Date(order.createdAt).getTime() >= previousCutoff &&
      new Date(order.createdAt).getTime() < cutoff,
  );

  const revenue = analytics.totals.revenue;
  const previousRevenue = analytics.previous.revenue;
  const firstOrderAt = new Map<string, number>();
  for (const order of database.orders) {
    if (!isBillable(order)) continue;
    const at = new Date(order.createdAt).getTime();
    const seen = firstOrderAt.get(order.customerId);
    if (seen === undefined || at < seen) firstOrderAt.set(order.customerId, at);
  }
  const currentCustomers = [...firstOrderAt.values()].filter((at) => at >= cutoff).length;
  const previousCustomers = [...firstOrderAt.values()].filter((at) => at >= previousCutoff && at < cutoff).length;

  const sparkline = (selector: (order: Order) => number): number[] => {
    const points = buildSeries(database.orders, 7);
    return points.map((point) => {
      void selector;
      return point.revenue;
    });
  };

  const lowStock = inventoryRows(database)
    .filter((row) => row.status === "low" || row.status === "out")
    .slice(0, 5);

  const dispatched = database.orders.filter((order) => ["shipped", "delivered"].includes(order.status)).length;
  const pending = database.orders.filter((order) => ["pending", "processing", "packed"].includes(order.status)).length;
  const returned = database.orders.filter((order) => order.status === "returned").length;
  const fulfilmentRate = dispatched + pending === 0 ? 0 : Math.round((dispatched / (dispatched + pending)) * 100);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const admin = database.users.find((user) => user.role === "admin");

  return {
    greeting: `${greeting}, ${admin?.name.split(" ")[0] ?? "there"}`,
    range: `${days} days`,
    kpis: [
      {
        key: "revenue",
        label: "Net revenue",
        value: revenue,
        display: formatMoney(revenue),
        delta: delta(revenue, previousRevenue),
        sparkline: sparkline((order) => order.total),
        meta: `vs ${formatMoney(previousRevenue)} previous period`,
      },
      {
        key: "orders",
        label: "Orders placed",
        value: analytics.totals.orders,
        display: String(analytics.totals.orders),
        delta: delta(analytics.totals.orders, previousOrders.length),
        sparkline: buildSeries(database.orders, 30).slice(-7).map((point) => point.orders),
        meta: `${pending} awaiting dispatch`,
      },
      {
        key: "aov",
        label: "Average order value",
        value: analytics.totals.aov,
        display: formatMoney(analytics.totals.aov),
        delta: delta(analytics.totals.aov, analytics.previous.aov),
        sparkline: buildSeries(database.orders, 30).slice(-7).map((point) => (point.orders ? point.revenue / point.orders : 0)),
        meta: `${analytics.totals.units} units sold`,
      },
      {
        key: "customers",
        label: "New customers",
        value: currentCustomers,
        display: String(currentCustomers),
        delta: delta(currentCustomers, previousCustomers),
        sparkline: buildSeries(database.orders, 30).slice(-7).map((point) => point.orders),
        meta: `${database.customers.length} customers on file`,
      },
    ],
    revenueSeries: analytics.series,
    categoryMix: analytics.categoryMix,
    topProducts: analytics.topProducts,
    recentOrders: database.orders.slice(0, 12),
    lowStock,
    activity: database.audit.slice(0, 9).map((entry) => ({
      id: entry.id,
      label: entry.action.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      detail: entry.detail,
      at: entry.at,
      by: entry.actor,
    })),
    notifications: database.notifications.slice(0, 5),
    fulfilment: { rate: fulfilmentRate, dispatched, pending, returned },
    totals: {
      revenue,
      orders: analytics.totals.orders,
      aov: analytics.totals.aov,
      customers: database.customers.length,
    },
  };
}

export function csvForAnalytics(database: Database, days: number, categoryId?: string): string {
  const analytics = buildAnalytics(database, days, categoryId);
  const lines = [
    "date,revenue,orders",
    ...analytics.series.map((point) => `${dayKey(point.date)},${point.revenue},${point.orders}`),
    "",
    "category,revenue",
    ...analytics.categoryMix.map((slice) => `${slice.name},${slice.value}`),
    "",
    "product,revenue,units",
    ...analytics.topProducts.map((product) => `"${product.name.replace(/"/g, '""')}",${product.revenue},${product.units}`),
  ];
  return lines.join("\n");
}
