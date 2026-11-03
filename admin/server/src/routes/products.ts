import { Router } from "express";
import { z } from "zod";
import type { Product, ProductStatus, Variant } from "../../../shared/types.js";
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
import { getDb, mutate, slugify } from "../store.js";

export const productsRouter = Router();
productsRouter.use(requireAuth);

const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().optional(),
  size: z.string().min(1, "Size is required."),
  color: z.string().min(1, "Colour is required."),
  price: z.number().nonnegative(),
  rentalPrice: z.number().nonnegative().default(0),
  stock: z.number().int().nonnegative(),
  rented: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().default(5),
  rentWindowDays: z.number().int().positive().default(5),
});

const productSchema = z.object({
  name: z.string().min(3, "Give the piece a name."),
  slug: z.string().optional(),
  description: z.string().min(10, "Write a short edit note."),
  details: z.array(z.string()).default([]),
  price: z.number().positive("Price must be greater than zero."),
  mrp: z.number().positive().optional(),
  modes: z.array(z.enum(["buy", "rent"])).min(1, "Choose at least one mode."),
  categoryId: z.string().min(1, "Choose a category."),
  vendorId: z.string().min(1, "Choose a vendor."),
  images: z.array(z.string()).min(1, "Add at least one image."),
  variants: z.array(variantSchema).min(1, "Add at least one variant."),
  tags: z.array(z.string()).default([]),
  status: z.enum(["published", "draft", "archived"]).default("draft"),
  featured: z.boolean().default(false),
  newArrival: z.boolean().default(false),
  topSeller: z.boolean().default(false),
  rating: z.number().min(0).max(5).default(0),
  reviews: z.number().int().nonnegative().default(0),
});

const productPatchSchema = productSchema.partial();

function uniqueSlug(base: string, products: Product[], ignoreId?: string): string {
  let candidate = slugify(base) || "product";
  let index = 2;
  while (products.some((product) => product.slug === candidate && product.id !== ignoreId)) {
    candidate = `${slugify(base)}-${index}`;
    index += 1;
  }
  return candidate;
}

function variantWithIdentity(variant: z.infer<typeof variantSchema>, prefix: string, index: number, used: Set<string>): Variant {
  const sizeCode = variant.size.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 4) || "OS";
  const colorCode = variant.color.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 4) || "CLR";
  let sku = (variant.sku ?? "").trim().toUpperCase();
  if (!sku) {
    sku = `FC-${prefix}-${sizeCode}-${colorCode}`;
    let suffix = 2;
    while (used.has(sku)) {
      sku = `FC-${prefix}-${sizeCode}-${colorCode}-${suffix}`;
      suffix += 1;
    }
  }
  used.add(sku);
  return {
    id: variant.id ?? `var_${prefix}_${index + 1}_${Math.random().toString(36).slice(2, 5)}`,
    sku,
    size: variant.size,
    color: variant.color,
    price: variant.price,
    rentalPrice: variant.rentalPrice,
    stock: variant.stock,
    rented: variant.rented,
    lowStockThreshold: variant.lowStockThreshold,
    rentWindowDays: variant.rentWindowDays,
  };
}

function assertRelations(database: { categories: { id: string }[]; vendors: { id: string }[] }, categoryId?: string, vendorId?: string): void {
  if (categoryId && !database.categories.some((category) => category.id === categoryId)) {
    throw new ApiError(422, "validation_failed", "Unknown category.", { categoryId: "Category not found." });
  }
  if (vendorId && !database.vendors.some((vendor) => vendor.id === vendorId)) {
    throw new ApiError(422, "validation_failed", "Unknown vendor.", { vendorId: "Vendor not found." });
  }
}

productsRouter.get(
  "/",
  asyncHandler((req, res) => {
    const { page, pageSize } = pageParams(req, 12);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const status = String(req.query.status ?? "");
    const categoryId = String(req.query.categoryId ?? "");
    const vendorId = String(req.query.vendorId ?? "");
    const mode = String(req.query.mode ?? "");
    const sort = String(req.query.sort ?? "updated");
    const database = getDb();

    let items = database.products.filter((product) => {
      if (status && product.status !== status) return false;
      if (categoryId && product.categoryId !== categoryId) return false;
      if (vendorId && product.vendorId !== vendorId) return false;
      if (mode && !product.modes.includes(mode as Product["modes"][number])) return false;
      if (!q) return true;
      const vendor = database.vendors.find((entry) => entry.id === product.vendorId)?.name ?? "";
      const category = database.categories.find((entry) => entry.id === product.categoryId)?.name ?? "";
      return [product.name, product.slug, vendor, category, ...product.tags].join(" ").toLowerCase().includes(q);
    });

    if (sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "price_asc") items.sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") items.sort((a, b) => b.price - a.price);
    else if (sort === "stock") items.sort((a, b) => stockOf(a) - stockOf(b));
    else items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const facets = {
      all: database.products.length,
      published: database.products.filter((product) => product.status === "published").length,
      draft: database.products.filter((product) => product.status === "draft").length,
      archived: database.products.filter((product) => product.status === "archived").length,
    };
    res.json({ ...paginate(items, page, pageSize), facets });
  }),
);

function stockOf(product: Product): number {
  return product.variants.reduce((sum, variant) => sum + variant.stock, 0);
}

productsRouter.get(
  "/:id",
  asyncHandler((req, res) => {
    const product = getDb().products.find((entry) => entry.id === req.params.id || entry.slug === req.params.id);
    if (!product) throw new ApiError(404, "not_found", "Product not found.");
    res.json(product);
  }),
);

productsRouter.post(
  "/",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(productSchema, req.body);
    const product = mutate((database) => {
      assertRelations(database, body.categoryId, body.vendorId);
      const used = new Set<string>(database.products.flatMap((entry) => entry.variants.map((variant) => variant.sku)));
      const prefix = String(database.products.length + 1).padStart(3, "0");
      const created: Product = {
        id: `prd_${Date.now().toString(36)}`,
        slug: uniqueSlug(body.slug || body.name, database.products),
        name: body.name,
        description: body.description,
        details: body.details.filter(Boolean),
        price: body.price,
        mrp: body.mrp,
        modes: body.modes,
        categoryId: body.categoryId,
        vendorId: body.vendorId,
        images: body.images,
        variants: body.variants.map((variant, index) => variantWithIdentity(variant, prefix, index, used)),
        tags: body.tags.filter(Boolean),
        status: body.status as ProductStatus,
        featured: body.featured,
        newArrival: body.newArrival,
        topSeller: body.topSeller,
        rating: body.rating,
        reviews: body.reviews,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      database.products.unshift(created);
      logAudit(database, req.user!, "product.created", "product", created.id, `${created.name} · ${created.status}`);
      if (created.status === "published") {
        notification(database, `${created.name} is live`, "A new piece is now visible on the storefront.", "system", `/products/${created.id}`);
      }
      return created;
    });
    res.status(201).json(product);
  }),
);

productsRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(productPatchSchema, req.body);
    const product = mutate((database) => {
      const existing = database.products.find((entry) => entry.id === req.params.id);
      if (!existing) throw new ApiError(404, "not_found", "Product not found.");
      assertRelations(database, body.categoryId, body.vendorId);
      if (body.name !== undefined) existing.name = body.name;
      if (body.slug !== undefined) existing.slug = uniqueSlug(body.slug || body.name || existing.name, database.products, existing.id);
      if (body.description !== undefined) existing.description = body.description;
      if (body.details !== undefined) existing.details = body.details.filter(Boolean);
      if (body.price !== undefined) existing.price = body.price;
      if (body.mrp !== undefined) existing.mrp = body.mrp;
      if (body.modes !== undefined) existing.modes = body.modes;
      if (body.categoryId !== undefined) existing.categoryId = body.categoryId;
      if (body.vendorId !== undefined) existing.vendorId = body.vendorId;
      if (body.images !== undefined) existing.images = body.images;
      if (body.tags !== undefined) existing.tags = body.tags.filter(Boolean);
      if (body.status !== undefined) existing.status = body.status as ProductStatus;
      if (body.featured !== undefined) existing.featured = body.featured;
      if (body.newArrival !== undefined) existing.newArrival = body.newArrival;
      if (body.topSeller !== undefined) existing.topSeller = body.topSeller;
      if (body.rating !== undefined) existing.rating = body.rating;
      if (body.reviews !== undefined) existing.reviews = body.reviews;
      if (body.variants !== undefined) {
        const used = new Set<string>(
          database.products
            .filter((entry) => entry.id !== existing.id)
            .flatMap((entry) => entry.variants.map((variant) => variant.sku)),
        );
        const prefix = String(database.products.indexOf(existing) + 1).padStart(3, "0");
        existing.variants = body.variants.map((variant, index) => variantWithIdentity(variant, prefix, index, used));
      }
      existing.updatedAt = new Date().toISOString();
      logAudit(database, req.user!, "product.updated", "product", existing.id, `${existing.name} · ${existing.status}`);
      return existing;
    });
    res.json(product);
  }),
);

productsRouter.delete(
  "/:id",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const result = mutate((database) => {
      const product = database.products.find((entry) => entry.id === req.params.id);
      if (!product) throw new ApiError(404, "not_found", "Product not found.");
      product.status = "archived";
      product.updatedAt = new Date().toISOString();
      logAudit(database, req.user!, "product.archived", "product", product.id, product.name);
      return { ok: true, product };
    });
    res.json(result);
  }),
);

productsRouter.post(
  "/:id/duplicate",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const copy = mutate((database) => {
      const source = database.products.find((entry) => entry.id === req.params.id);
      if (!source) throw new ApiError(404, "not_found", "Product not found.");
      const used = new Set<string>(database.products.flatMap((entry) => entry.variants.map((variant) => variant.sku)));
      const prefix = String(database.products.length + 1).padStart(3, "0");
      const duplicated: Product = {
        ...structuredClone(source),
        id: `prd_${Date.now().toString(36)}`,
        name: `${source.name} (Copy)`,
        slug: uniqueSlug(`${source.slug}-copy`, database.products),
        status: "draft",
        variants: source.variants.map((variant, index) => {
          const { sku: _sku, id: _id, ...rest } = variant;
          void _sku;
          void _id;
          return variantWithIdentity(
            {
              ...rest,
              stock: 0,
              rented: 0,
              id: undefined,
              sku: undefined,
            },
            prefix,
            index,
            used,
          );
        }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      database.products.unshift(duplicated);
      logAudit(database, req.user!, "product.duplicated", "product", duplicated.id, `Copy of ${source.name}`);
      return duplicated;
    });
    res.status(201).json(copy);
  }),
);

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Select at least one product."),
  action: z.enum(["publish", "unpublish", "archive"]),
});

productsRouter.post(
  "/bulk",
  requireRole("admin", "manager"),
  asyncHandler((req, res) => {
    const body = validate(bulkSchema, req.body);
    const result = mutate((database) => {
      const nextStatus: ProductStatus = body.action === "publish" ? "published" : body.action === "unpublish" ? "draft" : "archived";
      let updated = 0;
      for (const product of database.products) {
        if (body.ids.includes(product.id) && product.status !== nextStatus) {
          product.status = nextStatus;
          product.updatedAt = new Date().toISOString();
          updated += 1;
        }
      }
      logAudit(database, req.user!, `product.bulk_${body.action}`, "product", body.ids.join(", "), `${updated} products`);
      return { updated, status: nextStatus };
    });
    res.json(result);
  }),
);
