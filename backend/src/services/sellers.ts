import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { conflict, notFound } from "../lib/errors.js";
import { commissionMinor } from "../lib/money.js";
import { DEFAULT_COMMISSION_BPS } from "../lib/constants.js";
import { getSettings } from "./settings.js";

const sellerInclude = {
  owner: { select: { id: true, email: true, firstName: true, lastName: true } },
  vendor: { select: { id: true, name: true, slug: true } },
  kycDocuments: { orderBy: { submittedAt: "desc" } },
  _count: { select: { products: true, rentalListings: true, payouts: true } },
} satisfies Prisma.SellerInclude;

export type SellerWithRelations = Prisma.SellerGetPayload<{ include: typeof sellerInclude }>;

export function sellerWithRelations() {
  return sellerInclude;
}

export function serializeSeller(seller: SellerWithRelations, defaultCommissionBps: number) {
  return {
    id: seller.id,
    storeName: seller.storeName,
    slug: seller.slug,
    logoUrl: seller.logoUrl,
    description: seller.description,
    contact: {
      email: seller.contactEmail,
      phone: seller.contactPhone,
      address: {
        line1: seller.addressLine1,
        line2: seller.addressLine2,
        city: seller.city,
        state: seller.state,
        postalCode: seller.postalCode,
        country: seller.country,
      },
    },
    owner: {
      id: seller.owner.id,
      email: seller.owner.email,
      name: [seller.owner.firstName, seller.owner.lastName].filter(Boolean).join(" "),
    },
    vendor: seller.vendor,
    kyc: {
      status: seller.kycStatus,
      documents: seller.kycDocuments.map((document) => ({
        id: document.id,
        type: document.type,
        documentNumber: document.documentNumber,
        fileUrl: document.fileUrl,
        status: document.status,
        reviewNote: document.reviewNote,
        submittedAt: document.submittedAt,
        reviewedAt: document.reviewedAt,
      })),
    },
    commission: {
      rateBps: seller.commissionRateBps ?? defaultCommissionBps,
      isOverride: seller.commissionRateBps != null,
      platformDefaultBps: defaultCommissionBps,
    },
    payout: {
      method: seller.payoutMethod,
      detailsMasked: seller.payoutDetailsMasked,
      verificationStatus: seller.payoutVerificationStatus,
    },
    rating: seller.rating,
    status: seller.status,
    joinedAt: seller.joinedAt,
    counts: {
      products: seller._count.products,
      rentalListings: seller._count.rentalListings,
      payouts: seller._count.payouts,
    },
    createdAt: seller.createdAt,
    updatedAt: seller.updatedAt,
  };
}

export async function findSeller(idOrSlug: string): Promise<SellerWithRelations | null> {
  return prisma.seller.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: sellerInclude,
  });
}

export async function getSeller(idOrSlug: string): Promise<SellerWithRelations> {
  const seller = await findSeller(idOrSlug);
  if (!seller) throw notFound("Seller not found");
  return seller;
}

export async function resolveCommissionBps(seller: { commissionRateBps: number | null } | null | undefined): Promise<number> {
  if (seller?.commissionRateBps != null) return seller.commissionRateBps;
  const settings = await getSettings();
  return settings.marketplace.defaultCommissionBps;
}

/** New catalogue/rental inventory is blocked while a seller is suspended or rejected. */
export async function assertSellerCanPublish(sellerId: string | null | undefined): Promise<void> {
  if (!sellerId) return;
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw notFound("Seller not found");
  if (seller.status === "suspended" || seller.status === "rejected" || seller.kycStatus === "suspended") {
    throw conflict("Seller is suspended and cannot publish new listings", {
      sellerId,
      status: seller.status,
      kycStatus: seller.kycStatus,
    });
  }
}

/** Existing catalogue products inherit the seller mapped to their vendor. */
export async function resolveSellerForVendor(vendorId: string, explicitSellerId?: string | null): Promise<string | null> {
  if (explicitSellerId) {
    const seller = await prisma.seller.findUnique({ where: { id: explicitSellerId } });
    if (!seller) throw notFound("Seller not found");
    return seller.id;
  }
  const seller = await prisma.seller.findFirst({ where: { vendorId } });
  return seller?.id ?? null;
}

// ---------------------------------------------------------------------------
// Commission ledger
// ---------------------------------------------------------------------------

/**
 * Write one commission ledger row per order line for accounts with a seller.
 * Deposit portions are excluded from the commissionable base. Idempotent on
 * (orderItemId, kind).
 */
export async function recordSellerLedgerForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Order not found");
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { product: { select: { sellerId: true } } },
  });
  const sellerIds = [...new Set(items.map((item) => item.product?.sellerId).filter(Boolean))] as string[];
  if (sellerIds.length === 0) return;

  const sellers = await tx.seller.findMany({ where: { id: { in: sellerIds } } });
  const marketplaceRow = await tx.appSetting.findUnique({ where: { key: "marketplace" } });
  let defaultBps = DEFAULT_COMMISSION_BPS;
  if (marketplaceRow) {
    try {
      const parsed = JSON.parse(marketplaceRow.value) as { defaultCommissionBps?: number };
      if (typeof parsed.defaultCommissionBps === "number") defaultBps = parsed.defaultCommissionBps;
    } catch {
      // keep the constant default
    }
  }
  const bpsBySeller = new Map(
    sellers.map((seller) => [
      seller.id,
      seller.commissionRateBps ?? defaultBps,
    ]),
  );

  for (const item of items) {
    const sellerId = item.product?.sellerId;
    if (!sellerId) continue;
    const grossMinor = Math.max(0, item.lineTotalMinor - item.depositMinor);
    if (grossMinor <= 0) continue;
    const bps = bpsBySeller.get(sellerId) ?? defaultBps;
    const commission = commissionMinor(grossMinor, bps);
    await tx.sellerLedgerEntry.upsert({
      where: { orderItemId_kind: { orderItemId: item.id, kind: "sale" } },
      update: {},
      create: {
        sellerId,
        orderId,
        orderItemId: item.id,
        kind: "sale",
        grossMinor,
        commissionMinor: commission,
        netMinor: grossMinor - commission,
        currency: order.currency,
        status: "pending",
        occurredAt: order.paidAt ?? order.placedAt,
        note: `Commission ${bps} bps on ${item.sku}`,
      },
    });
  }
}

/** Reverse commission ledger rows when an order is fully refunded. */
export async function recordSellerRefundForOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  note: string,
): Promise<void> {
  const saleEntries = await tx.sellerLedgerEntry.findMany({
    where: { orderId, kind: "sale" },
  });
  for (const sale of saleEntries) {
    if (!sale.orderItemId) continue;
    await tx.sellerLedgerEntry.upsert({
      where: { orderItemId_kind: { orderItemId: sale.orderItemId, kind: "refund" } },
      update: {},
      create: {
        sellerId: sale.sellerId,
        orderId,
        orderItemId: sale.orderItemId,
        kind: "refund",
        grossMinor: 0,
        commissionMinor: -sale.commissionMinor,
        refundMinor: sale.grossMinor,
        netMinor: -sale.netMinor,
        currency: sale.currency,
        status: "pending",
        occurredAt: new Date(),
        note,
      },
    });
  }
}

export interface PayoutPreview {
  sellerId: string;
  periodStart: Date;
  periodEnd: Date;
  grossMinor: number;
  commissionMinor: number;
  refundsMinor: number;
  netMinor: number;
  entryCount: number;
  currency: string;
}

/** Preview the next payout: all ledger rows not yet attached to a payout. */
export async function previewPayout(sellerId: string, periodStart?: Date, periodEnd?: Date): Promise<PayoutPreview> {
  const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
  if (!seller) throw notFound("Seller not found");
  const now = new Date();
  const start = periodStart ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const end = periodEnd ?? now;
  const entries = await prisma.sellerLedgerEntry.findMany({
    where: { sellerId, payoutId: null, status: "pending" },
  });
  const grossMinor = entries.reduce((sum, entry) => sum + entry.grossMinor, 0);
  const commissionMinorTotal = entries.reduce((sum, entry) => sum + entry.commissionMinor, 0);
  const refundsMinor = entries.reduce((sum, entry) => sum + entry.refundMinor, 0);
  return {
    sellerId,
    periodStart: start,
    periodEnd: end,
    grossMinor,
    commissionMinor: commissionMinorTotal,
    refundsMinor,
    netMinor: entries.reduce((sum, entry) => sum + entry.netMinor, 0),
    entryCount: entries.length,
    currency: entries[0]?.currency ?? "USD",
  };
}

/** Create a payout record from unattached ledger entries for a period. */
export async function createPayout(input: {
  sellerId: string;
  periodStart: Date;
  periodEnd: Date;
  actorId?: string | null;
  note?: string;
}): Promise<{ payout: PayoutPreview & { id: string; status: string }; created: boolean }> {
  const seller = await prisma.seller.findUnique({ where: { id: input.sellerId } });
  if (!seller) throw notFound("Seller not found");
  const entries = await prisma.sellerLedgerEntry.findMany({
    where: {
      sellerId: input.sellerId,
      payoutId: null,
      status: "pending",
      occurredAt: { gte: input.periodStart, lte: input.periodEnd },
    },
  });
  if (entries.length === 0) {
    throw conflict("No unpaid commission entries in this period", {
      sellerId: input.sellerId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
  }

  const grossMinor = entries.reduce((sum, entry) => sum + entry.grossMinor, 0);
  const commissionMinorTotal = entries.reduce((sum, entry) => sum + entry.commissionMinor, 0);
  const refundsMinor = entries.reduce((sum, entry) => sum + entry.refundMinor, 0);
  const netMinor = entries.reduce((sum, entry) => sum + entry.netMinor, 0);

  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.payout.create({
      data: {
        sellerId: input.sellerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        grossMinor,
        commissionMinor: commissionMinorTotal,
        refundsMinor,
        netMinor,
        status: "pending",
        createdById: input.actorId ?? null,
        note: input.note ?? null,
      },
    });
    await tx.sellerLedgerEntry.updateMany({
      where: { id: { in: entries.map((entry) => entry.id) } },
      data: { payoutId: created.id, status: "settled" },
    });
    return created;
  });

  return {
    created: true,
    payout: {
      id: payout.id,
      status: payout.status,
      sellerId: payout.sellerId,
      periodStart: payout.periodStart,
      periodEnd: payout.periodEnd,
      grossMinor,
      commissionMinor: commissionMinorTotal,
      refundsMinor,
      netMinor,
      entryCount: entries.length,
      currency: payout.currency,
    },
  };
}
