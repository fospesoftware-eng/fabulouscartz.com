import { Router } from "express";
import { z } from "zod";
import type { OrderStatus, PaymentStatus } from "../../../shared/types.js";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "../../../shared/types.js";
import {
  ApiError,
  asyncHandler,
  logAudit,
  notification,
  pageParams,
  paginate,
  requireAuth,
  requireRole,
  validate,
} from "../helpers.js";
import { getDb, mutate } from "../store.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

function statusOf(value: unknown): OrderStatus[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(entry));
}

ordersRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { page, pageSize } = pageParams(req, 15);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const statuses = statusOf(req.query.status);
    const payment = PAYMENT_STATUSES.includes(String(req.query.paymentStatus ?? "") as PaymentStatus)
      ? String(req.query.paymentStatus)
      : "";
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59`) : null;
    const customerId = String(req.query.customerId ?? "");
    const state = String(req.query.state ?? "").trim();
    const sort = String(req.query.sort ?? "newest");
    const all = getDb().orders.slice();

    let items = all.filter((order) => {
      if (statuses.length && !statuses.includes(order.status)) return false;
      if (payment && order.paymentStatus !== payment) return false;
      if (customerId && order.customerId !== customerId) return false;
      if (state && order.shippingAddress.state.toLowerCase() !== state.toLowerCase()) return false;
      if (from && new Date(order.createdAt) < from) return false;
      if (to && new Date(order.createdAt) > to) return false;
      if (!q) return true;
      const haystack = [
        order.number,
        order.customerName,
        order.customerEmail,
        order.customerPhone,
        order.shippingAddress.city,
        ...order.items.map((line) => line.name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    if (sort === "oldest") items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sort === "total_desc") items.sort((a, b) => b.total - a.total);
    else if (sort === "total_asc") items.sort((a, b) => a.total - b.total);
    else items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const facets = ORDER_STATUSES.reduce<Record<string, number>>((acc, status) => {
      acc[status] = all.filter((order) => order.status === status).length;
      return acc;
    }, {});

    res.json({ ...paginate(items, page, pageSize), facets });
  }),
);

ordersRouter.get(
  "/:id",
  asyncHandler((req, res) => {
    const order = getDb().orders.find((entry) => entry.id === req.params.id || entry.number === req.params.id);
    if (!order) throw new ApiError(404, "not_found", "Order not found.");
    res.json(order);
  }),
);

const updateSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
});

ordersRouter.patch(
  "/:id",
  asyncHandler((req, res) => {
    const body = validate(updateSchema, req.body);
    if (!body.status && !body.paymentStatus) throw new ApiError(422, "validation_failed", "Nothing to update.");
    const updated = mutate((database) => {
      const order = database.orders.find((entry) => entry.id === req.params.id || entry.number === req.params.id);
      if (!order) throw new ApiError(404, "not_found", "Order not found.");
      const previous = order.status;
      if (body.status && body.status !== order.status) {
        order.status = body.status as OrderStatus;
        if ((body.status === "cancelled" || body.status === "returned") && order.paymentStatus === "paid") {
          order.paymentStatus = "refunded";
        }
        order.timeline.push({
          id: `tl_live_${Date.now()}`,
          label: `Status changed to ${body.status}`,
          detail: `Previous status: ${previous}`,
          at: new Date().toISOString(),
          by: req.user!.name,
        });
        logAudit(database, req.user!, "order.status_updated", "order", order.id, `${previous} → ${body.status}`);
        notification(database, `Order ${order.number} moved to ${body.status}`, `${order.customerName} · ${req.user!.name} updated the fulfilment state.`, "order", `/orders?status=${body.status}`);
      }
      if (body.paymentStatus && body.paymentStatus !== order.paymentStatus) {
        const before = order.paymentStatus;
        order.paymentStatus = body.paymentStatus;
        order.timeline.push({
          id: `tl_live_${Date.now()}_pay`,
          label: `Payment marked ${body.paymentStatus}`,
          at: new Date().toISOString(),
          by: req.user!.name,
        });
        logAudit(database, req.user!, "order.payment_updated", "order", order.id, `${before} → ${body.paymentStatus}`);
      }
      order.updatedAt = new Date().toISOString();
      return order;
    });
    res.json(updated);
  }),
);

const noteSchema = z.object({ body: z.string().min(2, "Write at least a couple of words.").max(800) });

ordersRouter.post(
  "/:id/notes",
  asyncHandler((req, res) => {
    const body = validate(noteSchema, req.body);
    const order = mutate((database) => {
      const entry = database.orders.find((order) => order.id === req.params.id);
      if (!entry) throw new ApiError(404, "not_found", "Order not found.");
      entry.notes.unshift({
        id: `note_${Date.now().toString(36)}`,
        author: req.user!.name,
        body: body.body,
        createdAt: new Date().toISOString(),
      });
      entry.updatedAt = new Date().toISOString();
      logAudit(database, req.user!, "order.note_added", "order", entry.id, body.body.slice(0, 120));
      return entry;
    });
    res.status(201).json(order);
  }),
);

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Select at least one order."),
  status: z.enum(ORDER_STATUSES),
});

ordersRouter.post(
  "/bulk-status",
  asyncHandler((req, res) => {
    const body = validate(bulkSchema, req.body);
    const result = mutate((database) => {
      const changed: string[] = [];
      for (const id of body.ids) {
        const order = database.orders.find((entry) => entry.id === id);
        if (!order) continue;
        if (order.status !== body.status) {
          order.status = body.status;
          if ((body.status === "cancelled" || body.status === "returned") && order.paymentStatus === "paid") {
            order.paymentStatus = "refunded";
          }
          order.updatedAt = new Date().toISOString();
          order.timeline.push({
            id: `tl_bulk_${Date.now()}_${order.id}`,
            label: `Bulk status: ${body.status}`,
            at: new Date().toISOString(),
            by: req.user!.name,
          });
          changed.push(order.id);
        }
      }
      logAudit(database, req.user!, "order.bulk_status", "order", body.ids.join(", "), `${changed.length} orders → ${body.status}`);
      return { updated: changed.length, orders: database.orders.filter((order) => body.ids.includes(order.id)) };
    });
    res.json(result);
  }),
);
