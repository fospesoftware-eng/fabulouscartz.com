import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { z } from "zod";
import type { MediaAsset, Settings } from "../../../shared/types.js";
import {
  ApiError,
  asyncHandler,
  logAudit,
  pageParams,
  paginate,
  publicUser,
  requireAuth,
  requireRole,
  validate,
} from "../helpers.js";
import { buildAnalytics, buildDashboard, csvForAnalytics } from "../analytics.js";
import { getDb, mutate } from "../store.js";
import { hashPassword } from "../security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mediaRoot = path.resolve(__dirname, "../../../public/media");

export const dashboardRouter = Router();
export const analyticsRouter = Router();
export const settingsRouter = Router();
export const teamRouter = Router();
export const auditRouter = Router();
export const notificationsRouter = Router();
export const mediaRouter = Router();
export const searchRouter = Router();
export const healthRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  asyncHandler((req, res) => {
    const range = [7, 30, 90].includes(Number(req.query.range)) ? Number(req.query.range) : 30;
    res.json(buildDashboard(getDb(), range));
  }),
);

analyticsRouter.use(requireAuth, requireRole("admin", "manager"));

analyticsRouter.get(
  "/",
  asyncHandler((req, res) => {
    const range = [7, 30, 90].includes(Number(req.query.range)) ? Number(req.query.range) : 30;
    const categoryId = String(req.query.categoryId ?? "");
    res.json(buildAnalytics(getDb(), range, categoryId || undefined));
  }),
);

analyticsRouter.get(
  "/export.csv",
  asyncHandler((req, res) => {
    const range = [7, 30, 90].includes(Number(req.query.range)) ? Number(req.query.range) : 30;
    const categoryId = String(req.query.categoryId ?? "");
    const csv = csvForAnalytics(getDb(), range, categoryId || undefined);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="fabulouscartz-analytics-${range}d.csv"`);
    res.send(csv);
  }),
);

settingsRouter.use(requireAuth);

settingsRouter.get(
  "/",
  asyncHandler((_req, res) => {
    res.json(getDb().settings);
  }),
);

const settingsSchema = z.object({
  brand: z
    .object({
      name: z.string().min(2).optional(),
      tagline: z.string().optional(),
      email: z.string().email().optional(),
      supportPhone: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  currency: z.string().min(1).optional(),
  taxRate: z.number().min(0).max(30).optional(),
  shippingFlat: z.number().min(0).optional(),
  freeShippingThreshold: z.number().min(0).optional(),
  payments: z
    .record(z.enum(["phonepe", "gpay", "upi", "card", "cod"]), z.boolean())
    .optional(),
  notifications: z
    .object({
      orderCreated: z.boolean().optional(),
      lowStock: z.boolean().optional(),
      dailyDigest: z.boolean().optional(),
      refundRequests: z.boolean().optional(),
      newCustomer: z.boolean().optional(),
    })
    .optional(),
});

settingsRouter.patch(
  "/",
  requireRole("admin"),
  asyncHandler((req, res) => {
    const body = validate(settingsSchema, req.body);
    const settings = mutate((database) => {
      const current = database.settings as Settings;
      database.settings = {
        ...current,
        ...body,
        brand: { ...current.brand, ...(body.brand ?? {}) },
        payments: { ...current.payments, ...(body.payments ?? {}) },
        notifications: { ...current.notifications, ...(body.notifications ?? {}) },
      };
      logAudit(database, req.user!, "settings.updated", "settings", "settings", Object.keys(body).join(", "));
      return database.settings;
    });
    res.json(settings);
  }),
);

teamRouter.use(requireAuth, requireRole("admin", "manager"));

teamRouter.get(
  "/",
  asyncHandler((_req, res) => {
    res.json({ data: getDb().users.map(publicUser) });
  }),
);

const teamCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["admin", "manager", "fulfilment"]),
  title: z.string().min(2),
  password: z.string().min(8, "Use at least 8 characters."),
});

teamRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler((req, res) => {
    const body = validate(teamCreateSchema, req.body);
    const user = mutate((database) => {
      if (database.users.some((entry) => entry.email.toLowerCase() === body.email.toLowerCase())) {
        throw new ApiError(422, "validation_failed", "That email already has an account.", { email: "Email already in use." });
      }
      const hashed = hashPassword(body.password);
      const created = {
        id: `usr_${Date.now().toString(36)}`,
        name: body.name,
        email: body.email.toLowerCase(),
        role: body.role,
        title: body.title,
        lastActiveAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        passwordSalt: hashed.salt,
        passwordHash: hashed.hash,
      };
      database.users.push(created);
      logAudit(database, req.user!, "team.member_added", "team", created.id, `${created.name} · ${created.role}`);
      return publicUser(created);
    });
    res.status(201).json(user);
  }),
);

teamRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler((req, res) => {
    const body = validate(
      z.object({
        name: z.string().min(2).optional(),
        title: z.string().min(2).optional(),
        role: z.enum(["admin", "manager", "fulfilment"]).optional(),
        password: z.string().min(8).optional(),
      }),
      req.body,
    );
    const updated = mutate((database) => {
      const user = database.users.find((entry) => entry.id === req.params.id);
      if (!user) throw new ApiError(404, "not_found", "Team member not found.");
      if (body.role && user.role === "admin" && body.role !== "admin") {
        const otherAdmins = database.users.filter((entry) => entry.role === "admin" && entry.id !== user.id);
        if (otherAdmins.length === 0) throw new ApiError(409, "constraint", "At least one admin must remain.");
      }
      if (body.name) user.name = body.name;
      if (body.title) user.title = body.title;
      if (body.role) user.role = body.role;
      if (body.password) {
        const hashed = hashPassword(body.password);
        user.passwordSalt = hashed.salt;
        user.passwordHash = hashed.hash;
      }
      logAudit(database, req.user!, "team.member_updated", "team", user.id, `${user.name} · ${user.role}`);
      return publicUser(user);
    });
    res.json(updated);
  }),
);

teamRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler((req, res) => {
    const result = mutate((database) => {
      const user = database.users.find((entry) => entry.id === req.params.id);
      if (!user) throw new ApiError(404, "not_found", "Team member not found.");
      if (user.id === req.user!.id) throw new ApiError(409, "constraint", "You cannot remove your own account.");
      if (user.role === "admin" && database.users.filter((entry) => entry.role === "admin").length === 1) {
        throw new ApiError(409, "constraint", "At least one admin must remain.");
      }
      database.users = database.users.filter((entry) => entry.id !== user.id);
      logAudit(database, req.user!, "team.member_removed", "team", user.id, user.name);
      return { ok: true };
    });
    res.json(result);
  }),
);

auditRouter.use(requireAuth, requireRole("admin", "manager"));

auditRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { page, pageSize } = pageParams(req, 20);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const entity = String(req.query.entity ?? "");
    const items = getDb().audit.filter((entry) => {
      if (entity && entry.entity !== entity) return false;
      if (!q) return true;
      return [entry.actor, entry.action, entry.detail, entry.entityId].join(" ").toLowerCase().includes(q);
    });
    const facets = getDb().audit.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.entity] = (acc[entry.entity] ?? 0) + 1;
      return acc;
    }, {});
    res.json({ ...paginate(items, page, pageSize), facets });
  }),
);

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  "/",
  asyncHandler((_req, res) => {
    const data = getDb().notifications.slice().sort((a, b) => b.at.localeCompare(a.at));
    res.json({ data, unread: data.filter((entry) => !entry.read).length });
  }),
);

notificationsRouter.patch(
  "/:id/read",
  asyncHandler((req, res) => {
    const result = mutate((database) => {
      const entry = database.notifications.find((item) => item.id === req.params.id);
      if (!entry) throw new ApiError(404, "not_found", "Notification not found.");
      entry.read = true;
      return { ok: true };
    });
    res.json(result);
  }),
);

notificationsRouter.post(
  "/read-all",
  asyncHandler((_req, res) => {
    const result = mutate((database) => {
      database.notifications.forEach((entry) => {
        entry.read = true;
      });
      return { ok: true };
    });
    res.json(result);
  }),
);

mediaRouter.use(requireAuth);

function walkMedia(directory: string, base: string): MediaAsset[] {
  const assets: MediaAsset[] = [];
  if (!fs.existsSync(directory)) return assets;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assets.push(...walkMedia(full, base));
      continue;
    }
    if (!/\.(webp|png|jpe?g|svg|avif)$/i.test(entry.name)) continue;
    const relative = path.relative(base, full).split(path.sep).join("/");
    assets.push({
      name: entry.name,
      url: `/media/${relative}`,
      folder: path.dirname(relative).replace(/^\.$/, "media"),
      size: fs.statSync(full).size,
    });
  }
  return assets;
}

mediaRouter.get(
  "/",
  asyncHandler((_req, res) => {
    const data = walkMedia(mediaRoot, mediaRoot).sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
    res.json({ data, folders: [...new Set(data.map((asset) => asset.folder))] });
  }),
);

searchRouter.use(requireAuth);

searchRouter.get(
  "/",
  asyncHandler((req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (q.length < 2) return res.json({ products: [], orders: [], customers: [] });
    const database = getDb();
    const products = database.products
      .filter((product) => [product.name, product.slug, ...product.tags].join(" ").toLowerCase().includes(q))
      .slice(0, 5)
      .map((product) => ({ id: product.id, name: product.name, slug: product.slug, images: product.images, status: product.status }));
    const orders = database.orders
      .filter((order) => [order.number, order.customerName, order.customerEmail].join(" ").toLowerCase().includes(q))
      .slice(0, 5)
      .map((order) => ({ id: order.id, number: order.number, customerName: order.customerName, total: order.total, status: order.status }));
    const customers =
      req.user!.role === "fulfilment"
        ? []
        : database.customers
            .filter((customer) => [customer.name, customer.email, customer.city].join(" ").toLowerCase().includes(q))
            .slice(0, 5)
            .map((customer) => ({ id: customer.id, name: customer.name, email: customer.email }));
    return res.json({ products, orders, customers });
  }),
);

healthRouter.get(
  "/",
  asyncHandler((_req, res) => {
    const database = getDb();
    res.json({
      ok: true,
      service: "fabulouscartz-admin-api",
      version: "1.0.0",
      storage: "json-file",
      seededAt: database.seededAt,
      counts: {
        products: database.products.length,
        orders: database.orders.length,
        customers: database.customers.length,
        users: database.users.length,
      },
      uptimeSeconds: Math.round(process.uptime()),
    });
  }),
);
