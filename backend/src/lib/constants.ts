import crypto from "node:crypto";

export const ROLES = ["admin", "manager", "fulfilment", "customer"] as const;
export type Role = (typeof ROLES)[number];

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "processing", "succeeded", "failed", "refunded"] as const;
export const PAYMENT_PROVIDERS = ["mock", "phonepe", "razorpay", "upi", "card"] as const;
export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export const CONTENT_STATUSES = ["draft", "published"] as const;
export const STOCK_REASONS = [
  "initial_stock",
  "restock",
  "correction",
  "damage",
  "return",
  "rental_return",
  "sale",
  "cancellation",
] as const;
export const CART_MODES = ["buy", "rent"] as const;

// ---------------------------------------------------------------------------
// Marketplace: sellers, KYC, commissions and payouts
// ---------------------------------------------------------------------------

export const SELLER_KYC_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export type SellerKycStatus = (typeof SELLER_KYC_STATUSES)[number];

export const SELLER_STATUSES = ["pending", "active", "suspended", "rejected"] as const;
export const PAYOUT_METHODS = ["bank_transfer", "paypal", "stripe_connect"] as const;
export const PAYOUT_VERIFICATION_STATUSES = ["unverified", "pending", "verified", "failed"] as const;
export const PAYOUT_STATUSES = ["pending", "processing", "paid", "failed"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const DEFAULT_COMMISSION_BPS = 1200; // 12% platform default

// ---------------------------------------------------------------------------
// Peer-to-peer rentals
// ---------------------------------------------------------------------------

export const RENTAL_LISTING_STATUSES = ["draft", "pending_review", "active", "paused", "suspended"] as const;
export const CONDITION_GRADES = ["new", "like_new", "good", "fair", "worn"] as const;
export const HANDOVER_MODES = ["ship", "pickup", "both"] as const;
export const DEPOSIT_STATUSES = ["pending", "authorized", "captured", "released", "expired"] as const;
export const DISPUTE_RESOLUTIONS = ["renter_pays", "owner_pays", "split", "refunded"] as const;
export const INSPECTION_CONDITIONS = ["as_returned", "minor_wear", "damaged", "missing_parts"] as const;

export const BOOKING_STATUSES = [
  "requested",
  "approved",
  "deposit_authorized",
  "dispatched",
  "in_use",
  "return_due",
  "returned",
  "inspection",
  "completed",
  "declined",
  "cancelled_by_renter",
  "cancelled_by_owner",
  "overdue",
  "disputed",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * Booking lifecycle:
 *
 *   requested → approved → deposit_authorized → dispatched → in_use → return_due
 *            → returned → inspection → completed
 *
 * Side paths: declined, cancelled_by_renter, cancelled_by_owner, overdue, disputed.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ["approved", "declined", "cancelled_by_renter"],
  approved: ["deposit_authorized", "cancelled_by_renter", "cancelled_by_owner"],
  deposit_authorized: ["dispatched", "in_use", "cancelled_by_owner"],
  dispatched: ["in_use", "overdue"],
  in_use: ["return_due", "overdue", "returned"],
  return_due: ["returned", "overdue"],
  overdue: ["returned"],
  returned: ["inspection"],
  inspection: ["completed", "disputed"],
  disputed: ["completed"],
  declined: [],
  cancelled_by_renter: [],
  cancelled_by_owner: [],
  completed: [],
};

/** Statuses that hold the calendar dates for a listing. */
export const BOOKING_BLOCKING_STATUSES: BookingStatus[] = [
  "requested",
  "approved",
  "deposit_authorized",
  "dispatched",
  "in_use",
  "return_due",
  "overdue",
  "returned",
  "inspection",
  "disputed",
];

/** Fulfilment may move operational states but never money-bearing ones. */
export const FULFILMENT_BOOKING_TARGETS: BookingStatus[] = [
  "dispatched",
  "in_use",
  "return_due",
  "returned",
  "inspection",
  "overdue",
];

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

export function bookingNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `BK-${stamp}${rand}`;
}


/** Allowed order transitions. Enforced by the order service. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["confirmed", "refunded"],
  confirmed: ["shipped", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function newId(prefix = ""): string {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  return prefix ? `${prefix}_${id}` : id;
}

export function orderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `FC-${stamp}${rand}`;
}

export function cartToken(): string {
  return `ct_${crypto.randomBytes(24).toString("base64url")}`;
}
