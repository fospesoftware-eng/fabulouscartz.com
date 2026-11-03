import { Router } from "express";
import type { Order, TopProduct, UsMapData, UsStateOrders } from "../../../shared/types.js";
import { US_STATE_BY_CODE, US_STATES } from "../../../shared/us-states.js";
import { ApiError, asyncHandler, requireAuth } from "../helpers.js";
import { getDb } from "../store.js";
import { isBillable } from "../analytics.js";

export const mapRouter = Router();

mapRouter.use(requireAuth);

function rangeDays(raw: unknown): number {
  const value = Number(raw);
  return [7, 30, 90].includes(value) ? value : 30;
}

function ordersInRange(range: number): Order[] {
  const cutoff = Date.now() - range * 86400000;
  return getDb().orders.filter(
    (order) =>
      isBillable(order) &&
      order.shippingAddress.country === "United States" &&
      new Date(order.createdAt).getTime() >= cutoff,
  );
}

function metricsFor(state: { code: string; name: string }, orders: Order[], totalOrders: number): UsStateOrders {
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  const units = orders.reduce((sum, order) => sum + order.items.reduce((lineSum, line) => lineSum + line.qty, 0), 0);
  return {
    code: state.code,
    name: state.name,
    orders: orders.length,
    revenue: Math.round(revenue),
    aov: orders.length ? Math.round(revenue / orders.length) : 0,
    units,
    share: totalOrders ? Math.round((orders.length / totalOrders) * 1000) / 10 : 0,
  };
}

mapRouter.get(
  "/states",
  asyncHandler((req, res) => {
    const range = rangeDays(req.query.range);
    const orders = ordersInRange(range);
    const byState = new Map<string, Order[]>();
    for (const order of orders) {
      const bucket = byState.get(order.shippingAddress.state) ?? [];
      bucket.push(order);
      byState.set(order.shippingAddress.state, bucket);
    }
    const states = US_STATES.map((state) => metricsFor(state, byState.get(state.name) ?? [], orders.length));
    const revenue = orders.reduce((sum, order) => sum + order.total, 0);
    const units = orders.reduce((sum, order) => sum + order.items.reduce((lineSum, line) => lineSum + line.qty, 0), 0);
    const payload: UsMapData = {
      range,
      totals: {
        orders: orders.length,
        revenue: Math.round(revenue),
        aov: orders.length ? Math.round(revenue / orders.length) : 0,
        units,
      },
      states,
    };
    res.json(payload);
  }),
);

mapRouter.get(
  "/states/:code",
  asyncHandler((req, res) => {
    const state = US_STATE_BY_CODE[String(req.params.code).toUpperCase()];
    if (!state) throw new ApiError(404, "not_found", "Unknown US state.");
    const range = rangeDays(req.query.range);
    const orders = ordersInRange(range).filter((order) => order.shippingAddress.state === state.name);
    const database = getDb();

    const grouped = new Map<string, { units: number; revenue: number }>();
    for (const order of orders) {
      for (const line of order.items) {
        const entry = grouped.get(line.productId) ?? { units: 0, revenue: 0 };
        entry.units += line.qty;
        entry.revenue += line.unitPrice * line.qty;
        grouped.set(line.productId, entry);
      }
    }
    const topProducts: TopProduct[] = [...grouped.entries()]
      .map(([productId, values]) => {
        const product = database.products.find((entry) => entry.id === productId);
        return {
          id: productId,
          name: product?.name ?? "Removed piece",
          image: product?.images[0] ?? "",
          category: database.categories.find((entry) => entry.id === product?.categoryId)?.name ?? "Uncategorised",
          revenue: Math.round(values.revenue),
          units: values.units,
        };
      })
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    const totalOrders = ordersInRange(range).length;
    res.json({
      state: metricsFor(state, orders, totalOrders),
      range,
      topProducts,
      recentOrders: orders.slice(0, 8),
    });
  }),
);
