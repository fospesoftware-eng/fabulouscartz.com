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
import { request } from "./api";

/* Typed adapter for the /admin marketplace + rental contract.
   Point VITE_MARKETPLACE_BASE at the real service (absolute URL or path)
   and every screen follows without further changes. */
const BASE = (import.meta.env.VITE_MARKETPLACE_BASE as string | undefined) ?? "/api/admin";

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== null) search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

type SellerPage = Paginated<Seller> & {
  facets: { pending: number; approved: number; rejected: number; suspended: number };
};
type PayoutPage = {
  data: Payout[];
  summary: { due: number; paid: number; failed: number; count: number };
  periods: string[];
};
type ListingPayload = {
  data: RentalListing[];
  facets: { pending: number; approved: number; paused: number; suspended: number };
  cities: string[];
};

export const marketplace = {
  /* Sellers */
  sellers: (params: { q?: string; kycStatus?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    request<SellerPage>(`${BASE}/sellers${qs(params)}`),
  seller: (id: string) => request<SellerWorkspace>(`${BASE}/sellers/${id}`),
  reviewSeller: (id: string, decision: "approve" | "reject", reason?: string) =>
    request<Seller>(`${BASE}/sellers/${id}/review`, { method: "POST", body: JSON.stringify({ decision, reason }) }),
  setCommission: (id: string, rate: number) =>
    request<Seller>(`${BASE}/sellers/${id}/commission`, { method: "PATCH", body: JSON.stringify({ rate }) }),
  suspendSeller: (id: string, reason: string) =>
    request<Seller>(`${BASE}/sellers/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),

  /* Payouts */
  payouts: (params: { period?: string; status?: string } = {}) =>
    request<PayoutPage>(`${BASE}/payouts${qs(params)}`),
  markPaid: (id: string, reference: string) =>
    request<Payout>(`${BASE}/payouts/${id}/mark-paid`, { method: "POST", body: JSON.stringify({ reference }) }),

  /* Rental listings */
  listings: (params: { status?: string; city?: string; ownerType?: string } = {}) =>
    request<ListingPayload>(`${BASE}/rentals/listings${qs(params)}`),
  moderateListing: (id: string, action: "approve" | "pause" | "suspend", reason?: string) =>
    request<RentalListing>(`${BASE}/rentals/listings/${id}/moderate`, {
      method: "POST",
      body: JSON.stringify({ action, reason }),
    }),

  /* Bookings */
  bookings: (params: Record<string, string | undefined> = {}) =>
    request<{ data: Booking[]; total: number }>(`${BASE}/rentals/bookings${qs(params)}`),
  booking: (id: string) => request<Booking>(`${BASE}/rentals/bookings/${id}`),
  transition: (id: string, to: BookingState, note?: string) =>
    request<Booking>(`${BASE}/rentals/bookings/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ to, note }),
    }),
  addBookingNote: (id: string, body: string) =>
    request<Booking>(`${BASE}/rentals/bookings/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  remind: (id: string) => request<Booking>(`${BASE}/rentals/bookings/${id}/remind`, { method: "POST" }),

  /* Calendar */
  calendar: (params: { from?: string; to?: string; listingId?: string } = {}) =>
    request<CalendarPayload>(`${BASE}/rentals/calendar${qs(params)}`),

  /* Deposits */
  deposits: (state?: string) => request<{ data: DepositRow[] }>(`${BASE}/rentals/deposits${qs({ state })}`),
  captureDeposit: (bookingId: string, amount: number, reason: string) =>
    request<Booking>(`${BASE}/rentals/bookings/${bookingId}/deposit/capture`, {
      method: "POST",
      body: JSON.stringify({ amount, reason }),
    }),
  releaseDeposit: (bookingId: string, reason?: string) =>
    request<Booking>(`${BASE}/rentals/bookings/${bookingId}/deposit/release`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  /* Overdue + disputes */
  overdue: () => request<{ data: OverdueBooking[] }>(`${BASE}/rentals/overdue`),
  disputes: (status?: string) => request<{ data: Dispute[] }>(`${BASE}/rentals/disputes${qs({ status })}`),
  openDispute: (bookingId: string, reason: string) =>
    request<Dispute>(`${BASE}/rentals/disputes`, { method: "POST", body: JSON.stringify({ bookingId, reason }) }),
  resolveDispute: (id: string, outcome: "renter_pays" | "owner_pays" | "split" | "refunded", amount: number, note: string) =>
    request<Dispute>(`${BASE}/rentals/disputes/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcome, amount, note }),
    }),

  /* Analytics */
  analytics: (range: number) => request<RentalAnalytics>(`${BASE}/rentals/analytics${qs({ range })}`),

  _base: BASE,
};

export type MarketplaceListingStatus = RentalListingStatus;
