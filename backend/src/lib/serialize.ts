import type { Prisma } from "@prisma/client";

export const productInclude = {
  images: { orderBy: { sortOrder: "asc" } },
  tags: true,
  attributes: { orderBy: { sortOrder: "asc" } },
  variants: { orderBy: { createdAt: "asc" } },
  category: true,
  vendor: true,
  seller: { select: { id: true, slug: true, storeName: true, status: true, kycStatus: true, rating: true } },
} satisfies Prisma.ProductInclude;

export const productDetailInclude = {
  ...productInclude,
  reviews: {
    where: { status: "approved" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      authorName: true,
      rating: true,
      title: true,
      body: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
export type ProductDetail = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

function price(minor: number, currency: string) {
  return { amountMinor: minor, amount: minor / 100, currency };
}

export function serializeVariant(variant: ProductWithRelations["variants"][number]) {
  return {
    id: variant.id,
    sku: variant.sku,
    title: variant.title,
    size: variant.size,
    color: variant.color,
    price: price(variant.priceMinor ?? 0, "USD"),
    priceMinor: variant.priceMinor,
    stockQuantity: variant.stockQuantity,
    reservedQuantity: variant.reservedQuantity,
    availableQuantity: Math.max(0, variant.stockQuantity - variant.reservedQuantity),
    lowStockThreshold: variant.lowStockThreshold,
    isLowStock: variant.stockQuantity <= variant.lowStockThreshold,
    isActive: variant.isActive,
  };
}

export function serializeProduct(product: ProductWithRelations) {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    details: product.details ? product.details.split("\n").filter(Boolean) : [],
    status: product.status,
    category: { id: product.category.id, slug: product.category.slug, name: product.category.name },
    vendor: { id: product.vendor.id, slug: product.vendor.slug, name: product.vendor.name, rating: product.vendor.rating },
    seller: product.seller
      ? { id: product.seller.id, slug: product.seller.slug, name: product.seller.storeName, status: product.seller.status }
      : null,
    sellerId: product.sellerId,
    price: price(product.priceMinor, product.currency),
    priceMinor: product.priceMinor,
    mrp: product.mrpMinor == null ? null : price(product.mrpMinor, product.currency),
    currency: product.currency,
    buyEnabled: product.buyEnabled,
    rentEnabled: product.rentEnabled,
    rent: product.rentEnabled
      ? {
          daily: product.rentDailyMinor == null ? null : price(product.rentDailyMinor, product.currency),
          weekly: product.rentWeeklyMinor == null ? null : price(product.rentWeeklyMinor, product.currency),
          deposit: price(product.rentDepositMinor, product.currency),
        }
      : null,
    modes: [
      ...(product.buyEnabled ? ["buy"] : []),
      ...(product.rentEnabled ? ["rent"] : []),
    ],
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder,
    })),
    primaryImage: product.images.find((image) => image.isPrimary)?.url ?? product.images[0]?.url ?? null,
    tags: product.tags.map((tag) => tag.tag),
    attributes: product.attributes.map((attribute) => ({ name: attribute.name, value: attribute.value })),
    variants: product.variants.map(serializeVariant),
    rating: { average: product.ratingAvg, count: product.ratingCount },
    featured: product.featured,
    newArrival: product.newArrival,
    topSeller: product.topSeller,
    stockTotal: product.variants.reduce((sum, variant) => sum + variant.stockQuantity, 0),
    availableTotal: product.variants.reduce(
      (sum, variant) => sum + Math.max(0, variant.stockQuantity - variant.reservedQuantity),
      0,
    ),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function serializeProductDetail(product: ProductDetail) {
  return {
    ...serializeProduct(product),
    reviews: product.reviews.map((review) => ({
      id: review.id,
      authorName: review.authorName,
      rating: review.rating,
      title: review.title,
      body: review.body,
      createdAt: review.createdAt,
    })),
  };
}

export function serializeUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: string;
  phone: string | null;
  title: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    role: user.role,
    phone: user.phone,
    title: user.title,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}
