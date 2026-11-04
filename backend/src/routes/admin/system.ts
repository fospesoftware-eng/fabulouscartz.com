import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../db.js";
import { config } from "../../config.js";
import { parse } from "../../lib/validate.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../../lib/pagination.js";
import { recordAudit } from "../../lib/audit.js";
import { serializeUser } from "../../lib/serialize.js";
import { hashPassword, revokeAllSessions } from "../../lib/auth.js";
import { passwordSchema } from "../../lib/password.js";
import { USERNAME_PATTERN, allocateUsername, usernameFromEmail } from "../../lib/username.js";
import { getSettings, updateSection } from "../../services/settings.js";
import { dispatchPending } from "../../services/notifications.js";
import {
  defaultRange,
  exportCsv,
  getCategoryMix,
  getFunnel,
  getLowStock,
  getRevenueSeries,
  getSummary,
  getTopProducts,
} from "../../services/analytics.js";
import { staffActor } from "./catalog.js";

const rangeSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

function rangeOf(query: z.infer<typeof rangeSchema>) {
  return defaultRange(query.from, query.to);
}

const ROLE = z.enum(["admin", "manager", "fulfilment", "customer"]);

const settingSchemas = {
  store: z.object({
    name: z.string().min(1).max(160).optional(),
    tagline: z.string().max(300).optional(),
    email: z.string().email().optional(),
    supportPhone: z.string().max(40).optional(),
    address: z.string().max(300).optional(),
    currency: z.string().length(3).optional(),
  }),
  tax: z.object({ ratePercent: z.number().min(0).max(50).optional(), inclusive: z.boolean().optional() }),
  shipping: z.object({
    flatMinor: z.number().int().min(0).optional(),
    freeAboveMinor: z.number().int().min(0).nullable().optional(),
  }),
  payments: z.object({
    mock: z.boolean().optional(),
    phonepe: z.boolean().optional(),
    razorpay: z.boolean().optional(),
    upi: z.boolean().optional(),
    card: z.boolean().optional(),
    cod: z.boolean().optional(),
  }),
  notifications: z.object({
    orderCreated: z.boolean().optional(),
    lowStock: z.boolean().optional(),
    dailyDigest: z.boolean().optional(),
    refundRequests: z.boolean().optional(),
    newCustomer: z.boolean().optional(),
  }),
} as const;

type Section = keyof typeof settingSchemas;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function adminSystemRoutes(app: FastifyInstance): Promise<void> {
  // ----------------------------------------------------------------- analytics
  app.get(
    "/analytics/summary",
    { schema: { tags: ["Admin · Analytics"], summary: "Revenue/order/AOV summary" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      return reply.send({ data: await getSummary(rangeOf(query)) });
    },
  );

  app.get(
    "/analytics/funnel",
    { schema: { tags: ["Admin · Analytics"], summary: "Cart → order conversion funnel" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      return reply.send({ data: await getFunnel(rangeOf(query)) });
    },
  );

  app.get(
    "/analytics/category-mix",
    { schema: { tags: ["Admin · Analytics"], summary: "Revenue by category" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      return reply.send({ data: await getCategoryMix(rangeOf(query)) });
    },
  );

  app.get(
    "/analytics/top-products",
    { schema: { tags: ["Admin · Analytics"], summary: "Top products by revenue" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema.extend({ limit: z.coerce.number().int().min(1).max(50).default(10) }), request.query);
      return reply.send({ data: await getTopProducts(rangeOf(query), query.limit) });
    },
  );

  app.get(
    "/analytics/low-stock",
    { schema: { tags: ["Admin · Analytics"], summary: "Low stock report" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager", "fulfilment"]);
      const query = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }), request.query);
      return reply.send({ data: await getLowStock(query.limit) });
    },
  );

  app.get(
    "/analytics/revenue-series",
    { schema: { tags: ["Admin · Analytics"], summary: "Daily revenue series" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      return reply.send({ data: await getRevenueSeries(rangeOf(query)) });
    },
  );

  app.get(
    "/analytics/export.csv",
    { schema: { tags: ["Admin · Analytics"], summary: "CSV export (orders/products/low-stock/customers)" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(
        rangeSchema.extend({
          dataset: z.enum(["orders", "products", "low-stock", "customers"]).default("orders"),
        }),
        request.query,
      );
      const { filename, csv } = await exportCsv(query.dataset, rangeOf(query));
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${filename}"`)
        .send(csv);
    },
  );

  // ------------------------------------------------------------------ settings
  app.get(
    "/settings",
    { schema: { tags: ["Admin · Settings"], summary: "All store settings" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const [settings, taxRules, shippingRules] = await Promise.all([
        getSettings(),
        prisma.taxRule.findMany({ orderBy: { createdAt: "asc" } }),
        prisma.shippingRule.findMany({ orderBy: { sortOrder: "asc" } }),
      ]);
      return reply.send({ data: settings, rules: { taxRules, shippingRules } });
    },
  );

  app.patch(
    "/settings/:section",
    { schema: { tags: ["Admin · Settings"], summary: "Update a settings section" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { section } = parse(
        z.object({ section: z.enum(["store", "tax", "shipping", "payments", "notifications"]) }),
        request.params,
      );
      const schema = settingSchemas[section as Section];
      const patch = parse(schema, request.body) as Record<string, unknown>;
      const before = await getSettings();

      const updated = (await updateSection(section as Section, patch as never)) as Record<string, unknown>;

      if (section === "tax") {
        const rateBps = Math.round(Number(updated.ratePercent) * 100);
        const existing = await prisma.taxRule.findFirst({ where: { isActive: true } });
        if (existing) {
          await prisma.taxRule.update({ where: { id: existing.id }, data: { rateBps } });
        } else {
          await prisma.taxRule.create({ data: { name: "Standard tax", rateBps } });
        }
      }
      if (section === "shipping") {
        const existing = await prisma.shippingRule.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
        const data = {
          rateMinor: Number(updated.flatMinor),
          freeAboveMinor: updated.freeAboveMinor == null ? null : Number(updated.freeAboveMinor),
        };
        if (existing) {
          await prisma.shippingRule.update({ where: { id: existing.id }, data });
        } else {
          await prisma.shippingRule.create({ data: { name: "Standard shipping", minSubtotalMinor: 0, ...data } });
        }
      }

      await recordAudit({
        actor,
        action: `settings.${section}.update`,
        entityType: "settings",
        entityId: section,
        before: before[section as Section],
        after: patch,
        request,
      });
      return reply.send({ data: updated });
    },
  );

  // ---------------------------------------------------------------------- team
  app.get(
    "/users",
    { schema: { tags: ["Admin · Team"], summary: "List staff and customer accounts" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(
        pageSchema.extend({
          role: ROLE.optional(),
          q: z.string().max(120).optional(),
          staffOnly: z.enum(["true", "false"]).optional(),
        }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);
      const where: Record<string, unknown> = {};
      if (query.role) where.role = query.role;
      else if (query.staffOnly === "true") where.role = { not: "customer" };
      if (query.q) {
        where.OR = [
          { email: { contains: query.q } },
          { firstName: { contains: query.q } },
          { lastName: { contains: query.q } },
        ];
      }
      const [total, users] = await Promise.all([
        prisma.user.count({ where: where as never }),
        prisma.user.findMany({
          where: where as never,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: {
            id: true, email: true, firstName: true, lastName: true, role: true, phone: true,
            title: true, isActive: true, createdAt: true, lastLoginAt: true, username: true,
          },
        }),
      ]);
      return reply.send(paginated(users.map((user) => serializeUser(user)), total, page, pageSize));
    },
  );

  app.post(
    "/users",
    { schema: { tags: ["Admin · Team"], summary: "Create a staff account" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin"]);
      const input = parse(
        z.object({
          email: z.string().email(),
          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(USERNAME_PATTERN, "Username must be 3–32 characters using letters, numbers, dot, underscore or dash")
            .optional(),
          password: passwordSchema,
          firstName: z.string().min(1).max(80),
          lastName: z.string().max(80).optional(),
          role: z.enum(["admin", "manager", "fulfilment"]),
          title: z.string().max(80).optional(),
          phone: z.string().max(30).optional(),
        }),
        request.body,
      );
      const email = input.email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw conflict("An account with this email already exists");
      const username = await allocateUsername(input.username ?? usernameFromEmail(email));

      const user = await prisma.user.create({
        data: {
          email,
          username,
          passwordHash: await hashPassword(input.password),
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          role: input.role,
          title: input.title ?? null,
          phone: input.phone ?? null,
        },
      });
      await recordAudit({
        actor,
        action: "team.create",
        entityType: "user",
        entityId: user.id,
        after: { email, role: input.role, title: input.title },
        request,
      });
      return reply.status(201).send({ data: serializeUser(user) });
    },
  );

  app.patch(
    "/users/:id",
    { schema: { tags: ["Admin · Team"], summary: "Update staff role/profile" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(
        z.object({
          firstName: z.string().min(1).max(80).optional(),
          lastName: z.string().max(80).nullable().optional(),
          phone: z.string().max(30).nullable().optional(),
          title: z.string().max(80).nullable().optional(),
          role: ROLE.optional(),
          isActive: z.boolean().optional(),
        }),
        request.body,
      );
      if (id === actor.id && input.role && input.role !== "admin") {
        throw conflict("You cannot demote your own account");
      }
      const before = await prisma.user.findUnique({ where: { id } });
      if (!before) throw notFound("User not found");
      const user = await prisma.user.update({ where: { id }, data: input });
      if (input.isActive === false || (input.role && input.role !== before.role)) {
        await revokeAllSessions(id);
      }
      await recordAudit({
        actor,
        action: "team.update",
        entityType: "user",
        entityId: id,
        before: serializeUser(before),
        after: serializeUser(user),
        request,
      });
      return reply.send({ data: serializeUser(user) });
    },
  );

  app.post(
    "/users/:id/reset-password",
    { schema: { tags: ["Admin · Team"], summary: "Reset a user's password and revoke sessions" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const { newPassword } = parse(z.object({ newPassword: passwordSchema }), request.body);
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) throw notFound("User not found");
      await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(newPassword) } });
      await revokeAllSessions(id);
      await recordAudit({
        actor,
        action: "team.password.reset",
        entityType: "user",
        entityId: id,
        request,
      });
      return reply.send({ data: { id, sessionsRevoked: true } });
    },
  );

  // --------------------------------------------------------------------- audit
  app.get(
    "/audit",
    { schema: { tags: ["Admin · Audit"], summary: "Audit log with before/after diffs" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(
        pageSchema.extend({
          entityType: z.string().max(80).optional(),
          entityId: z.string().max(120).optional(),
          actorId: z.string().max(120).optional(),
          action: z.string().max(120).optional(),
          from: z.coerce.date().optional(),
          to: z.coerce.date().optional(),
        }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);
      const where: Record<string, unknown> = {};
      if (query.entityType) where.entityType = query.entityType;
      if (query.entityId) where.entityId = query.entityId;
      if (query.actorId) where.actorId = query.actorId;
      if (query.action) where.action = { contains: query.action };
      if (query.from || query.to) {
        where.createdAt = { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) };
      }
      const [total, rows] = await Promise.all([
        prisma.auditLog.count({ where: where as never }),
        prisma.auditLog.findMany({ where: where as never, orderBy: { createdAt: "desc" }, skip, take }),
      ]);
      const data = rows.map((row) => ({
        ...row,
        before: safeJson(row.before),
        after: safeJson(row.after),
      }));
      return reply.send(paginated(data, total, page, pageSize));
    },
  );

  // ------------------------------------------------------------- notifications
  app.get(
    "/notifications",
    { schema: { tags: ["Admin · Notifications"], summary: "Notification outbox" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager", "fulfilment"]);
      const query = parse(
        pageSchema.extend({ status: z.enum(["pending", "sent", "failed"]).optional() }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);
      const where = query.status ? { status: query.status } : {};
      const [total, rows] = await Promise.all([
        prisma.notification.count({ where }),
        prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      ]);
      return reply.send(paginated(rows, total, page, pageSize));
    },
  );

  app.post(
    "/notifications/dispatch",
    { schema: { tags: ["Admin · Notifications"], summary: "Flush pending notifications" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager", "fulfilment"]);
      const { limit } = parse(z.object({ limit: z.number().int().min(1).max(200).default(50) }), request.body ?? {});
      const result = await dispatchPending(limit);
      await recordAudit({ actor, action: "notifications.dispatch", entityType: "notification", after: result, request });
      return reply.send({ data: result });
    },
  );

  // --------------------------------------------------------------------- media
  app.post(
    "/media",
    { schema: { tags: ["Admin · Media"], summary: "Upload an image (multipart/form-data)" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const file = await request.file();
      if (!file) throw badRequest("No file uploaded (use multipart/form-data field 'file')");
      const extension = IMAGE_TYPES[file.mimetype];
      if (!extension) throw badRequest("Unsupported file type. Allowed: JPEG, PNG, WEBP, GIF");
      const buffer = await file.toBuffer();
      if (buffer.length > config.MAX_UPLOAD_BYTES) {
        throw badRequest(`File exceeds ${config.MAX_UPLOAD_BYTES} bytes`);
      }

      const uploadDir = path.resolve(config.UPLOAD_DIR);
      await fs.mkdir(uploadDir, { recursive: true });
      const filename = `${crypto.randomUUID()}.${extension}`;
      await fs.writeFile(path.join(uploadDir, filename), buffer);

      const asset = await prisma.mediaAsset.create({
        data: {
          filename,
          originalName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: buffer.length,
          url: `${config.PUBLIC_BASE_URL.replace(/\/$/, "")}/uploads/${filename}`,
          uploadedById: actor.id,
        },
      });
      await recordAudit({
        actor,
        action: "media.upload",
        entityType: "mediaAsset",
        entityId: asset.id,
        after: { filename, sizeBytes: buffer.length, mimeType: file.mimetype },
        request,
      });
      return reply.status(201).send({ data: asset });
    },
  );

  app.get(
    "/media",
    { schema: { tags: ["Admin · Media"], summary: "List uploaded media" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(pageSchema, request.query);
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, assets] = await Promise.all([
        prisma.mediaAsset.count(),
        prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, skip, take }),
      ]);
      return reply.send(paginated(assets, total, page, pageSize));
    },
  );

  app.delete(
    "/media/:id",
    { schema: { tags: ["Admin · Media"], summary: "Delete a media asset" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const asset = await prisma.mediaAsset.findUnique({ where: { id } });
      if (!asset) throw notFound("Media asset not found");
      await prisma.mediaAsset.delete({ where: { id } });
      await fs
        .unlink(path.resolve(config.UPLOAD_DIR, asset.filename))
        .catch(() => undefined);
      await recordAudit({
        actor,
        action: "media.delete",
        entityType: "mediaAsset",
        entityId: id,
        before: { filename: asset.filename, url: asset.url },
        request,
      });
      return reply.status(204).send();
    },
  );
}

function safeJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
