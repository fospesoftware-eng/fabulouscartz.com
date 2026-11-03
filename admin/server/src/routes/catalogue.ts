import { Router } from "express";
import { z } from "zod";
import type { Category, ContentEntry, Coupon, Vendor } from "../../../shared/types.js";
import {
  ApiError,
  asyncHandler,
  logAudit,
  notification,
  requireAuth,
  requireRole,
  validate,
} from "../helpers.js";
import { getDb, mutate, slugify } from "../store.js";

export const categoriesRouter = Router();
export const vendorsRouter = Router();
export const contentRouter = Router();
export const discountsRouter = Router();

for (const router of [categoriesRouter, vendorsRouter, contentRouter, discountsRouter]) {
  router.use(requireAuth);
}

categoriesRouter.get(
  "/",
  asyncHandler((_req, res) => {
    const database = getDb();
    const data = database.categories
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((category) => ({
        ...category,
        productCount: database.products.filter((product) => product.categoryId === category.id && product.status !== "archived").length,
        publishedCount: database.products.filter((product) => product.categoryId === category.id && product.status === "published").length,
      }));
    res.json({ data });
  }),
);

const categorySchema = z.object({
  name: z.string().min(2, "Name is required."),
  slug: z.string().optional(),
  tagline: z.string().default(""),
  description: z.string().default(""),
  image: z.string().default(""),
  accent: z.string().default("#1B6B43"),
  visible: z.boolean().default(true),
  order: z.number().int().optional(),
});

categoriesRouter.post(
  "/",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(categorySchema, req.body);
    const created = mutate((database) => {
      const category: Category = {
        id: `cat_${Date.now().toString(36)}`,
        slug: slugify(body.slug || body.name),
        name: body.name,
        tagline: body.tagline,
        description: body.description,
        image: body.image,
        accent: body.accent,
        visible: body.visible,
        order: body.order ?? database.categories.length,
        createdAt: new Date().toISOString(),
      };
      if (database.categories.some((entry) => entry.slug === category.slug)) {
        throw new ApiError(422, "validation_failed", "That slug is already used.", { slug: "Slug must be unique." });
      }
      database.categories.push(category);
      logAudit(database, req.user!, "category.created", "category", category.id, category.name);
      return category;
    });
    res.status(201).json(created);
  }),
);

categoriesRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(categorySchema.partial(), req.body);
    const updated = mutate((database) => {
      const category = database.categories.find((entry) => entry.id === req.params.id);
      if (!category) throw new ApiError(404, "not_found", "Category not found.");
      if (body.name !== undefined) category.name = body.name;
      if (body.slug) category.slug = slugify(body.slug);
      if (body.tagline !== undefined) category.tagline = body.tagline;
      if (body.description !== undefined) category.description = body.description;
      if (body.image !== undefined) category.image = body.image;
      if (body.accent !== undefined) category.accent = body.accent;
      if (body.visible !== undefined) category.visible = body.visible;
      if (body.order !== undefined) category.order = body.order;
      logAudit(database, req.user!, "category.updated", "category", category.id, category.name);
      return category;
    });
    res.json(updated);
  }),
);

categoriesRouter.post(
  "/:id/move",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const { direction } = validate(z.object({ direction: z.enum(["up", "down"]) }), req.body);
    const data = mutate((database) => {
      const ordered = database.categories.slice().sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((entry) => entry.id === req.params.id);
      if (index === -1) throw new ApiError(404, "not_found", "Category not found.");
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= ordered.length) throw new ApiError(422, "validation_failed", "Already at the edge of the order.");
      const a = ordered[index];
      const b = ordered[swapIndex];
      const orderA = a.order;
      a.order = b.order;
      b.order = orderA;
      ordered.forEach((entry, position) => {
        entry.order = position;
      });
      logAudit(database, req.user!, "category.reordered", "category", a.id, `Moved ${direction}`);
      return database.categories.slice().sort((left, right) => left.order - right.order);
    });
    res.json({ data });
  }),
);

categoriesRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler((req, res) => {
    const result = mutate((database) => {
      const category = database.categories.find((entry) => entry.id === req.params.id);
      if (!category) throw new ApiError(404, "not_found", "Category not found.");
      const used = database.products.filter((product) => product.categoryId === category.id && product.status !== "archived");
      if (used.length) {
        throw new ApiError(409, "constraint", `Move the ${used.length} live products in this category before deleting it.`);
      }
      database.categories = database.categories.filter((entry) => entry.id !== category.id);
      logAudit(database, req.user!, "category.deleted", "category", category.id, category.name);
      return { ok: true };
    });
    res.json(result);
  }),
);

vendorsRouter.get(
  "/",
  asyncHandler((_req, res) => {
    const database = getDb();
    const data = database.vendors
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((vendor) => ({
        ...vendor,
        productCount: database.products.filter((product) => product.vendorId === vendor.id && product.status !== "archived").length,
        revenue: database.orders
          .filter((order) => order.status !== "cancelled" && order.status !== "returned")
          .reduce((sum, order) => {
            const vendorItems = order.items.filter((line) => {
              const product = database.products.find((entry) => entry.id === line.productId);
              return product?.vendorId === vendor.id;
            });
            return sum + vendorItems.reduce((lineSum, line) => lineSum + line.unitPrice * line.qty, 0);
          }, 0),
      }));
    res.json({ data });
  }),
);

const vendorSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  email: z.string().email(),
  location: z.string().default(""),
  description: z.string().default(""),
  rating: z.number().min(0).max(5).default(0),
  active: z.boolean().default(true),
});

vendorsRouter.post(
  "/",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(vendorSchema, req.body);
    const created = mutate((database) => {
      const vendor: Vendor = {
        id: `ven_${Date.now().toString(36)}`,
        slug: slugify(body.slug || body.name),
        name: body.name,
        rating: body.rating,
        sales: 0,
        email: body.email,
        location: body.location,
        description: body.description,
        active: body.active,
        order: database.vendors.length,
        createdAt: new Date().toISOString(),
      };
      database.vendors.push(vendor);
      logAudit(database, req.user!, "vendor.created", "vendor", vendor.id, vendor.name);
      return vendor;
    });
    res.status(201).json(created);
  }),
);

vendorsRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(vendorSchema.partial(), req.body);
    const updated = mutate((database) => {
      const vendor = database.vendors.find((entry) => entry.id === req.params.id);
      if (!vendor) throw new ApiError(404, "not_found", "Vendor not found.");
      Object.assign(vendor, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.slug ? { slug: slugify(body.slug) } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.rating !== undefined ? { rating: body.rating } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      });
      logAudit(database, req.user!, "vendor.updated", "vendor", vendor.id, vendor.name);
      return vendor;
    });
    res.json(updated);
  }),
);

vendorsRouter.post(
  "/:id/move",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const { direction } = validate(z.object({ direction: z.enum(["up", "down"]) }), req.body);
    mutate((database) => {
      const ordered = database.vendors.slice().sort((a, b) => a.order - b.order);
      const index = ordered.findIndex((entry) => entry.id === req.params.id);
      if (index === -1) throw new ApiError(404, "not_found", "Vendor not found.");
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= ordered.length) throw new ApiError(422, "validation_failed", "Already at the edge of the order.");
      [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
      ordered.forEach((entry, position) => {
        entry.order = position;
      });
      logAudit(database, req.user!, "vendor.reordered", "vendor", req.params.id, `Moved ${direction}`);
      return true;
    });
    const data = getDb().vendors.slice().sort((a, b) => a.order - b.order);
    res.json({ data });
  }),
);

contentRouter.get(
  "/",
  asyncHandler((req, res) => {
    const type = String(req.query.type ?? "");
    const status = String(req.query.status ?? "");
    const data = getDb()
      .content.filter((entry) => {
        if (type && entry.type !== type) return false;
        if (status && entry.status !== status) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ data });
  }),
);

const contentSchema = z.object({
  type: z.enum(["hero", "banner", "editorial"]),
  title: z.string().min(3),
  subtitle: z.string().default(""),
  body: z.string().default(""),
  image: z.string().default(""),
  ctaLabel: z.string().default(""),
  ctaHref: z.string().default(""),
  status: z.enum(["draft", "published"]).default("draft"),
});

contentRouter.post(
  "/",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(contentSchema, req.body);
    const created = mutate((database) => {
      const entry: ContentEntry = {
        id: `cnt_${Date.now().toString(36)}`,
        ...body,
        author: req.user!.name,
        updatedAt: new Date().toISOString(),
      };
      database.content.unshift(entry);
      logAudit(database, req.user!, "content.created", "content", entry.id, entry.title);
      return entry;
    });
    res.status(201).json(created);
  }),
);

contentRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(contentSchema.partial(), req.body);
    const updated = mutate((database) => {
      const entry = database.content.find((item) => item.id === req.params.id);
      if (!entry) throw new ApiError(404, "not_found", "Content entry not found.");
      Object.assign(entry, body, { updatedAt: new Date().toISOString() });
      logAudit(database, req.user!, "content.updated", "content", entry.id, entry.title);
      return entry;
    });
    res.json(updated);
  }),
);

contentRouter.post(
  "/:id/publish",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const updated = mutate((database) => {
      const entry = database.content.find((item) => item.id === req.params.id);
      if (!entry) throw new ApiError(404, "not_found", "Content entry not found.");
      entry.status = entry.status === "published" ? "draft" : "published";
      entry.updatedAt = new Date().toISOString();
      logAudit(database, req.user!, entry.status === "published" ? "content.published" : "content.unpublished", "content", entry.id, entry.title);
      return entry;
    });
    res.json(updated);
  }),
);

contentRouter.delete(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const result = mutate((database) => {
      const entry = database.content.find((item) => item.id === req.params.id);
      if (!entry) throw new ApiError(404, "not_found", "Content entry not found.");
      database.content = database.content.filter((item) => item.id !== entry.id);
      logAudit(database, req.user!, "content.deleted", "content", entry.id, entry.title);
      return { ok: true };
    });
    res.json(result);
  }),
);

discountsRouter.get(
  "/",
  asyncHandler((_req, res) => {
    const data = getDb().coupons.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ data });
  }),
);

const couponSchema = z.object({
  code: z.string().min(3).max(24),
  description: z.string().default(""),
  type: z.enum(["percent", "flat"]),
  value: z.number().positive(),
  minSpend: z.number().nonnegative().default(0),
  startsAt: z.string(),
  endsAt: z.string(),
  usageLimit: z.number().int().positive().default(100),
  active: z.boolean().default(true),
  appliesTo: z.string().default("all"),
});

function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function couponDiscount(coupon: Coupon, subtotal: number): number {
  if (coupon.type === "flat") return Math.min(coupon.value, subtotal);
  return Math.round(subtotal * (coupon.value / 100));
}

discountsRouter.post(
  "/validate",
  asyncHandler((req, res) => {
    const body = validate(z.object({ code: z.string().min(1), subtotal: z.number().nonnegative(), categoryId: z.string().optional() }), req.body);
    const database = getDb();
    const coupon = database.coupons.find((entry) => entry.code === normaliseCode(body.code));
    const fail = (message: string) => res.json({ valid: false, code: normaliseCode(body.code), discount: 0, total: body.subtotal, message });
    if (!coupon) return fail("That code is not recognised.");
    if (!coupon.active) return fail("This promotion is not active.");
    const now = Date.now();
    if (now < new Date(coupon.startsAt).getTime()) return fail("This promotion has not started yet.");
    if (now > new Date(coupon.endsAt).getTime()) return fail("This promotion has expired.");
    if (coupon.used >= coupon.usageLimit) return fail("This code has reached its usage cap.");
    if (body.subtotal < coupon.minSpend) return fail(`Minimum spend of $${coupon.minSpend} required.`);
    if (coupon.appliesTo !== "all" && body.categoryId && coupon.appliesTo !== body.categoryId) {
      return fail("This code does not apply to the selected category.");
    }
    const discount = couponDiscount(coupon, body.subtotal);
    return res.json({
      valid: true,
      code: coupon.code,
      discount,
      total: Math.max(0, body.subtotal - discount),
      message: `${coupon.type === "percent" ? `${coupon.value}% off` : `$${coupon.value} off`} applied.`,
    });
  }),
);

discountsRouter.post(
  "/",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(couponSchema, req.body);
    const created = mutate((database) => {
      const code = normaliseCode(body.code);
      if (!code) throw new ApiError(422, "validation_failed", "Code is invalid.", { code: "Use letters or numbers." });
      if (database.coupons.some((entry) => entry.code === code)) {
        throw new ApiError(422, "validation_failed", "That code already exists.", { code: "Code must be unique." });
      }
      const coupon: Coupon = {
        id: `coup_${Date.now().toString(36)}`,
        code,
        description: body.description,
        type: body.type,
        value: body.value,
        minSpend: body.minSpend,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        usageLimit: body.usageLimit,
        used: 0,
        active: body.active,
        appliesTo: body.appliesTo,
        createdAt: new Date().toISOString(),
      };
      database.coupons.unshift(coupon);
      logAudit(database, req.user!, "discount.created", "discount", coupon.id, `${coupon.code} · ${coupon.type} ${coupon.value}`);
      return coupon;
    });
    res.status(201).json(created);
  }),
);

discountsRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(couponSchema.partial(), req.body);
    const updated = mutate((database) => {
      const coupon = database.coupons.find((entry) => entry.id === req.params.id);
      if (!coupon) throw new ApiError(404, "not_found", "Coupon not found.");
      if (body.code) {
        const code = normaliseCode(body.code);
        if (database.coupons.some((entry) => entry.code === code && entry.id !== coupon.id)) {
          throw new ApiError(422, "validation_failed", "That code already exists.", { code: "Code must be unique." });
        }
        coupon.code = code;
      }
      Object.assign(coupon, {
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type ? { type: body.type } : {}),
        ...(body.value !== undefined ? { value: body.value } : {}),
        ...(body.minSpend !== undefined ? { minSpend: body.minSpend } : {}),
        ...(body.startsAt ? { startsAt: body.startsAt } : {}),
        ...(body.endsAt ? { endsAt: body.endsAt } : {}),
        ...(body.usageLimit !== undefined ? { usageLimit: body.usageLimit } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.appliesTo ? { appliesTo: body.appliesTo } : {}),
      });
      logAudit(database, req.user!, "discount.updated", "discount", coupon.id, `${coupon.code} · ${coupon.active ? "active" : "paused"}`);
      return coupon;
    });
    res.json(updated);
  }),
);

discountsRouter.delete(
  "/:id",
  requireRole("admin"),
  asyncHandler((req, res) => {
    const result = mutate((database) => {
      const coupon = database.coupons.find((entry) => entry.id === req.params.id);
      if (!coupon) throw new ApiError(404, "not_found", "Coupon not found.");
      database.coupons = database.coupons.filter((entry) => entry.id !== coupon.id);
      logAudit(database, req.user!, "discount.deleted", "discount", coupon.id, coupon.code);
      notification(database, `Coupon ${coupon.code} deleted`, "The code will no longer validate at checkout.", "system", "/discounts");
      return { ok: true };
    });
    res.json(result);
  }),
);
