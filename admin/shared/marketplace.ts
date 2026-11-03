/* Marketplace + peer-to-peer rental operations contract types.
   These mirror the /admin/* resource shapes. The frontend talks to them
   through src/lib/marketplace.ts, a shallow typed adapter. */

export type KycDecision = "approve" | "reject";
export type KycStatus = "pending" | "approved" | "rejected";
export type SellerStatus = "active" | "suspended";

export interface KycDoc {
  id: string;
  type: "business" | "identity" | "tax" | "bank";
  label: string;
  fileName: string;
  status: "pending" | "verified" | "rejected";
  uploadedAt: string;
  note?: string;
}

export interface Seller {
  id: string;
  name: string;
  handle: string;
  ownerName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  storeType: "marketplace" | "rental" | "hybrid";
  kycStatus: KycStatus;
  status: SellerStatus;
  commissionRate: number;
  rating: number;
  reviews: number;
  gmv: number;
  orders: number;
  joinedAt: string;
  description: string;
  hue: number;
  kycDocs: KycDoc[];
  suspendedReason?: string;
  rejectionReason?: string;
}

export interface Payout {
  id: string;
  sellerId: string;
  sellerName: string;
  period: string;
  gross: number;
  commission: number;
  refunds: number;
  net: number;
  status: "due" | "paid" | "failed";
  reference?: string;
  paidAt?: string;
  createdAt: string;
}

export type RentalListingStatus = "pending" | "approved" | "paused" | "suspended";

export interface RentalListing {
  id: string;
  title: string;
  ownerType: "platform" | "peer";
  sellerId?: string;
  sellerName: string;
  city: string;
  state: string;
  category: string;
  conditionGrade: "A" | "B" | "C";
  replacementValue: number;
  dailyRate: number;
  deposit: number;
  status: RentalListingStatus;
  image: string;
  gallery: string[];
  submittedAt: string;
  approvedAt?: string;
  description: string;
  timesRented: number;
  revenue: number;
  moderationReason?: string;
}

export type BookingState =
  | "requested"
  | "approved"
  | "deposit_authorized"
  | "dispatched"
  | "in_use"
  | "return_due"
  | "returned"
  | "inspection"
  | "completed"
  | "overdue"
  | "disputed";

export const BOOKING_STATES: BookingState[] = [
  "requested",
  "approved",
  "deposit_authorized",
  "dispatched",
  "in_use",
  "return_due",
  "returned",
  "inspection",
  "completed",
  "overdue",
  "disputed",
];

export const ALLOWED_TRANSITIONS: Record<BookingState, BookingState[]> = {
  requested: ["approved"],
  approved: ["deposit_authorized"],
  deposit_authorized: ["dispatched"],
  dispatched: ["in_use"],
  in_use: ["return_due"],
  return_due: ["returned", "overdue"],
  returned: ["inspection"],
  inspection: ["completed", "disputed"],
  completed: [],
  overdue: ["returned", "disputed"],
  disputed: ["completed"],
};

export type DepositState = "none" | "authorized" | "captured" | "released";

export interface BookingItem {
  id: string;
  name: string;
  image: string;
  qty: number;
  dailyRate: number;
  days: number;
}

export interface BookingEvent {
  at: string;
  label: string;
  detail: string;
  actor: string;
}

export interface BookingNote {
  id: string;
  author: string;
  at: string;
  body: string;
}

export interface Booking {
  id: string;
  number: string;
  state: BookingState;
  listingId: string;
  listingTitle: string;
  listingImage: string;
  listingCity: string;
  listingState: string;
  sellerId?: string;
  ownerName: string;
  renterId: string;
  renterName: string;
  renterEmail: string;
  startDate: string;
  endDate: string;
  days: number;
  rentalFee: number;
  deliveryFee: number;
  cleaningFee: number;
  tax: number;
  total: number;
  deposit: number;
  depositState: DepositState;
  depositCaptured?: number;
  depositReleased?: number;
  depositReason?: string;
  daysLate: number;
  lateFee: number;
  createdAt: string;
  items: BookingItem[];
  timeline: BookingEvent[];
  notes: BookingNote[];
  allowedTransitions: BookingState[];
}

export interface Blackout {
  id: string;
  listingId: string;
  listingTitle: string;
  from: string;
  to: string;
  reason: string;
}

export interface DepositRow {
  bookingId: string;
  number: string;
  renterName: string;
  listingTitle: string;
  amount: number;
  state: DepositState;
  authorizedAt: string;
  expiresAt: string;
  ageDays: number;
  daysToExpiry: number;
  sellerName: string;
}

export interface Dispute {
  id: string;
  bookingId: string;
  number: string;
  renterName: string;
  ownerName: string;
  listingTitle: string;
  reason: string;
  openedAt: string;
  evidence: string[];
  status: "open" | "resolved";
  outcome?: "renter_pays" | "owner_pays" | "split" | "refunded";
  amount?: number;
  note?: string;
  resolvedAt?: string;
}

export interface OverdueBooking {
  booking: Booking;
  daysLate: number;
  accruedLateFee: number;
  depositHeld: number;
}

export interface RentalAnalytics {
  range: number;
  rentalRevenue: number;
  activeBookings: number;
  utilization: number;
  depositsHeld: number;
  overdueCount: number;
  pendingListings: number;
  pendingKyc: number;
  gmvSellers: number;
  revenueSeries: { label: string; value: number }[];
  stateMix: { label: string; count: number }[];
}

export interface SellerWorkspace {
  seller: Seller;
  listings: RentalListing[];
  payouts: Payout[];
  bookings: Booking[];
}

export interface CalendarPayload {
  from: string;
  to: string;
  bookings: Booking[];
  blackouts: Blackout[];
  listings: { id: string; title: string; city: string }[];
}
