import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parse } from "../lib/validate.js";
import { badRequest, notFound } from "../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../lib/pagination.js";
import { productInclude, productDetailInclude, serializeProduct, serializeProductDetail } from "../lib/serialize.js";
import { availableForBuy, availableForRental } from "../services/inventory.js";
import { publicSettings, getSettings } from "../services/settings.js";

const listQuerySchema = pageSchema.extend({
  q: z.string().trim().max(120).optional(),
  category: z.string().max(120).optional(),
  vendor: z.string().max(120).optional(),
  mode: z.enum(["buy", "rent"]).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "rating", "popular", "title"]).default("newest"),
  featured: z.enum(["true", "false"]).optional(),
  newArrival: z.enum(["true", "false"]).optional(),
  topSeller: z.enum(["true", "false"]).optional(),
});

type ListQuery = z.infer<typeof listQuerySchema>;

function orderByFor(sort: ListQuery["sort"]) {
  switch (sort) {
    case "price_asc":
      return { priceMinor: "asc" as const };
    case "price_desc":
      return { priceMinor: "desc" as const };
    case "rating":
      return { ratingAvg: "desc" as const };
    case "popular":
      return [{ topSeller: "desc" as const }, { ratingAvg: "desc" as const }];
    case "title":
      return { title: "asc" as const };
    case "newest":
    default:
      return { createdAt: "desc" as const };
  }
}

async function listProducts(request: FastifyRequest, forSearch = false) {
  const query = parse(listQuerySchema, request.query);
  if (forSearch && !query.q) {
    throw badRequest("Search requires a q parameter");
  }

  const where: Record<string, unknown> = { status: "active" };
  if (query.q) {
    where.OR = [
      { title: { contains: query.q } },
      { description: { contains: query.q } },
      { tags: { some: { tag: { contains: query.q } } } },
    ];
  }
  if (query.category) {
    const category = await prisma.category.findUnique({
      where: { slug: query.category },
      include: { children: true },
    });
    if (!category) throw notFound("Category not found");
    where.categoryId = { in: [category.id, ...category.children.map((child) => child.id)] };
  }
  if (query.vendor) {
    const vendor = await prisma.vendor.findUnique({ where: { slug: query.vendor } });
    if (!vendor) throw notFound("Vendor not found");
    where.vendorId = vendor.id;
  }
  if (query.mode === "buy") where.buyEnabled = true;
  if (query.mode === "rent") where.rentEnabled = true;
  if (query.featured === "true") where.featured = true;
  if (query.newArrival === "true") where.newArrival = true;
  if (query.topSeller === "true") where.topSeller = true;

  const minMinor = query.minPrice != null ? Math.round(query.minPrice * 100) : undefined;
  const maxMinor = query.maxPrice != null ? Math.round(query.maxPrice * 100) : undefined;
  if (minMinor != null || maxMinor != null) {
    where.priceMinor = {
      ...(minMinor != null ? { gte: minMinor } : {}),
      ...(maxMinor != null ? { lte: maxMinor } : {}),
    };
  }

  const { skip, take, page, pageSize } = pageArgs(query);
  const [total, products] = await Promise.all([
    prisma.product.count({ where: where as never }),
    prisma.product.findMany({
      where: where as never,
      include: productInclude,
      orderBy: orderByFor(query.sort),
      skip,
      take,
    }),
  ]);

  return paginated(products.map(serializeProduct), total, page, pageSize);
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/categories",
    { schema: { tags: ["Catalogue"], summary: "List visible categories" } },
    async (request, reply) => {
      const query = parse(z.object({ tree: z.enum(["true", "false"]).default("false") }), request.query);
      const categories = await prisma.category.findMany({
        where: { isVisible: true },
        include: { children: { orderBy: { sortOrder: "asc" } }, _count: { select: { products: { where: { status: "active" } } } } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      const serialize = (category: (typeof categories)[number]) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        tagline: category.tagline,
        description: category.description,
        imageUrl: category.imageUrl,
        accent: category.accent,
        parentId: category.parentId,
        sortOrder: category.sortOrder,
        productCount: category._count.products,
      });
      if (query.tree === "true") {
        const roots = categories.filter((category) => !category.parentId);
        return reply.send({
          data: roots.map((root) => ({
            ...serialize(root),
            children: categories
              .filter((category) => category.parentId === root.id)
              .map(serialize),
          })),
        });
      }
      return reply.send({ data: categories.map(serialize) });
    },
  );

  app.get(
    "/categories/:slug",
    { schema: { tags: ["Catalogue"], summary: "Category detail with children and top products" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const category = await prisma.category.findUnique({
        where: { slug },
        include: {
          children: { orderBy: { sortOrder: "asc" } },
          _count: { select: { products: { where: { status: "active" } } } },
        },
      });
      if (!category || !category.isVisible) throw notFound("Category not found");

      const childIds = category.children.map((child) => child.id);
      const products = await prisma.product.findMany({
        where: { status: "active", categoryId: { in: [category.id, ...childIds] } },
        include: productInclude,
        orderBy: { featured: "desc" },
        take: 12,
      });

      return reply.send({
        data: {
          id: category.id,
          slug: category.slug,
          name: category.name,
          tagline: category.tagline,
          description: category.description,
          imageUrl: category.imageUrl,
          accent: category.accent,
          productCount: category._count.products,
          children: category.children.map((child) => ({
            id: child.id,
            slug: child.slug,
            name: child.name,
            tagline: child.tagline,
            imageUrl: child.imageUrl,
            sortOrder: child.sortOrder,
          })),
          products: products.map(serializeProduct),
        },
      });
    },
  );

  app.get(
    "/products",
    { schema: { tags: ["Catalogue"], summary: "Search/filter/paginate active products" } },
    async (request, reply) => {
      const result = await listProducts(request);
      return reply.send(result);
    },
  );

  app.get(
    "/search",
    { schema: { tags: ["Catalogue"], summary: "Product search (requires q)" } },
    async (request, reply) => {
      const result = await listProducts(request, true);
      return reply.send(result);
    },
  );

  app.get(
    "/products/:slug",
    { schema: { tags: ["Catalogue"], summary: "Product detail by slug" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const product = await prisma.product.findUnique({ where: { slug }, include: productDetailInclude });
      if (!product || product.status !== "active") throw notFound("Product not found");
      return reply.send({ data: serializeProductDetail(product) });
    },
  );

  app.get(
    "/products/:slug/availability",
    { schema: { tags: ["Catalogue"], summary: "Variant stock / rental availability" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const query = parse(
        z.object({ start: z.coerce.date().optional(), end: z.coerce.date().optional() }),
        request.query,
      );
      const product = await prisma.product.findUnique({ where: { slug }, include: { variants: true } });
      if (!product || product.status !== "active") throw notFound("Product not found");

      const rentalWindow = query.start && query.end;
      if (rentalWindow && query.end! <= query.start!) throw notFound("Invalid window");

      const variants = await Promise.all(
        product.variants.map(async (variant) => ({
          variantId: variant.id,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          stockQuantity: variant.stockQuantity,
          availableForBuy: await availableForBuy(variant.id),
          availableForRental: rentalWindow
            ? await availableForRental(variant.id, query.start!, query.end!)
            : null,
        })),
      );

      return reply.send({
        data: { productId: product.id, slug: product.slug, window: rentalWindow ? { start: query.start, end: query.end } : null, variants },
      });
    },
  );

  app.get(
    "/vendors",
    { schema: { tags: ["Catalogue"], summary: "List active vendors" } },
    async (_request, reply) => {
      const vendors = await prisma.vendor.findMany({
        where: { isActive: true },
        include: { _count: { select: { products: { where: { status: "active" } } } } },
        orderBy: { name: "asc" },
      });
      return reply.send({
        data: vendors.map((vendor) => ({
          id: vendor.id,
          slug: vendor.slug,
          name: vendor.name,
          description: vendor.description,
          location: vendor.location,
          logoUrl: vendor.logoUrl,
          rating: vendor.rating,
          salesCount: vendor.salesCount,
          productCount: vendor._count.products,
        })),
      });
    },
  );

  app.get(
    "/vendors/:slug",
    { schema: { tags: ["Catalogue"], summary: "Vendor detail and products" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const vendor = await prisma.vendor.findUnique({
        where: { slug },
        include: {
          products: { where: { status: "active" }, include: productInclude, orderBy: { createdAt: "desc" }, take: 24 },
        },
      });
      if (!vendor || !vendor.isActive) throw notFound("Vendor not found");
      return reply.send({
        data: {
          id: vendor.id,
          slug: vendor.slug,
          name: vendor.name,
          description: vendor.description,
          location: vendor.location,
          logoUrl: vendor.logoUrl,
          rating: vendor.rating,
          salesCount: vendor.salesCount,
          products: vendor.products.map(serializeProduct),
        },
      });
    },
  );

  app.get(
    "/banners",
    { schema: { tags: ["Content"], summary: "Active banners by placement" } },
    async (request, reply) => {
      const query = parse(z.object({ placement: z.string().max(60).optional() }), request.query);
      const now = new Date();
      const banners = await prisma.banner.findMany({
        where: {
          isActive: true,
          ...(query.placement ? { placement: query.placement } : {}),
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
        orderBy: { sortOrder: "asc" },
      });
      return reply.send({ data: banners });
    },
  );

  app.get(
    "/posts",
    { schema: { tags: ["Content"], summary: "Published editorial posts" } },
    async (request, reply) => {
      const query = parse(pageSchema, request.query);
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, posts] = await Promise.all([
        prisma.contentPost.count({ where: { status: "published" } }),
        prisma.contentPost.findMany({
          where: { status: "published" },
          orderBy: { publishedAt: "desc" },
          skip,
          take,
          select: {
            id: true, slug: true, title: true, excerpt: true, coverImage: true, tag: true, publishedAt: true,
          },
        }),
      ]);
      return reply.send(paginated(posts, total, page, pageSize));
    },
  );

  app.get(
    "/posts/:slug",
    { schema: { tags: ["Content"], summary: "Published post by slug" } },
    async (request, reply) => {
      const { slug } = parse(z.object({ slug: z.string().min(1) }), request.params);
      const post = await prisma.contentPost.findUnique({ where: { slug } });
      if (!post || post.status !== "published") throw notFound("Post not found");
      return reply.send({ data: post });
    },
  );

  app.get(
    "/settings/store",
    { schema: { tags: ["Settings"], summary: "Public store profile and payment toggles" } },
    async (_request, reply) => {
      const settings = await getSettings();
      return reply.send({ data: publicSettings(settings) });
    },
  );
}
