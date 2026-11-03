import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { parse } from "../../lib/validate.js";
import { requireActor, requireRole, requireStaff, type Actor } from "../../lib/guards.js";
import { conflict, notFound } from "../../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../../lib/pagination.js";
import { productInclude, serializeProduct } from "../../lib/serialize.js";
import { slugify } from "../../lib/slug.js";
import { recordAudit } from "../../lib/audit.js";
import { PRODUCT_STATUSES } from "../../lib/constants.js";
import { assertSellerCanPublish, resolveSellerForVendor } from "../../services/sellers.js";

export async function staffActor(request: FastifyRequest, roles: Actor["role"][] = ["admin", "manager", "fulfilment"]): Promise<Actor> {
  const actor = await requireActor(request);
  requireStaff(actor);
  requireRole(actor, roles);
  return actor;
}

const imageSchema = z.object({
  url: z.string().min(1).max(500),
  alt: z.string().max(200).optional(),
  isPrimary: z.boolean().optional(),
});

const attributeSchema = z.object({ name: z.string().min(1).max(80), value: z.string().min(1).max(200) });

const variantInputSchema = z.object({
  sku: z.string().min(2).max(80),
  title: z.string().max(120).optional(),
  size: z.string().max(40).optional(),
  color: z.string().max(40).optional(),
  priceMinor: z.number().int().min(0).optional(),
  stockQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  rentDailyMinor: z.number().int().min(0).optional(),
  rentDepositMinor: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

const productInputSchema = z.object({
  slug: z.string().min(2).max(120).optional(),
  title: z.string().min(2).max(200),
  description: z.string().max(4000).default(""),
  details: z.array(z.string().max(300)).max(20).optional(),
  categoryId: z.string().min(1),
  vendorId: z.string().min(1),
  sellerId: z.string().min(1).optional(),
  priceMinor: z.number().int().min(0),
  mrpMinor: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).default("USD"),
  status: z.enum(PRODUCT_STATUSES).default("draft"),
  buyEnabled: z.boolean().default(true),
  rentEnabled: z.boolean().default(false),
  rentDailyMinor: z.number().int().min(0).nullable().optional(),
  rentWeeklyMinor: z.number().int().min(0).nullable().optional(),
  rentDepositMinor: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  newArrival: z.boolean().default(false),
  topSeller: z.boolean().default(false),
  images: z.array(imageSchema).max(10).default([]),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  attributes: z.array(attributeSchema).max(20).default([]),
  variants: z.array(variantInputSchema).min(1).max(30),
});

const productPatchSchema = productInputSchema.partial().omit({ variants: true }).extend({
  images: z.array(imageSchema).max(10).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  attributes: z.array(attributeSchema).max(20).optional(),
});

const categoryInput = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120).optional(),
  tagline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().max(500).optional(),
  accent: z.string().max(20).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isVisible: z.boolean().default(true),
});

const vendorInput = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  location: z.string().max(120).optional(),
  logoUrl: z.string().max(500).optional(),
  rating: z.number().min(0).max(5).default(0),
  isActive: z.boolean().default(true),
});

export async function adminCatalogRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------- catalogue
  app.get(
    "/products",
    { schema: { tags: ["Admin · Catalogue"], summary: "List all products (any status)" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(
        pageSchema.extend({
          q: z.string().max(120).optional(),
          status: z.enum(PRODUCT_STATUSES).optional(),
          categoryId: z.string().optional(),
          vendorId: z.string().optional(),
          sellerId: z.string().optional(),
          lowStock: z.enum(["true", "false"]).optional(),
        }),
        request.query,
      );
      const { skip, take, page, pageSize } = pageArgs(query);
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.categoryId) where.categoryId = query.categoryId;
      if (query.vendorId) where.vendorId = query.vendorId;
      if (query.sellerId) where.sellerId = query.sellerId;
      if (query.q) {
        where.OR = [{ title: { contains: query.q } }, { slug: { contains: query.q } }];
      }
      if (query.lowStock === "true") {
        where.variants = { some: { isActive: true } };
      }
      const [total, products] = await Promise.all([
        prisma.product.count({ where: where as never }),
        prisma.product.findMany({
          where: where as never,
          include: productInclude,
          orderBy: { updatedAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(products.map(serializeProduct), total, page, pageSize));
    },
  );

  app.post(
    "/products",
    { schema: { tags: ["Admin · Catalogue"], summary: "Create a product with variants" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const input = parse(productInputSchema, request.body);
      const slug = input.slug ? slugify(input.slug) : slugify(input.title);
      const [category, vendor] = await Promise.all([
        prisma.category.findUnique({ where: { id: input.categoryId } }),
        prisma.vendor.findUnique({ where: { id: input.vendorId } }),
      ]);
      if (!category) throw notFound("Category not found");
      if (!vendor) throw notFound("Vendor not found");
      const sellerId = await resolveSellerForVendor(input.vendorId, input.sellerId);
      await assertSellerCanPublish(sellerId);

      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            slug,
            title: input.title,
            description: input.description,
            details: input.details?.join("\n") ?? null,
            categoryId: input.categoryId,
            vendorId: input.vendorId,
            sellerId,
            priceMinor: input.priceMinor,
            mrpMinor: input.mrpMinor ?? null,
            currency: input.currency,
            status: input.status,
            buyEnabled: input.buyEnabled,
            rentEnabled: input.rentEnabled,
            rentDailyMinor: input.rentDailyMinor ?? null,
            rentWeeklyMinor: input.rentWeeklyMinor ?? null,
            rentDepositMinor: input.rentDepositMinor,
            featured: input.featured,
            newArrival: input.newArrival,
            topSeller: input.topSeller,
            publishedAt: input.status === "active" ? new Date() : null,
            images: {
              create: input.images.map((image, index) => ({
                url: image.url,
                alt: image.alt ?? input.title,
                isPrimary: image.isPrimary ?? index === 0,
                sortOrder: index,
              })),
            },
            tags: { create: input.tags.map((tag) => ({ tag })) },
            attributes: {
              create: input.attributes.map((attribute, index) => ({ ...attribute, sortOrder: index })),
            },
            variants: {
              create: input.variants.map((variant) => ({
                sku: variant.sku,
                title: variant.title ?? null,
                size: variant.size ?? null,
                color: variant.color ?? null,
                priceMinor: variant.priceMinor ?? null,
                stockQuantity: variant.stockQuantity,
                lowStockThreshold: variant.lowStockThreshold,
                rentDailyMinor: variant.rentDailyMinor ?? null,
                rentDepositMinor: variant.rentDepositMinor ?? null,
                isActive: variant.isActive,
              })),
            },
          },
          include: productInclude,
        });
        for (const variant of created.variants) {
          if (variant.stockQuantity > 0) {
            await tx.stockAdjustment.create({
              data: {
                variantId: variant.id,
                delta: variant.stockQuantity,
                reason: "initial_stock",
                note: "Initial stock on product creation",
                beforeQuantity: 0,
                afterQuantity: variant.stockQuantity,
                actorId: actor.id,
              },
            });
          }
        }
        return created;
      });

      await recordAudit({
        actor,
        action: "product.create",
        entityType: "product",
        entityId: product.id,
        after: { slug: product.slug, title: product.title, status: product.status },
        request,
      });
      return reply.status(201).send({ data: serializeProduct(product) });
    },
  );

  app.get(
    "/products/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Product detail (any status)" } },
    async (request, reply) => {
      await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const product = await prisma.product.findUnique({ where: { id }, include: productInclude });
      if (!product) throw notFound("Product not found");
      return reply.send({ data: serializeProduct(product) });
    },
  );

  app.patch(
    "/products/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Update product fields/images/tags" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(productPatchSchema, request.body);
      const before = await prisma.product.findUnique({ where: { id }, include: productInclude });
      if (!before) throw notFound("Product not found");
      if (input.categoryId) {
        const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
        if (!category) throw notFound("Category not found");
      }
      if (input.vendorId) {
        const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
        if (!vendor) throw notFound("Vendor not found");
      }
      let nextSellerId: string | null | undefined;
      if (input.sellerId !== undefined || input.vendorId !== undefined) {
        nextSellerId = input.sellerId
          ? await resolveSellerForVendor(input.vendorId ?? before.vendorId, input.sellerId)
          : await resolveSellerForVendor(input.vendorId ?? before.vendorId);
      }
      if (input.status === "active" || input.sellerId !== undefined) {
        await assertSellerCanPublish(nextSellerId ?? before.sellerId);
      }

      const product = await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            ...(input.slug !== undefined ? { slug: slugify(input.slug) } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.details !== undefined ? { details: input.details.join("\n") } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
            ...(nextSellerId !== undefined ? { sellerId: nextSellerId } : {}),
            ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
            ...(input.mrpMinor !== undefined ? { mrpMinor: input.mrpMinor } : {}),
            ...(input.currency !== undefined ? { currency: input.currency } : {}),
            ...(input.status !== undefined
              ? { status: input.status, publishedAt: input.status === "active" ? before.publishedAt ?? new Date() : before.publishedAt }
              : {}),
            ...(input.buyEnabled !== undefined ? { buyEnabled: input.buyEnabled } : {}),
            ...(input.rentEnabled !== undefined ? { rentEnabled: input.rentEnabled } : {}),
            ...(input.rentDailyMinor !== undefined ? { rentDailyMinor: input.rentDailyMinor } : {}),
            ...(input.rentWeeklyMinor !== undefined ? { rentWeeklyMinor: input.rentWeeklyMinor } : {}),
            ...(input.rentDepositMinor !== undefined ? { rentDepositMinor: input.rentDepositMinor } : {}),
            ...(input.featured !== undefined ? { featured: input.featured } : {}),
            ...(input.newArrival !== undefined ? { newArrival: input.newArrival } : {}),
            ...(input.topSeller !== undefined ? { topSeller: input.topSeller } : {}),
          },
        });

        if (input.images) {
          await tx.productImage.deleteMany({ where: { productId: id } });
          if (input.images.length > 0) {
            await tx.productImage.createMany({
              data: input.images.map((image, index) => ({
                productId: id,
                url: image.url,
                alt: image.alt ?? null,
                isPrimary: image.isPrimary ?? index === 0,
                sortOrder: index,
              })),
            });
          }
        }
        if (input.tags) {
          await tx.productTag.deleteMany({ where: { productId: id } });
          if (input.tags.length > 0) {
            await tx.productTag.createMany({ data: input.tags.map((tag) => ({ productId: id, tag })) });
          }
        }
        if (input.attributes) {
          await tx.productAttribute.deleteMany({ where: { productId: id } });
          if (input.attributes.length > 0) {
            await tx.productAttribute.createMany({
              data: input.attributes.map((attribute, index) => ({ productId: id, ...attribute, sortOrder: index })),
            });
          }
        }
        return tx.product.findUniqueOrThrow({ where: { id }, include: productInclude });
      });

      await recordAudit({
        actor,
        action: "product.update",
        entityType: "product",
        entityId: id,
        before: serializeProduct(before),
        after: serializeProduct(product),
        request,
      });
      return reply.send({ data: serializeProduct(product) });
    },
  );

  app.delete(
    "/products/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Archive a product (soft delete)" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const before = await prisma.product.findUnique({ where: { id } });
      if (!before) throw notFound("Product not found");
      const product = await prisma.product.update({ where: { id }, data: { status: "archived" } });
      await recordAudit({
        actor,
        action: "product.archive",
        entityType: "product",
        entityId: id,
        before: { status: before.status },
        after: { status: product.status },
        request,
      });
      return reply.send({ data: { id: product.id, status: product.status } });
    },
  );

  app.post(
    "/products/:id/variants",
    { schema: { tags: ["Admin · Catalogue"], summary: "Add a variant/SKU" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(variantInputSchema, request.body);
      const product = await prisma.product.findUnique({ where: { id } });
      if (!product) throw notFound("Product not found");

      const variant = await prisma.$transaction(async (tx) => {
        const created = await tx.productVariant.create({
          data: {
            productId: id,
            sku: input.sku,
            title: input.title ?? null,
            size: input.size ?? null,
            color: input.color ?? null,
            priceMinor: input.priceMinor ?? null,
            stockQuantity: input.stockQuantity,
            lowStockThreshold: input.lowStockThreshold,
            rentDailyMinor: input.rentDailyMinor ?? null,
            rentDepositMinor: input.rentDepositMinor ?? null,
            isActive: input.isActive,
          },
        });
        if (input.stockQuantity > 0) {
          await tx.stockAdjustment.create({
            data: {
              variantId: created.id,
              delta: input.stockQuantity,
              reason: "initial_stock",
              note: "Initial stock on variant creation",
              beforeQuantity: 0,
              afterQuantity: input.stockQuantity,
              actorId: actor.id,
            },
          });
        }
        return created;
      });

      await recordAudit({
        actor,
        action: "variant.create",
        entityType: "productVariant",
        entityId: variant.id,
        after: { sku: variant.sku, stockQuantity: variant.stockQuantity },
        request,
      });
      return reply.status(201).send({ data: variant });
    },
  );

  app.patch(
    "/variants/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Update variant metadata (stock via adjustments)" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(
        variantInputSchema.partial().omit({ stockQuantity: true, sku: true }).extend({ sku: z.string().min(2).max(80).optional() }),
        request.body,
      );
      const before = await prisma.productVariant.findUnique({ where: { id } });
      if (!before) throw notFound("Variant not found");
      const variant = await prisma.productVariant.update({
        where: { id },
        data: {
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
          ...(input.lowStockThreshold !== undefined ? { lowStockThreshold: input.lowStockThreshold } : {}),
          ...(input.rentDailyMinor !== undefined ? { rentDailyMinor: input.rentDailyMinor } : {}),
          ...(input.rentDepositMinor !== undefined ? { rentDepositMinor: input.rentDepositMinor } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await recordAudit({
        actor,
        action: "variant.update",
        entityType: "productVariant",
        entityId: id,
        before,
        after: variant,
        request,
      });
      return reply.send({ data: variant });
    },
  );

  app.delete(
    "/variants/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Deactivate a variant" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const variant = await prisma.productVariant.findUnique({ where: { id } });
      if (!variant) throw notFound("Variant not found");
      await prisma.productVariant.update({ where: { id }, data: { isActive: false } });
      await recordAudit({
        actor,
        action: "variant.deactivate",
        entityType: "productVariant",
        entityId: id,
        before: { isActive: variant.isActive },
        after: { isActive: false },
        request,
      });
      return reply.status(204).send();
    },
  );

  // --------------------------------------------------------------- categories
  app.get(
    "/categories",
    { schema: { tags: ["Admin · Catalogue"], summary: "List categories including hidden" } },
    async (request, reply) => {
      await staffActor(request);
      const categories = await prisma.category.findMany({
        include: { _count: { select: { products: true, children: true } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return reply.send({
        data: categories.map((category) => ({
          ...category,
          productCount: category._count.products,
          childCount: category._count.children,
        })),
      });
    },
  );

  app.post(
    "/categories",
    { schema: { tags: ["Admin · Catalogue"], summary: "Create a category" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const input = parse(categoryInput, request.body);
      if (input.parentId) {
        const parent = await prisma.category.findUnique({ where: { id: input.parentId } });
        if (!parent) throw notFound("Parent category not found");
      }
      const category = await prisma.category.create({
        data: { ...input, slug: slugify(input.slug ?? input.name) },
      });
      await recordAudit({
        actor,
        action: "category.create",
        entityType: "category",
        entityId: category.id,
        after: category,
        request,
      });
      return reply.status(201).send({ data: category });
    },
  );

  app.patch(
    "/categories/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Update a category" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(categoryInput.partial(), request.body);
      const before = await prisma.category.findUnique({ where: { id } });
      if (!before) throw notFound("Category not found");
      if (input.parentId === id) throw conflict("A category cannot be its own parent");
      const category = await prisma.category.update({
        where: { id },
        data: {
          ...input,
          ...(input.slug ? { slug: slugify(input.slug) } : {}),
        },
      });
      await recordAudit({
        actor,
        action: "category.update",
        entityType: "category",
        entityId: id,
        before,
        after: category,
        request,
      });
      return reply.send({ data: category });
    },
  );

  app.delete(
    "/categories/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Delete an empty category" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const category = await prisma.category.findUnique({
        where: { id },
        include: { _count: { select: { products: true, children: true } } },
      });
      if (!category) throw notFound("Category not found");
      if (category._count.products > 0 || category._count.children > 0) {
        throw conflict("Category has products or child categories; hide it instead");
      }
      await prisma.category.delete({ where: { id } });
      await recordAudit({
        actor,
        action: "category.delete",
        entityType: "category",
        entityId: id,
        before: { slug: category.slug, name: category.name },
        request,
      });
      return reply.status(204).send();
    },
  );

  // ------------------------------------------------------------------ vendors
  app.get(
    "/vendors",
    { schema: { tags: ["Admin · Catalogue"], summary: "List vendors" } },
    async (request, reply) => {
      await staffActor(request);
      const vendors = await prisma.vendor.findMany({
        include: { _count: { select: { products: true } } },
        orderBy: { name: "asc" },
      });
      return reply.send({ data: vendors.map((vendor) => ({ ...vendor, productCount: vendor._count.products })) });
    },
  );

  app.post(
    "/vendors",
    { schema: { tags: ["Admin · Catalogue"], summary: "Create a vendor" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const input = parse(vendorInput, request.body);
      const vendor = await prisma.vendor.create({
        data: { ...input, slug: slugify(input.slug ?? input.name) },
      });
      await recordAudit({
        actor,
        action: "vendor.create",
        entityType: "vendor",
        entityId: vendor.id,
        after: vendor,
        request,
      });
      return reply.status(201).send({ data: vendor });
    },
  );

  app.patch(
    "/vendors/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Update a vendor" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(vendorInput.partial(), request.body);
      const before = await prisma.vendor.findUnique({ where: { id } });
      if (!before) throw notFound("Vendor not found");
      const vendor = await prisma.vendor.update({
        where: { id },
        data: { ...input, ...(input.slug ? { slug: slugify(input.slug) } : {}) },
      });
      await recordAudit({
        actor,
        action: "vendor.update",
        entityType: "vendor",
        entityId: id,
        before,
        after: vendor,
        request,
      });
      return reply.send({ data: vendor });
    },
  );

  app.delete(
    "/vendors/:id",
    { schema: { tags: ["Admin · Catalogue"], summary: "Delete a vendor with no products" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const vendor = await prisma.vendor.findUnique({
        where: { id },
        include: { _count: { select: { products: true } } },
      });
      if (!vendor) throw notFound("Vendor not found");
      if (vendor._count.products > 0) throw conflict("Vendor has products; deactivate it instead");
      await prisma.vendor.delete({ where: { id } });
      await recordAudit({
        actor,
        action: "vendor.delete",
        entityType: "vendor",
        entityId: id,
        before: { name: vendor.name, slug: vendor.slug },
        request,
      });
      return reply.status(204).send();
    },
  );
}
