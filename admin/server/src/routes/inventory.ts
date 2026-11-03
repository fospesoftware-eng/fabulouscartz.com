import { Router } from "express";
import { z } from "zod";
import {
  ApiError,
  asyncHandler,
  logAudit,
  notification,
  pageParams,
  paginate,
  requireAuth,
  validate,
} from "../helpers.js";
import { inventoryRows } from "../analytics.js";
import { getDb, mutate } from "../store.js";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get(
  "/",
  asyncHandler((req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const status = String(req.query.status ?? "");
    const database = getDb();
    const all = inventoryRows(database);
    const rows = all.filter((row) => {
      if (status && row.status !== status) return false;
      if (!q) return true;
      return [row.sku, row.productName, row.size, row.color].join(" ").toLowerCase().includes(q);
    });
    const summary = {
      units: all.reduce((sum, row) => sum + row.stock, 0),
      rented: all.reduce((sum, row) => sum + row.rented, 0),
      low: all.filter((row) => row.status === "low").length,
      out: all.filter((row) => row.status === "out").length,
      value: Math.round(all.reduce((sum, row) => sum + row.stock * row.price, 0)),
    };
    res.json({ data: rows, summary, updatedAt: new Date().toISOString() });
  }),
);

inventoryRouter.get(
  "/movements",
  asyncHandler((req, res) => {
    const { page, pageSize } = pageParams(req, 12);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const sku = String(req.query.sku ?? "");
    let items = getDb().movements.filter((movement) => {
      if (sku && movement.sku !== sku) return false;
      if (!q) return true;
      return [movement.sku, movement.productName, movement.reason, movement.actor].join(" ").toLowerCase().includes(q);
    });
    items = items.sort((a, b) => b.at.localeCompare(a.at));
    res.json(paginate(items, page, pageSize));
  }),
);

const adjustSchema = z.object({
  sku: z.string().min(1),
  delta: z.number().int().refine((value) => value !== 0, "Adjustment cannot be zero."),
  reason: z.enum([
    "Restock received",
    "Damaged in transit",
    "Cycle count correction",
    "Rental returned late",
    "Sample sold at pop-up",
    "Shrinkage",
  ]),
  note: z.string().max(400).default(""),
});

inventoryRouter.post(
  "/adjust",
  asyncHandler((req, res) => {
    const body = validate(adjustSchema, req.body);
    const result = mutate((database) => {
      let target:
        | { product: (typeof database.products)[number]; variant: (typeof database.products)[number]["variants"][number] }
        | undefined;
      for (const product of database.products) {
        const variant = product.variants.find((entry) => entry.sku === body.sku);
        if (variant) {
          target = { product, variant };
          break;
        }
      }
      if (!target) throw new ApiError(404, "not_found", "SKU not found.");
      const { product, variant } = target;
      const next = variant.stock + body.delta;
      if (next < 0) throw new ApiError(422, "validation_failed", "Stock cannot go below zero.", { delta: "Would make stock negative." });
      if (next < variant.rented) {
        throw new ApiError(422, "validation_failed", "Stock cannot fall below the number of units currently rented.", {
          delta: `At least ${variant.rented} units are out on rent.`,
        });
      }
      const movement = {
        id: `mv_${Date.now().toString(36)}`,
        sku: variant.sku,
        productId: product.id,
        productName: product.name,
        delta: body.delta,
        previous: variant.stock,
        next,
        reason: body.reason,
        note: body.note,
        actor: req.user!.name,
        at: new Date().toISOString(),
      };
      variant.stock = next;
      product.updatedAt = new Date().toISOString();
      database.movements.unshift(movement);
      database.movements = database.movements.slice(0, 1000);
      logAudit(database, req.user!, "inventory.adjusted", "inventory", variant.sku, `${body.delta > 0 ? "+" : ""}${body.delta} · ${body.reason}`);
      if (next <= variant.lowStockThreshold) {
        notification(database, `Low stock: ${product.name}`, `${variant.sku} now has ${next} units (threshold ${variant.lowStockThreshold}).`, "stock", `/inventory?status=${next === 0 ? "out" : "low"}`);
      }
      return { movement, row: inventoryRows(database).find((row) => row.sku === variant.sku) };
    });
    res.status(201).json(result);
  }),
);
