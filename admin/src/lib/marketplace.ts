import type { Paginated } from "../../shared/types";
import type {
  Booking,
  BookingState,
  CalendarPayload,
  DepositRow,
  Dispute,
  OverdueBooking,
  Payout,
  RentalAnalytics,
  RentalListing,
  RentalListingStatus,
  Seller,
  SellerWorkspace,
} from "../../shared/marketplace";
import { resources } from "./normalize";

/* Thin compatibility surface: every call now delegates to the single
   normaliser in normalize.ts. Kept so screens keep importing `marketplace`
   without knowing wire details. */
export type SellerPage = Paginated<Seller> & {
  facets: { pending: number; approved: number; rejected: number; suspended: number };
};
export type PayoutPage = {
  data: Payout[];
  summary: { due: number; paid: number; failed: number; count: number };
  periods: string[];
};
export type ListingPayload = {
  data: RentalListing[];
  facets: { pending: number; approved: number; paused: number; suspended: number };
  cities: string[];
};

export const marketplace = {
  /* Sellers */
  sellers: (params: { q?: string; kycStatus?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    resources.sellers(params) as Promise<SellerPage>,
  seller: (id: string) => resources.seller(id),
  reviewSeller: (id: string, decision: "approve" | "reject", reason?: string) => resources.reviewSeller(id, decision, reason),
  setCommission: (id: string, rate: number) => resources.setCommission(id, rate),
  suspendSeller: (id: string, reason: string) => resources.suspendSeller(id, reason),

  /* Payouts */
  payouts: (params: { period?: string; status?: string } = {}) => resources.payouts(params) as Promise<PayoutPage>,
  markPaid: (id: string, reference: string) => resources.markPaid(id, reference),

  /* Rental listings */
  listings: (params: { status?: string; city?: string; ownerType?: string } = {}) =>
    resources.listings(params) as Promise<ListingPayload>,
  moderateListing: (id: string, action: "approve" | "pause" | "suspend", reason?: string) =>
    resources.moderateListing(id, action, reason),

  /* Bookings */
  bookings: (params: { q?: string } = {}) => resources.bookings(params),
  booking: (id: string) => resources.booking(id),
  transition: (id: string, to: BookingState, note?: string) => resources.transition(id, to, note),
  addBookingNote: (_id: string, _body: string): Promise<Booking> => resources.addBookingNote(),
  remind: (_id: string) => resources.remind(),

  /* Calendar */
  calendar: (params: { from?: string; to?: string; listingId?: string } = {}) =>
    resources.calendar(params) as Promise<CalendarPayload>,

  /* Deposits */
  deposits: (state?: string) => resources.deposits(state) as Promise<{ data: DepositRow[] }>,
  captureDeposit: (bookingId: string, amount: number, reason: string) => resources.captureDeposit(bookingId, amount, reason),
  releaseDeposit: (bookingId: string, reason?: string) => resources.releaseDeposit(bookingId, reason),

  /* Overdue + disputes */
  overdue: () => resources.overdue() as Promise<{ data: OverdueBooking[] }>,
  disputes: (status?: string) => resources.disputes(status) as Promise<{ data: Dispute[] }>,
  openDispute: (_bookingId: string, _reason: string): Promise<Dispute> => resources.openDispute(),
  resolveDispute: (id: string, outcome: "renter_pays" | "owner_pays" | "split" | "refunded", amount: number, note: string) =>
    resources.resolveDispute(id, outcome, note, amount) as Promise<Dispute>,

  /* Analytics */
  analytics: (range: number) => resources.rentalAnalytics(range) as Promise<RentalAnalytics>,

  _base: "",
};

export type MarketplaceListingStatus = RentalListingStatus;
