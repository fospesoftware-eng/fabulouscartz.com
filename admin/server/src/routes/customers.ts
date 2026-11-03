import { Router } from "express";
import { z } from "zod";
import type { Segment } from "../../../shared/types.js";
import {
  ApiError,
  asyncHandler,
  logAudit,
  pageParams,
  paginate,
  requireAuth,
  requireRole,
  validate,
} from "../helpers.js";
import { getDb, mutate } from "../store.js";

export const customersRouter = Router();
customersRouter.use(requireAuth, requireRole("admin", "manager"));

const SEGMENTS: Segment[] = ["VIP", "Repeat", "New", "At risk", "Wholesale"];

customersRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { page, pageSize } = pageParams(req, 12);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const segment = String(req.query.segment ?? "");
    const sort = String(req.query.sort ?? "ltv");
    const all = getDb().customers;
    let items = all.filter((customer) => {
      if (segment && customer.segment !== segment) return false;
      if (!q) return true;
      return [customer.name, customer.email, customer.city, customer.phone, ...customer.tags]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    if (sort === "recent") {
      items = items.slice().sort((a, b) => (b.lastOrderAt ?? "").localeCompare(a.lastOrderAt ?? ""));
    } else if (sort === "orders") {
      items = items.slice().sort((a, b) => b.ordersCount - a.ordersCount);
    } else {
      items = items.slice().sort((a, b) => b.lifetimeValue - a.lifetimeValue);
    }
    const facets = SEGMENTS.reduce<Record<string, number>>((acc, value) => {
      acc[value] = all.filter((customer) => customer.segment === value).length;
      return acc;
    }, {});
    res.json({ ...paginate(items, page, pageSize), facets });
  }),
);

customersRouter.get(
  "/:id",
  asyncHandler((req, res) => {
    const database = getDb();
    const customer = database.customers.find((entry) => entry.id === req.params.id);
    if (!customer) throw new ApiError(404, "not_found", "Customer not found.");
    const orders = database.orders
      .filter((order) => order.customerId === customer.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ customer, orders });
  }),
);

const patchSchema = z.object({
  tags: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
  segment: z.enum(["VIP", "Repeat", "New", "At risk", "Wholesale"]).optional(),
});

customersRouter.patch(
  "/:id",
  asyncHandler((req, res) => {
    const body = validate(patchSchema, req.body);
    const updated = mutate((database) => {
      const customer = database.customers.find((entry) => entry.id === req.params.id);
      if (!customer) throw new ApiError(404, "not_found", "Customer not found.");
      if (body.tags) customer.tags = [...new Set(body.tags.map((tag) => tag.trim()).filter(Boolean))];
      if (body.notes !== undefined) customer.notes = body.notes;
      if (body.segment) customer.segment = body.segment;
      logAudit(database, req.user!, "customer.updated", "customer", customer.id, `${customer.name} · ${customer.segment}`);
      return customer;
    });
    res.json(updated);
  }),
);
