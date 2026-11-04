/* The single typed boundary between the real /backoffice/api/v1 contract and
   the view models this console renders. Every screen consumes the shapes in
   shared/types.ts and shared/marketplace.ts; no component special-cases a
   wire quirk. Money is converted from minor units exactly once, here. */
import { assetUrl } from "./assets";
import type {
  AnalyticsData,
  AuditEntry,
  Category,
  CategorySlice,
  ContentEntry,
  Coupon,
  Customer,
  DashboardData,
  InventoryRow,
  Kpi,
  Notification,
  Order,
  OrderLine,
  OrderNote,
  Paginated,
  PaymentMethod,
  PaymentStatus,
  Product,
  ProductStatus,
  Settings,
  ShippingAddress,
  StockMovement,
  TimelineEvent,
  TopProduct,
  User,
  Vendor,
} from "../../shared/types";
import type {
  Blackout,
  Booking,
  BookingEvent,
  BookingNote,
  BookingState,
  CalendarPayload,
  DepositRow,
  DepositState,
  Dispute,
  OverdueBooking,
  Payout,
  RentalAnalytics,
  RentalListing,
  RentalListingStatus,
  Seller,
  SellerWorkspace,
} from "../../shared/marketplace";
import { BOOKING_STATES } from "../../shared/marketplace";
import { mapGeo, type GeoMetric, type GeoResult } from "./geo";
import { API_BASE, request } from "./api";

const BASE = (
  (import.meta.env.VITE_MARKETPLACE_BASE as string | undefined) ?? `${API_BASE}/admin`
).replace(/\/$/, "");

type Json = Record<string, any>;
type Params = Record<string, string | number | undefined>;

function qs(params: Params): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== null) search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

/* ----------------------------------------------------------------- raw io */

async function getData<T>(path: string): Promise<T> {
  const body = await request<{ data: T }>(`${BASE}${path}`);
  return body.data;
}

async function getList<T = Json>(path: string): Promise<Paginated<Json>> {
  const body = await request<{ data: Json[]; meta?: { page: number; pageSize: number; total: number; totalPages: number } }>(
    `${BASE}${path}`,
  );
  return mapPage(body);
}

async function send<T = Json>(path: string, method: "POST" | "PATCH", body?: unknown): Promise<T> {
  const payload = await request<{ data: T }>(`${BASE}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return payload.data;
}

function mapPage(body: { data?: Json[]; meta?: { page?: number; pageSize?: number; total?: number; totalPages?: number } }): Paginated<Json> {
  const meta = body.meta ?? {};
  const data = Array.isArray(body.data) ? body.data : [];
  return {
    data,
    page: num(meta.page, 1),
    pageSize: num(meta.pageSize, data.length || 1),
    total: num(meta.total, data.length),
    totalPages: num(meta.totalPages, 1),
  };
}

/* ------------------------------------------------------------- primitives */

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function minor(value: unknown): number {
  return num(value) / 100;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arr(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

function names(source: Json | undefined): string {
  if (!source) return "";
  const joined = [source.firstName, source.lastName].filter(Boolean).join(" ").trim();
  return text(source.name) || joined || text(source.email) || "Unknown";
}

function personEmail(source: Json | undefined): string {
  return text(source?.email);
}

function label(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pct(delta: number, previous: number): number {
  if (!previous) return 0;
  return ((delta - previous) / previous) * 100;
}

function dateOnly(value: unknown): string {
  const raw = text(value);
  return raw ? raw.slice(0, 10) : "";
}

function dayStamp(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).getTime();
}

function periodLabel(start: unknown, end: unknown): string {
  const from = dateOnly(start);
  const to = dateOnly(end);
  if (!from) return "";
  return `${from} → ${to}`;
}

function mediaUrl(value: Json | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return assetUrl(text(value));
  return assetUrl(text(value.url) || text(value.src));
}

function photo(source: Json | undefined): string {
  if (!source) return "";
  const primary = text(source.primaryPhoto) || text(source.primaryImage);
  if (primary) return assetUrl(primary);
  return mediaUrl(arr(source.photos)[0] ?? arr(source.images)[0]);
}

function hashHue(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) % 360;
  return hash;
}

/* --------------------------------------------------------------- sellers */

function mapKycStatus(status: unknown): Seller["kycStatus"] {
  const raw = text(status);
  if (raw === "approved" || raw === "rejected" || raw === "pending") return raw;
  return "rejected";
}

function mapKycDoc(doc: Json): Seller["kycDocs"][number] {
  const type = text(doc.type);
  const labels: Record<string, string> = {
    business_license: "Business licence",
    tax_id: "Tax id",
    id_proof: "Identity proof",
    address_proof: "Address proof",
    bank_statement: "Bank statement",
  };
  const status = text(doc.status);
  return {
    id: text(doc.id),
    type: (type === "business_license" ? "business" : type === "tax_id" ? "tax" : type === "bank_statement" ? "bank" : "identity") as Seller["kycDocs"][number]["type"],
    label: labels[type] ?? label(type),
    fileName: text(doc.fileUrl).split("/").pop() || text(doc.documentNumber) || "Document",
    status: (status === "approved" ? "verified" : status === "rejected" ? "rejected" : "pending") as Seller["kycDocs"][number]["status"],
    uploadedAt: text(doc.submittedAt) || text(doc.createdAt),
    note: text(doc.reviewNote) || undefined,
  };
}

function mapSeller(raw: Json): Seller {
  const address = raw.contact?.address as Json | undefined;
  const kyc = mapKycStatus(raw.kyc?.status);
  const counts = (raw.counts ?? {}) as Json;
  const sellerStatus = text(raw.status) === "suspended" ? "suspended" : "active";
  const products = num(counts.products);
  const rentals = num(counts.rentalListings);
  return {
    id: text(raw.id),
    name: text(raw.storeName),
    handle: text(raw.slug),
    ownerName: names(raw.owner),
    email: text(raw.contact?.email) || personEmail(raw.owner),
    phone: text(raw.contact?.phone),
    city: text(address?.city),
    state: text(address?.state),
    storeType: products > 0 && rentals > 0 ? "hybrid" : rentals > 0 ? "rental" : "marketplace",
    kycStatus: kyc,
    status: sellerStatus,
    commissionRate: num(raw.commission?.rateBps) / 100,
    rating: num(raw.rating),
    reviews: num(raw.rating?.count),
    gmv: 0,
    orders: 0,
    joinedAt: text(raw.joinedAt) || text(raw.createdAt),
    description: text(raw.description),
    hue: hashHue(text(raw.slug) || text(raw.id)),
    kycDocs: arr(raw.kyc?.documents).map(mapKycDoc),
  };
}

function mapPayout(raw: Json): Payout {
  const status = text(raw.status);
  return {
    id: text(raw.id),
    sellerId: text(raw.sellerId) || text(raw.seller?.id),
    sellerName: text(raw.sellerName) || names(raw.seller),
    period: periodLabel(raw.periodStart, raw.periodEnd),
    gross: minor(raw.grossMinor),
    commission: minor(raw.commissionMinor),
    refunds: minor(raw.refundsMinor),
    net: minor(raw.netMinor),
    status: status === "paid" ? "paid" : status === "failed" ? "failed" : "due",
    reference: text(raw.reference) || undefined,
    paidAt: text(raw.paidAt) || undefined,
    createdAt: text(raw.createdAt),
  };
}

/* -------------------------------------------------------------- listings */

function mapListingStatus(status: unknown): RentalListingStatus {
  const raw = text(status);
  if (raw === "active") return "approved";
  if (raw === "pending_review") return "pending";
  if (raw === "suspended") return "suspended";
  return "paused";
}

function mapCondition(grade: unknown): RentalListing["conditionGrade"] {
  const raw = text(grade);
  if (raw === "new" || raw === "like_new") return "A";
  if (raw === "good") return "B";
  return "C";
}

function mapListing(raw: Json): RentalListing {
  const rates = (raw.rates ?? {}) as Json;
  const location = (raw.location ?? {}) as Json;
  const replacement = (raw.replacementValue ?? {}) as Json;
  return {
    id: text(raw.id),
    title: text(raw.title),
    ownerType: raw.seller ? "peer" : "platform",
    sellerId: text(raw.seller?.id) || undefined,
    sellerName: text(raw.seller?.storeName) || names(raw.owner),
    city: text(location.city),
    state: text(location.state),
    category: text(raw.category?.name),
    conditionGrade: mapCondition(raw.conditionGrade),
    replacementValue: minor(replacement.amountMinor) || num(replacement.amount),
    dailyRate: minor(rates.dailyMinor) || num(rates.daily),
    deposit: minor(rates.depositMinor) || num(rates.deposit),
    status: mapListingStatus(raw.status),
    image: photo(raw),
    gallery: arr(raw.photos).map((value) => text(value)),
    submittedAt: text(raw.createdAt),
    approvedAt: text(raw.updatedAt),
    description: text(raw.description),
    timesRented: num(raw.bookingCount),
    revenue: 0,
  };
}

/* --------------------------------------------------------------- bookings */

const HIDDEN_BOOKING_STATES = new Set(["declined", "cancelled_by_renter", "cancelled_by_owner"]);
const UI_STATES = new Set<string>(BOOKING_STATES);

function mapDepositState(status: unknown): DepositState {
  const raw = text(status);
  if (raw === "authorized" || raw === "captured") return raw;
  if (raw === "released" || raw === "expired") return "released";
  return "none";
}

function mapBookingState(status: unknown): BookingState | null {
  const raw = text(status);
  if (HIDDEN_BOOKING_STATES.has(raw)) return null;
  return UI_STATES.has(raw) ? (raw as BookingState) : null;
}

type Lookup = Map<string, Json>;

function mapBooking(raw: Json, lookup?: Lookup): Booking | null {
  const state = mapBookingState(raw.status);
  if (!state) return null;
  const moneyObj = (raw.money ?? {}) as Json;
  const listing = (raw.listing ?? {}) as Json;
  const joined = lookup?.get(text(raw.id)) ?? {};
  const joinedListing = (joined.listing ?? {}) as Json;
  const windowObj = (raw.window ?? {}) as Json;
  const startDate = text(windowObj.startDate) || text(raw.startDate);
  const endDate = text(windowObj.endDate) || text(raw.endDate);
  const days = num(windowObj.days) || num(raw.days);
  const depositObj = (raw.deposit ?? {}) as Json;
  const overdueObj = (raw.overdue ?? {}) as Json;
  const rentalFee = minor(moneyObj.rentalFeeMinor) || minor(raw.rentalFeeMinor);
  const platformFee = minor(moneyObj.platformFeeMinor) || minor(raw.platformFeeMinor);
  const depositAmount = minor(moneyObj.depositMinor) || minor(raw.depositMinor) || minor(depositObj.amountMinor);
  const totalDue = minor(moneyObj.totalDueMinor) || minor(raw.totalDueMinor);
  const ledger = arr(depositObj.ledger);
  const lastLedger = ledger[ledger.length - 1];
  const renter = (raw.renter ?? {}) as Json;
  const owner = (raw.owner ?? {}) as Json;
  const listingTitle = text(listing.title) || text(joinedListing.title);
  const events = arr(raw.events);
  const timeline: BookingEvent[] = events.map((event) => ({
    at: text(event.createdAt),
    label: label(event.toStatus) || "Updated",
    detail: text(event.note),
    actor: text(event.actorId) || "System",
  }));
  const notes: BookingNote[] = arr(raw.notes).map((note) => ({
    id: text(note.id),
    author: names(note) || text(note.authorId) || "Operator",
    at: text(note.createdAt),
    body: text(note.body) || text(note.note),
  }));
  const transitions = arr(raw.allowedTransitions)
    .map((value) => text(value))
    .filter((value): value is BookingState => UI_STATES.has(value));
  const image = photo(listing) || photo(joinedListing) || text(arr(raw.items)[0]?.image);
  const computedTotal = totalDue > 0 ? Math.max(0, totalDue - depositAmount) : rentalFee;
  const dailyRate = minor(moneyObj.dailyRateMinor) || (days ? rentalFee / days : 0);
  const derivedItems: Booking["items"] = listingTitle
    ? [{ id: `${text(raw.id)}-item`, name: listingTitle, image, qty: 1, dailyRate, days }]
    : [];

  return {
    id: text(raw.id),
    number: text(raw.bookingNumber) || text(joined.bookingNumber),
    state,
    listingId: text(listing.id) || text(raw.listingId),
    listingTitle,
    listingImage: image,
    listingCity: text(listing.city) || text(raw.city),
    listingState: text(listing.state) || text(raw.state),
    sellerId: text(listing.seller?.id) || undefined,
    ownerName: names(owner) || names(joined.owner),
    renterId: text(renter.id) || text(raw.renterUserId),
    renterName: names(renter) || names(joined.renter),
    renterEmail: personEmail(renter) || personEmail(joined.renter),
    startDate,
    endDate,
    days,
    rentalFee,
    deliveryFee: 0,
    cleaningFee: 0,
    tax: platformFee,
    total: computedTotal,
    deposit: depositAmount,
    depositState: mapDepositState(depositObj.status),
    depositCaptured: minor(depositObj.capturedMinor) || undefined,
    depositReleased: minor(depositObj.releasedMinor) || undefined,
    depositReason: text(lastLedger?.reason) || undefined,
    daysLate: num(overdueObj.days) || num(raw.overdueDays),
    lateFee: minor(moneyObj.lateFeeMinor) || minor(raw.lateFeeMinor),
    createdAt: text(raw.createdAt),
    items: arr(raw.items).length
      ? arr(raw.items).map((item) => ({
          id: text(item.id),
          name: text(item.name) || text(item.title),
          image: assetUrl(text(item.image)),
          qty: num(item.qty) || num(item.quantity),
          dailyRate: minor(item.dailyRate) || minor(item.unitPriceMinor),
          days: num(item.days) || days,
        }))
      : derivedItems,
    timeline,
    notes,
    allowedTransitions: transitions,
  };
}

async function bookingLookup(): Promise<Lookup> {
  const page = await getList("/rentals/bookings?page=1&pageSize=100");
  const map: Lookup = new Map();
  page.data.forEach((row) => map.set(text(row.id), row));
  return map;
}

/* --------------------------------------------------------------- analytics */

async function rentalAnalytics(range: number): Promise<RentalAnalytics> {
  const to = new Date();
  const from = new Date(to.getTime() - range * 86_400_000);
  const [rentals, sellersAnalytics, pending, bookings] = await Promise.all([
    getData<Json>(`/analytics/rentals?from=${dateOnly(from.toISOString())}&to=${dateOnly(to.toISOString())}`),
    getData<Json>(`/analytics/sellers?from=${dateOnly(from.toISOString())}&to=${dateOnly(to.toISOString())}`),
    getList("/sellers?kycStatus=pending&pageSize=1"),
    getList("/rentals/bookings?page=1&pageSize=100"),
  ]);
  const totals = (rentals.money ?? {}) as Json;
  const listingCount = num(rentals.listings?.total);
  const active = num(rentals.bookings?.active);
  const series = new Map<string, number>();
  bookings.data.forEach((row) => {
    const created = dateOnly(row.createdAt);
    if (bookingsHidden(row, from, to)) return;
    series.set(created, (series.get(created) ?? 0) + minor(row.money?.rentalFeeMinor ?? row.rentalFeeMinor));
  });
  return {
    range,
    rentalRevenue: minor(totals.gmvMinor),
    activeBookings: active,
    utilization: listingCount ? (active / listingCount) * 100 : 0,
    depositsHeld: minor(totals.depositHeldMinor),
    overdueCount: num(rentals.bookings?.overdue),
    pendingListings: num(rentals.listings?.byStatus?.pending_review),
    pendingKyc: pending.total,
    gmvSellers: minor(sellersAnalytics.totals?.gmvMinor),
    revenueSeries: Array.from(series.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ label: date.slice(5), value })),
    stateMix: arr(rentals.byState).map((row) => ({ label: text(row.state), count: num(row.count) })),
  };
}

function bookingsHidden(row: Json, from: Date, to: Date): boolean {
  if (HIDDEN_BOOKING_STATES.has(text(row.status))) return true;
  const stamp = new Date(text(row.createdAt)).getTime();
  return Number.isNaN(stamp) || stamp < from.getTime() || stamp > to.getTime();
}

/* ---------------------------------------------------------------- sellers */

async function sellers(params: { q?: string; kycStatus?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const [page, analytics] = await Promise.all([
    getList("/sellers?pageSize=100"),
    getData<Json>("/analytics/sellers?from=2025-01-01&to=2100-01-01").catch(() => ({ topSellers: [] } as Json)),
  ]);
  const revenue = new Map<string, Json>();
  arr(analytics.topSellers).forEach((row) => revenue.set(text(row.sellerId), row));
  const mapped = page.data.map((row) => {
    const seller = mapSeller(row);
    const stats = revenue.get(seller.id);
    if (stats) {
      seller.gmv = minor(stats.gmvMinor);
      seller.orders = num(stats.orders);
    }
    return seller;
  });
  const query = (params.q ?? "").toLowerCase();
  const data = mapped.filter((seller) => {
    if (params.kycStatus && seller.kycStatus !== params.kycStatus) return false;
    if (params.status && seller.status !== params.status) return false;
    if (query && !`${seller.name} ${seller.ownerName} ${seller.email} ${seller.city}`.toLowerCase().includes(query)) return false;
    return true;
  });
  const facets = {
    pending: mapped.filter((seller) => seller.kycStatus === "pending").length,
    approved: mapped.filter((seller) => seller.kycStatus === "approved").length,
    rejected: mapped.filter((seller) => seller.kycStatus === "rejected" && seller.status !== "suspended").length,
    suspended: mapped.filter((seller) => seller.status === "suspended").length,
  };
  return { ...page, data, facets };
}

async function sellerWorkspace(id: string): Promise<SellerWorkspace> {
  const raw = await getData<Json>(`/sellers/${id}`);
  return {
    seller: mapSeller(raw),
    listings: arr(raw.rentalListings).map(mapListing),
    payouts: arr(raw.payouts).map(mapPayout),
    bookings: [],
  };
}

/* ------------------------------------------------------------ payout shape */

async function payouts(params: { period?: string; status?: string } = {}) {
  const status = params.status === "due" ? "pending" : params.status;
  const page = await getList(`/payouts${qs({ pageSize: 100, status })}`);
  const rows = page.data.map(mapPayout);
  const filtered = params.period ? rows.filter((row) => row.period === params.period) : rows;
  const summary = {
    due: filtered.filter((row) => row.status === "due").reduce((sum, row) => sum + row.net, 0),
    paid: filtered.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.net, 0),
    failed: filtered.filter((row) => row.status === "failed").reduce((sum, row) => sum + row.net, 0),
    count: filtered.length,
  };
  const periods = Array.from(new Set(rows.map((row) => row.period))).sort().reverse();
  return { data: filtered, summary, periods, page: page.page, pageSize: page.pageSize, total: page.total, totalPages: page.totalPages };
}

/* ----------------------------------------------------------- order mapping */

const ORDER_STATUS_MAP: Record<string, Order["status"]> = {
  pending: "pending",
  paid: "processing",
  confirmed: "processing",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  refunded: "returned",
};

const PAYMENT_MAP: Record<string, PaymentMethod> = {
  phonepe: "phonepe",
  upi: "upi",
  card: "card",
  cod: "cod",
  gpay: "gpay",
};

function mapShipping(raw: Json | undefined): ShippingAddress {
  return {
    line1: text(raw?.line1),
    city: text(raw?.city),
    state: text(raw?.state),
    pin: text(raw?.postalCode),
    country: text(raw?.country),
  };
}

function mapOrderLine(raw: Json, products: Map<string, Json>): OrderLine {
  const product = products.get(text(raw.productId));
  return {
    id: text(raw.id),
    productId: text(raw.productId),
    name: text(raw.title) || text(product?.title),
    sku: text(raw.sku),
    image: photo(product),
    qty: num(raw.quantity),
    unitPrice: minor(raw.unitPriceMinor),
    mode: text(raw.mode) === "rent" ? "rent" : "buy",
    rentalDays: raw.rentalDays === null || raw.rentalDays === undefined ? undefined : num(raw.rentalDays),
  };
}

function mapOrder(raw: Json, products: Map<string, Json>): Order {
  const items = arr(raw.items).map((item) => mapOrderLine(item, products));
  const address = mapShipping(raw.shippingAddress as Json | undefined);
  const notes: OrderNote[] = [];
  if (typeof raw.notes === "string" && raw.notes.trim()) {
    notes.push({ id: `${text(raw.id)}-note`, author: "Operator", body: raw.notes, createdAt: text(raw.createdAt) });
  }
  const timeline: TimelineEvent[] = [
    ["placedAt", "Order placed", "Storefront"],
    ["paidAt", "Payment captured", "Payments"],
    ["confirmedAt", "Confirmed", "Operations"],
    ["shippedAt", "Dispatched", "Fulfilment"],
    ["deliveredAt", "Delivered", "Carrier"],
    ["cancelledAt", "Cancelled", "Operations"],
    ["refundedAt", "Refunded", "Payments"],
  ]
    .filter(([key]) => text(raw[key]))
    .map(([key, labelText, by]) => ({
      id: `${text(raw.id)}-${key}`,
      label: labelText,
      detail: "",
      at: text(raw[key]),
      by,
    }));
  const payment = text(raw.paymentMethod);
  return {
    id: text(raw.id),
    number: text(raw.orderNumber),
    customerId: text(raw.userId),
    customerName: address.line1 ? text(raw.shippingAddress?.recipient) : text(raw.email),
    customerEmail: text(raw.email),
    customerPhone: text(raw.shippingAddress?.phone),
    items,
    subtotal: minor(raw.subtotalMinor),
    shipping: minor(raw.shippingMinor),
    tax: minor(raw.taxMinor),
    discount: minor(raw.discountMinor),
    total: minor(raw.totalMinor),
    couponCode: text(raw.couponCode) || undefined,
    paymentMethod: PAYMENT_MAP[payment] ?? "cod",
    paymentStatus: (text(raw.paymentStatus) === "succeeded" ? "paid" : text(raw.paymentStatus)) as PaymentStatus,
    status: ORDER_STATUS_MAP[text(raw.status)] ?? "pending",
    channel: "web",
    shippingAddress: address,
    notes,
    timeline,
    createdAt: text(raw.placedAt) || text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  };
}

async function productIndex(): Promise<Map<string, Json>> {
  const page = await getList("/products?pageSize=100");
  return new Map(page.data.map((row) => [text(row.id), row]));
}

/* -------------------------------------------------------------- products */

function mapProduct(raw: Json): Product {
  const status = text(raw.status);
  const rating = (raw.rating ?? {}) as Json;
  const variants = arr(raw.variants).map((variant) => ({
    id: text(variant.id),
    sku: text(variant.sku),
    size: text(variant.size),
    color: text(variant.color),
    price: minor(variant.priceMinor) || minor(variant.price?.amountMinor),
    rentalPrice: 0,
    stock: num(variant.stockQuantity),
    rented: num(variant.reservedQuantity),
    lowStockThreshold: num(variant.lowStockThreshold),
    rentWindowDays: 7,
  }));
  return {
    id: text(raw.id),
    slug: text(raw.slug),
    name: text(raw.title),
    description: text(raw.description),
    details: arr(raw.details).map((value) => text(value)),
    price: minor(raw.priceMinor) || minor(raw.price?.amountMinor),
    mrp: raw.mrp === null || raw.mrp === undefined ? undefined : minor(raw.mrp),
    modes: arr(raw.modes).map((value) => (text(value) === "rent" ? "rent" : "buy")),
    categoryId: text(raw.category?.id),
    vendorId: text(raw.vendor?.id),
    images: arr(raw.images).map(mediaUrl),
    variants,
    tags: arr(raw.tags).map((value) => text(value)),
    status: (status === "active" ? "published" : status === "archived" ? "archived" : "draft") as ProductStatus,
    featured: Boolean(raw.featured),
    newArrival: Boolean(raw.newArrival),
    topSeller: Boolean(raw.topSeller),
    rating: num(rating.average),
    reviews: num(rating.count),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  };
}

/* -------------------------------------------------------------- customers */

function mapCustomer(raw: Json): Customer {
  const orders = num(raw.ordersCount);
  const spend = minor(raw.lifetimeSpendMinor);
  const segment: Customer["segment"] =
    spend >= 1500 ? "VIP" : orders > 1 ? "Repeat" : "New";
  return {
    id: text(raw.id),
    name: text(raw.name) || names(raw),
    email: text(raw.email),
    phone: text(raw.phone),
    city: text(arr(raw.addresses)[0]?.city),
    segment,
    tags: [],
    notes: "",
    createdAt: text(raw.createdAt),
    ordersCount: orders,
    lifetimeValue: spend,
    lastOrderAt: null,
  };
}

/* -------------------------------------------------------------- inventory */

function mapInventoryRow(raw: Json, products?: Map<string, Json>): InventoryRow {
  const stock = num(raw.stockQuantity);
  const rented = num(raw.reservedQuantity);
  const available = num(raw.available, stock - rented);
  const threshold = num(raw.lowStockThreshold);
  const status = available <= 0 ? "out" : stock <= threshold || Boolean(raw.isLowStock) ? "low" : "in_stock";
  return {
    sku: text(raw.sku),
    productId: text(raw.product?.id),
    productName: text(raw.product?.title),
    image: photo(raw.product) || photo(products?.get(text(raw.product?.id ?? raw.productId))),
    size: text(raw.size),
    color: text(raw.color),
    stock,
    rented,
    available,
    lowStockThreshold: threshold,
    rentWindowDays: 7,
    status,
    price: 0,
    updatedAt: text(raw.updatedAt),
  };
}

function mapMovement(raw: Json): StockMovement {
  return {
    id: text(raw.id),
    sku: text(raw.variant?.sku),
    productId: text(raw.variant?.productId) || "",
    productName: text(raw.variant?.product?.title),
    delta: num(raw.delta),
    previous: num(raw.beforeQuantity),
    next: num(raw.afterQuantity),
    reason: label(raw.reason),
    note: text(raw.note),
    actor: text(raw.actorId),
    at: text(raw.createdAt),
  };
}

/* ----------------------------------------------------------------- audit */

function mapAudit(raw: Json): AuditEntry {
  return {
    id: text(raw.id),
    at: text(raw.createdAt),
    actor: text(raw.actorEmail),
    actorRole: (text(raw.actorRole) === "customer" ? "fulfilment" : text(raw.actorRole) || "admin") as AuditEntry["actorRole"],
    action: text(raw.action),
    entity: text(raw.entityType),
    entityId: text(raw.entityId),
    detail: raw.after ? JSON.stringify(raw.after) : raw.before ? JSON.stringify(raw.before) : text(raw.ip),
  };
}

/* ---------------------------------------------------------- notifications */

function mapNotification(raw: Json): Notification {
  const template = text(raw.template);
  const kind: Notification["kind"] = /stock/.test(template)
    ? "stock"
    : /order|refund|payment/.test(template)
      ? "order"
      : /customer|welcome/.test(template)
        ? "customer"
        : "system";
  const href = kind === "stock" ? "/inventory?status=low" : kind === "order" ? "/orders" : "/settings";
  return {
    id: text(raw.id),
    title: text(raw.subject) || label(template),
    body: text(raw.payload) || `${text(raw.channel)} → ${text(raw.toAddress)}`,
    kind,
    read: text(raw.status) === "sent",
    href,
    at: text(raw.createdAt),
  };
}

/* -------------------------------------------------------------- dashboard */

const MIX_COLORS = ["#2E8B57", "#B8913A", "#B56576", "#5C6B7F", "#7C9A6D", "#C08552"];

async function dashboard(range: number): Promise<DashboardData> {
  const to = new Date();
  const from = new Date(to.getTime() - range * 86_400_000);
  const previousFrom = new Date(to.getTime() - 2 * range * 86_400_000);
  const window = `?from=${dateOnly(from.toISOString())}&to=${dateOnly(to.toISOString())}`;
  const previousWindow = `?from=${dateOnly(previousFrom.toISOString())}&to=${dateOnly(from.toISOString())}`;
  const [summary, previous, series, mix, top, low, orders, activity, notices, products] = await Promise.all([
    getData<Json>(`/analytics/summary${window}`),
    getData<Json>(`/analytics/summary${previousWindow}`).catch(() => ({}) as Json),
    getData<Json[]>(`/analytics/revenue-series${window}`),
    getData<Json[]>(`/analytics/category-mix${window}`),
    getData<Json[]>(`/analytics/top-products${window}&limit=6`),
    getData<Json[]>(`/analytics/low-stock?limit=6`),
    getList(`/orders?pageSize=6`),
    getList("/audit?pageSize=5"),
    getList("/notifications"),
    productIndex(),
  ]);
  const revenue = minor(summary.revenue?.grossMinor);
  const prevRevenue = minor(previous.revenue?.grossMinor);
  const orderCount = num(summary.orders?.total);
  const prevOrders = num(previous.orders?.total);
  const aov = minor(summary.averageOrderValueMinor);
  const prevAov = minor(previous.averageOrderValueMinor);
  const customers = num(summary.uniqueCustomers);
  const prevCustomers = num(previous.uniqueCustomers);
  const revenueSeries: DashboardData["revenueSeries"] = series.map((row) => ({
    date: text(row.date),
    revenue: minor(row.revenueMinor),
    orders: num(row.orders),
  }));
  const spark = revenueSeries.map((point) => point.revenue);
  const kpis: Kpi[] = [
    {
      key: "revenue",
      label: "Revenue",
      value: revenue,
      display: `$${revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      delta: pct(revenue, prevRevenue),
      sparkline: spark,
      meta: `${orderCount} orders · net of refunds`,
    },
    {
      key: "orders",
      label: "Orders",
      value: orderCount,
      display: orderCount.toLocaleString("en-US"),
      delta: pct(orderCount, prevOrders),
      sparkline: revenueSeries.map((point) => point.orders),
      meta: `${num(summary.orders?.paid)} paid`,
    },
    {
      key: "aov",
      label: "Average order",
      value: aov,
      display: `$${aov.toFixed(0)}`,
      delta: pct(aov, prevAov),
      sparkline: spark,
      meta: `${num(summary.orders?.refunded)} refunded`,
    },
    {
      key: "customers",
      label: "Customers",
      value: customers,
      display: customers.toLocaleString("en-US"),
      delta: pct(customers, prevCustomers),
      sparkline: spark,
      meta: "Unique buyers in window",
    },
  ];
  const lowStock: InventoryRow[] = low.map((row) => ({
    sku: text(row.sku),
    productId: text(row.productId),
    productName: text(row.product),
    image: photo(products.get(text(row.productId))),
    size: text(row.size),
    color: text(row.color),
    stock: num(row.stockQuantity),
    rented: num(row.reservedQuantity),
    available: num(row.available),
    lowStockThreshold: num(row.threshold),
    rentWindowDays: 7,
    status: "low",
    price: 0,
    updatedAt: "",
  }));
  const topProducts: TopProduct[] = top.map((row) => ({
    id: text(row.productId),
    name: text(row.title),
    image: photo(products.get(text(row.productId))),
    revenue: minor(row.revenueMinor),
    units: num(row.units),
    category: "",
  }));
  const paid = num(summary.orders?.paid);
  const totalOrders = num(summary.orders?.total);
  return {
    greeting: `${greeting()}, Operator`,
    range: String(range),
    kpis,
    revenueSeries,
    categoryMix: mix.map((row, index) => ({
      name: text(row.category),
      value: minor(row.revenueMinor),
      color: MIX_COLORS[index % MIX_COLORS.length],
    })) as CategorySlice[],
    topProducts,
    recentOrders: orders.data.map((row) => mapOrder(row, products)),
    lowStock,
    activity: activity.data.map((row) => ({
      id: text(row.id),
      label: label(row.action) || "Updated",
      detail: `${text(row.entityType)} ${text(row.entityId)}`,
      at: text(row.createdAt),
      by: text(row.actorEmail) || text(row.actorRole),
    })),
    notifications: notices.data.map(mapNotification),
    fulfilment: {
      rate: totalOrders ? (paid / totalOrders) * 100 : 0,
      dispatched: paid,
      pending: Math.max(0, totalOrders - paid),
      returned: num(summary.orders?.refunded),
    },
    totals: { revenue, orders: orderCount, aov, customers },
  };
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/* -------------------------------------------------------------- analytics */

async function analytics(range: number): Promise<AnalyticsData> {
  const to = new Date();
  const from = new Date(to.getTime() - range * 86_400_000);
  const previousFrom = new Date(to.getTime() - 2 * range * 86_400_000);
  const window = `?from=${dateOnly(from.toISOString())}&to=${dateOnly(to.toISOString())}`;
  const previousWindow = `?from=${dateOnly(previousFrom.toISOString())}&to=${dateOnly(from.toISOString())}`;
  const [summary, previous, series, mix, top, orders] = await Promise.all([
    getData<Json>(`/analytics/summary${window}`),
    getData<Json>(`/analytics/summary${previousWindow}`).catch(() => ({}) as Json),
    getData<Json[]>(`/analytics/revenue-series${window}`),
    getData<Json[]>(`/analytics/category-mix${window}`),
    getData<Json[]>(`/analytics/top-products${window}&limit=6`),
    getList("/orders?pageSize=100"),
  ]);
  const products = await productIndex();
  const paymentMix = new Map<string, number>();
  orders.data.forEach((row) => {
    const key = text(row.paymentMethod) || "unknown";
    paymentMix.set(key, (paymentMix.get(key) ?? 0) + minor(row.totalMinor));
  });
  const units = mix.reduce((sum, row) => sum + num(row.units), 0);
  return {
    range,
    totals: {
      revenue: minor(summary.revenue?.grossMinor),
      orders: num(summary.orders?.total),
      aov: minor(summary.averageOrderValueMinor),
      units,
      refunds: minor(summary.revenue?.refundsMinor),
      newCustomers: num(summary.uniqueCustomers),
    },
    previous: {
      revenue: minor(previous.revenue?.grossMinor),
      orders: num(previous.orders?.total),
      aov: minor(previous.averageOrderValueMinor),
    },
    series: series.map((row) => ({ date: text(row.date), revenue: minor(row.revenueMinor), orders: num(row.orders) })),
    categoryMix: mix.map((row, index) => ({ name: text(row.category), value: minor(row.revenueMinor), color: MIX_COLORS[index % MIX_COLORS.length] })),
    paymentMix: Array.from(paymentMix.entries()).map(([name, value], index) => ({ name: label(name), value, color: MIX_COLORS[index % MIX_COLORS.length] })),
    topProducts: top.map((row) => ({
      id: text(row.productId),
      name: text(row.title),
      image: photo(products.get(text(row.productId))),
      revenue: minor(row.revenueMinor),
      units: num(row.units),
      category: "",
    })),
    channelMix: [],
  };
}

/* ---------------------------------------------------------------- catalog */

function mapCategory(raw: Json): Category {
  return {
    id: text(raw.id),
    slug: text(raw.slug),
    name: text(raw.name),
    tagline: text(raw.tagline),
    description: text(raw.description),
    image: assetUrl(text(raw.imageUrl)),
    accent: text(raw.accent),
    visible: Boolean(raw.isVisible),
    order: num(raw.sortOrder),
    createdAt: text(raw.createdAt),
  };
}

function mapVendor(raw: Json): Vendor {
  return {
    id: text(raw.id),
    slug: text(raw.slug),
    name: text(raw.name),
    rating: num(raw.rating),
    sales: num(raw.salesCount),
    email: text(raw.email),
    location: text(raw.location),
    description: text(raw.description),
    active: Boolean(raw.isActive),
    order: 0,
    createdAt: text(raw.createdAt),
  };
}

function mapCoupon(raw: Json): Coupon {
  return {
    id: text(raw.id),
    code: text(raw.code),
    description: text(raw.description),
    type: text(raw.kind) === "percent" ? "percent" : "flat",
    value: text(raw.kind) === "percent" ? num(raw.value) : minor(raw.value),
    minSpend: minor(raw.minSubtotalMinor),
    startsAt: text(raw.startsAt),
    endsAt: text(raw.endsAt),
    usageLimit: num(raw.maxRedemptions),
    used: num(raw.redemptionCount),
    active: Boolean(raw.isActive),
    appliesTo: text(raw.categoryId) || "all",
    createdAt: text(raw.createdAt),
  };
}

function mapContent(raw: Json): ContentEntry {
  return {
    id: text(raw.id),
    type: text(raw.placement) ? "banner" : "editorial",
    title: text(raw.title),
    subtitle: text(raw.subtitle) || text(raw.excerpt),
    body: text(raw.body),
    image: assetUrl(text(raw.coverImage) || text(raw.imageUrl)),
    ctaLabel: text(raw.linkLabel),
    ctaHref: text(raw.linkUrl),
    status: text(raw.status) === "published" || Boolean(raw.isActive) ? "published" : "draft",
    author: text(raw.authorId),
    updatedAt: text(raw.updatedAt),
  };
}

function mapSettings(raw: Json): Settings {
  const store = (raw.store ?? {}) as Json;
  const payments = (raw.payments ?? {}) as Json;
  const notifications = (raw.notifications ?? {}) as Json;
  return {
    brand: {
      name: text(store.name),
      tagline: text(store.tagline),
      email: text(store.email),
      supportPhone: text(store.supportPhone),
      address: text(store.address),
    },
    currency: text(store.currency),
    taxRate: num(raw.tax?.ratePercent),
    shippingFlat: minor(raw.shipping?.flatMinor),
    freeShippingThreshold: minor(raw.shipping?.freeAboveMinor),
    payments: {
      phonepe: Boolean(payments.phonepe),
      gpay: Boolean(payments.upi),
      upi: Boolean(payments.upi),
      card: Boolean(payments.card),
      cod: Boolean(payments.cod),
    },
    notifications: {
      orderCreated: Boolean(notifications.orderCreated),
      lowStock: Boolean(notifications.lowStock),
      dailyDigest: Boolean(notifications.dailyDigest),
      refundRequests: Boolean(notifications.refundRequests),
      newCustomer: Boolean(notifications.newCustomer),
    },
  };
}

function mapUser(raw: Json): User {
  return {
    id: text(raw.id),
    name: text(raw.name) || names(raw),
    email: text(raw.email),
    username: text(raw.username) || undefined,
    role: (text(raw.role) === "customer" ? "fulfilment" : text(raw.role) || "admin") as User["role"],
    title: text(raw.title),
    phone: text(raw.phone),
    lastActiveAt: text(raw.lastLoginAt) || text(raw.createdAt),
    createdAt: text(raw.createdAt),
  };
}

/* ------------------------------------------------------------ public API */

export class ApiUnavailableError extends Error {
  constructor(feature: string) {
    super(`${feature} is not available in the API yet.`);
    this.name = "ApiUnavailableError";
  }
}

export const resources = {
  /* composed reads */
  dashboard,
  geo: async (params: { metric?: GeoMetric; from?: string; to?: string } = {}): Promise<GeoResult> => {
    const raw = await request<Record<string, any>>(
      `${BASE}/analytics/geo${qs({ metric: params.metric, from: params.from, to: params.to, include: "orders,bookings" })}`,
    );
    return mapGeo(raw);
  },
  orderStates: async (_range: number): Promise<never> => {
    throw new ApiUnavailableError("A per-state order aggregate");
  },
  orderStateDetail: async (_shape: string): Promise<never> => {
    throw new ApiUnavailableError("A per-state order aggregate");
  },
  analytics,
  rentalAnalytics,
  notifications: async () => {
    const page = await getList("/notifications");
    const data = page.data.map(mapNotification);
    return { data, unread: data.filter((item) => !item.read).length };
  },

  /* marketplace domain */
  sellers,
  seller: sellerWorkspace,
  bookings: async (params: { q?: string } = {}) => {
    const page = await getList("/rentals/bookings?page=1&pageSize=100");
    const rows = page.data
      .map((row) => mapBooking({ ...row, listing: row.listing, renter: row.renter, owner: row.owner }))
      .filter((row): row is Booking => Boolean(row));
    const query = (params.q ?? "").toLowerCase();
    const filtered = query
      ? rows.filter((row) => [row.number, row.renterName, row.listingTitle, row.ownerName].join(" ").toLowerCase().includes(query))
      : rows;
    return { data: filtered, total: filtered.length };
  },
  booking: async (id: string) => {
    const raw = await getData<Json>(`/rentals/bookings/${id}`);
    const mapped = mapBooking(raw);
    if (!mapped) throw new ApiUnavailableError("This booking state has no console column");
    return mapped;
  },
  transition: async (id: string, to: BookingState, note?: string) => {
    const raw = await send<Json>(`/rentals/bookings/${id}/transition`, "POST", { to, note });
    const mapped = mapBooking(raw);
    if (!mapped) throw new ApiUnavailableError("This booking state has no console column");
    return mapped;
  },
  addBookingNote: async (): Promise<Booking> => {
    throw new ApiUnavailableError("Booking notes");
  },
  remind: async (): Promise<void> => {
    throw new ApiUnavailableError("Renter reminders");
  },
  deposits: async (state?: string) => {
    const [page, bookings] = await Promise.all([
      getList(`/rentals/deposits${qs({ pageSize: 100, status: state })}`),
      bookingLookup(),
    ]);
    const rows: DepositRow[] = page.data.map((raw) => {
      const joined = bookings.get(text(raw.bookingId)) ?? {};
      const authorized = text(raw.authorizedAt) || text(raw.createdAt);
      const ageDays = authorized ? Math.max(0, Math.floor((Date.now() - new Date(authorized).getTime()) / 86_400_000)) : 0;
      return {
        bookingId: text(raw.bookingId),
        number: text(raw.booking?.bookingNumber) || text(joined.bookingNumber),
        renterName: names(joined.renter) || text(raw.booking?.renter?.email),
        listingTitle: names(joined.listing),
        amount: minor(raw.amountMinor),
        state: mapDepositState(raw.status),
        authorizedAt: authorized,
        expiresAt: text(raw.expiresAt),
        ageDays,
        daysToExpiry: text(raw.expiresAt) ? Math.max(0, Math.ceil((new Date(text(raw.expiresAt)).getTime() - Date.now()) / 86_400_000)) : Math.max(0, 30 - ageDays),
        sellerName: names(joined.owner),
      };
    });
    return { data: rows };
  },
  captureDeposit: async (bookingId: string, amount: number, reason: string) => {
    const deposit = await getData<Json>(`/rentals/deposits?bookingId=${bookingId}&pageSize=1`);
    const list = Array.isArray(deposit) ? deposit : arr((deposit as Json).data);
    const id = text(list[0]?.id);
    if (!id) throw new ApiUnavailableError("This booking's deposit");
    await send(`/rentals/deposits/${id}/capture`, "POST", { amountMinor: Math.round(amount * 100), reason });
    return resources.booking(bookingId);
  },
  releaseDeposit: async (bookingId: string, reason?: string) => {
    const page = await getList(`/rentals/deposits?bookingId=${bookingId}&pageSize=1`);
    const id = text(page.data[0]?.id);
    if (!id) throw new ApiUnavailableError("This booking's deposit");
    await send(`/rentals/deposits/${id}/release`, "POST", { reason });
    return resources.booking(bookingId);
  },
  overdue: async () => {
    const [page, bookings] = await Promise.all([getList("/rentals/overdue"), bookingLookup()]);
    const rows: OverdueBooking[] = page.data.flatMap((raw) => {
      const joined = bookings.get(text(raw.id)) ?? {};
      const mapped = mapBooking({ ...joined, ...raw }, bookings);
      if (!mapped) return [];
      return [{
        booking: mapped,
        daysLate: num(raw.overdueDays),
        accruedLateFee: minor(raw.lateFeeMinor),
        depositHeld: minor(raw.depositMinor),
      }];
    });
    return { data: rows };
  },
  disputes: async (status?: string) => {
    const [page, bookings] = await Promise.all([
      getList(`/rentals/disputes${qs({ pageSize: 100, status })}`),
      bookingLookup(),
    ]);
    const rows: Dispute[] = page.data.map((raw) => {
      const joined = bookings.get(text(raw.bookingId)) ?? {};
      return {
        id: text(raw.id),
        bookingId: text(raw.bookingId),
        number: text(raw.booking?.bookingNumber) || text(joined.bookingNumber),
        renterName: names(joined.renter) || text(raw.booking?.renter?.email),
        ownerName: names(joined.owner) || text(raw.booking?.owner?.email),
        listingTitle: text(raw.booking?.listing?.title) || text(joined.listing?.title),
        reason: text(raw.reason),
        openedAt: text(raw.createdAt),
        evidence: [],
        status: text(raw.status) === "resolved" ? "resolved" : "open",
        outcome: text(raw.resolution) as Dispute["outcome"] || undefined,
        amount: minor(raw.claimAmountMinor),
        note: text(raw.resolutionNote) || undefined,
        resolvedAt: text(raw.decidedAt) || undefined,
      };
    });
    return { data: rows };
  },
  openDispute: async (): Promise<Dispute> => {
    throw new ApiUnavailableError("Opening disputes");
  },
  resolveDispute: async (id: string, outcome: Dispute["outcome"], note: string, _amount?: number) => {
    const raw = await send<Json>(`/rentals/disputes/${id}/resolve`, "POST", { resolution: outcome, resolutionNote: note });
    return { ...raw } as Dispute;
  },
  listings: async (params: { status?: string; city?: string; ownerType?: string } = {}) => {
    const rawStatus = params.status === "approved" ? "active" : params.status === "pending" ? "pending_review" : params.status === "paused" ? "draft" : params.status;
    const page = await getList(`/rentals/listings${qs({ pageSize: 100, status: rawStatus })}`);
    const rows = page.data.map(mapListing);
    const filtered = rows.filter((row) => {
      if (params.status && row.status !== params.status) return false;
      if (params.city && row.city !== params.city) return false;
      if (params.ownerType && row.ownerType !== params.ownerType) return false;
      return true;
    });
    return {
      ...page,
      data: filtered,
      facets: {
        pending: rows.filter((row) => row.status === "pending").length,
        approved: rows.filter((row) => row.status === "approved").length,
        paused: rows.filter((row) => row.status === "paused").length,
        suspended: rows.filter((row) => row.status === "suspended").length,
      },
      cities: Array.from(new Set(rows.map((row) => row.city).filter(Boolean))).sort(),
    };
  },
  moderateListing: async (id: string, action: "approve" | "pause" | "suspend", reason?: string) => {
    const status = action === "approve" ? "active" : action === "pause" ? "paused" : "suspended";
    const raw = await send<Json>(`/rentals/listings/${id}`, "PATCH", { status, note: reason });
    return mapListing(raw);
  },
  calendar: async (params: { from?: string; to?: string; listingId?: string } = {}): Promise<CalendarPayload> => {
    const [payload, bookings, listings] = await Promise.all([
      getData<Json>(`/rentals/calendar${qs({ from: params.from, to: params.to })}`),
      bookingLookup(),
      getList("/rentals/listings?pageSize=100"),
    ]);
    const mapped = arr(payload.bookings)
      .map((row) => {
        const base = bookings.get(text(row.id));
        return mapBooking(base ? { ...base, ...row, listing: { ...base.listing, ...row.listing } } : row, bookings);
      })
      .filter((row): row is Booking => Boolean(row));
    const blackouts: Blackout[] = arr(payload.blackouts).map((raw) => ({
      id: text(raw.id),
      listingId: text(raw.listingId),
      listingTitle: text(raw.listing?.title) || text(bookings.get(text(raw.bookingId))?.listing?.title),
      from: text(raw.startDate),
      to: text(raw.endDate),
      reason: text(raw.reason),
    }));
    const all = listings.data.map(mapListing);
    return {
      from: text(payload.window?.from),
      to: text(payload.window?.to),
      bookings: params.listingId ? mapped.filter((row) => row.listingId === params.listingId) : mapped,
      blackouts: params.listingId ? blackouts.filter((row) => row.listingId === params.listingId) : blackouts,
      listings: all.map((row) => ({ id: row.id, title: row.title, city: row.city })),
    };
  },
  payouts,
  markPaid: async (id: string, reference: string) => {
    const raw = await send<Json>(`/payouts/${id}/mark-paid`, "POST", { reference });
    return mapPayout(raw);
  },
  reviewSeller: async (id: string, decision: "approve" | "reject", reason?: string) => {
    const raw = await send<Json>(`/sellers/${id}/review`, "POST", { action: decision, reason });
    return mapSeller(raw);
  },
  suspendSeller: async (id: string, reason: string) => {
    const current = await getData<Json>(`/sellers/${id}`);
    const action = text(current.status) === "suspended" ? "reinstate" : "suspend";
    const raw = await send<Json>(`/sellers/${id}/review`, "POST", { action, reason });
    return mapSeller(raw);
  },
  setCommission: async (id: string, rate: number) => {
    const raw = await send<Json>(`/sellers/${id}/commission`, "PATCH", { commissionRateBps: Math.round(rate * 100) });
    return mapSeller(raw);
  },

  /* commerce */
  orders: async (params: { page?: number; pageSize?: number; status?: string; q?: string; state?: string; paymentStatus?: string; from?: string; to?: string; sort?: string } = {}) => {
    const page = await getList(`/orders${qs({ pageSize: 100 })}`);
    const products = await productIndex();
    let data = page.data.map((row) => mapOrder(row, products));
    if (params.status) data = data.filter((row) => row.status === params.status);
    if (params.state) data = data.filter((row) => row.shippingAddress.state === params.state);
    if (params.paymentStatus) data = data.filter((row) => row.paymentStatus === params.paymentStatus);
    if (params.from) data = data.filter((row) => dateOnly(row.createdAt) >= params.from!);
    if (params.to) data = data.filter((row) => dateOnly(row.createdAt) <= params.to!);
    const query = (params.q ?? "").toLowerCase();
    if (query) data = data.filter((row) => [row.number, row.customerName, row.customerEmail].join(" ").toLowerCase().includes(query));
    data = [...data].sort((a, b) => (params.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : params.sort === "value" ? b.total - a.total : b.createdAt.localeCompare(a.createdAt)));
    const pageSize = params.pageSize ?? 12;
    const pageNumber = params.page ?? 1;
    const start = (pageNumber - 1) * pageSize;
    return {
      data: data.slice(start, start + pageSize),
      page: pageNumber,
      pageSize,
      total: data.length,
      totalPages: Math.max(1, Math.ceil(data.length / pageSize)),
    };
  },
  order: async (id: string) => {
    const raw = await getData<Json>(`/orders/${id}`);
    const products = await productIndex();
    return mapOrder(raw, products);
  },
  updateOrderStatus: async (id: string, status: string) => {
    if (status === "returned") throw new ApiUnavailableError("Refunds");
    const wire = status === "processing" ? "confirmed" : status;
    const raw = await send<Json>(`/orders/${id}/status`, "PATCH", { status: wire });
    const products = await productIndex();
    return mapOrder(raw, products);
  },
  products: async (params: { page?: number; pageSize?: number; status?: string; q?: string; categoryId?: string; vendorId?: string; mode?: string; sort?: string } = {}) => {
    const page = await getList(`/products${qs({ pageSize: 100 })}`);
    let data = page.data.map(mapProduct);
    if (params.status) data = data.filter((row) => row.status === params.status);
    if (params.categoryId) data = data.filter((row) => row.categoryId === params.categoryId);
    if (params.vendorId) data = data.filter((row) => row.vendorId === params.vendorId);
    if (params.mode) data = data.filter((row) => row.modes.includes(params.mode as "buy" | "rent"));
    const query = (params.q ?? "").toLowerCase();
    if (query) data = data.filter((row) => `${row.name} ${row.slug}`.toLowerCase().includes(query));
    data = [...data].sort((a, b) => (params.sort === "name" ? a.name.localeCompare(b.name) : params.sort === "price" ? b.price - a.price : b.updatedAt.localeCompare(a.updatedAt)));
    const pageSize = params.pageSize ?? 12;
    const pageNumber = params.page ?? 1;
    const start = (pageNumber - 1) * pageSize;
    return {
      data: data.slice(start, start + pageSize),
      page: pageNumber,
      pageSize,
      total: data.length,
      totalPages: Math.max(1, Math.ceil(data.length / pageSize)),
    };
  },
  product: async (id: string) => mapProduct(await getData<Json>(`/products/${id}`)),
  createProduct: async (payload: Json) => mapProduct(await send<Json>("/products", "POST", payload)),
  updateProduct: async (id: string, payload: Json) => mapProduct(await send<Json>(`/products/${id}`, "PATCH", payload)),
  media: async (): Promise<never> => {
    throw new ApiUnavailableError("The media library");
  },
  updateProductStatus: async (id: string, published: boolean) => {
    const raw = await send<Json>(`/products/${id}`, "PATCH", { status: published ? "active" : "draft" });
    return mapProduct(raw);
  },
  archiveProduct: async (id: string) => {
    await request(`${BASE}/products/${id}`, { method: "DELETE" });
  },
  customers: async (params: { page?: number; pageSize?: number; q?: string; segment?: string; sort?: string } = {}) => {
    const page = await getList(`/customers${qs({ pageSize: 100 })}`);
    let data = page.data.map(mapCustomer);
    const query = (params.q ?? "").toLowerCase();
    if (query) data = data.filter((row) => `${row.name} ${row.email}`.toLowerCase().includes(query));
    if (params.segment) data = data.filter((row) => row.segment === params.segment);
    data = [...data].sort((a, b) =>
      params.sort === "orders" ? b.ordersCount - a.ordersCount : params.sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : b.lifetimeValue - a.lifetimeValue,
    );
    const pageSize = params.pageSize ?? 12;
    const pageNumber = params.page ?? 1;
    const start = (pageNumber - 1) * pageSize;
    return {
      data: data.slice(start, start + pageSize),
      page: pageNumber,
      pageSize,
      total: data.length,
      totalPages: Math.max(1, Math.ceil(data.length / pageSize)),
    };
  },
  customer: async (id: string) => {
    const raw = await getData<Json>(`/customers/${id}`);
    const products = await productIndex();
    return {
      customer: mapCustomer(raw),
      orders: arr(raw.orders).map((row) => mapOrder(row, products)),
      addresses: arr(raw.addresses).map(mapShipping),
      wishlist: arr(raw.wishlist).map((row) => text(row.productId ?? row.id)),
    };
  },
  inventory: async (params: { page?: number; pageSize?: number; status?: string; q?: string } = {}) => {
    const page = await getList(`/inventory${qs({ page: params.page ?? 1, pageSize: params.pageSize ?? 100 })}`);
    const products = await productIndex();
    const all = page.data.map((row) => mapInventoryRow(row, products));
    const query = (params.q ?? "").toLowerCase();
    const searched = query ? all.filter((row) => `${row.productName} ${row.sku}`.toLowerCase().includes(query)) : all;
    const data = params.status === "low" ? searched.filter((row) => row.status === "low") : params.status === "out" ? searched.filter((row) => row.status === "out") : searched;
    const summary = {
      units: all.reduce((sum, row) => sum + row.stock, 0),
      rented: all.reduce((sum, row) => sum + row.rented, 0),
      low: all.filter((row) => row.status === "low").length,
      out: all.filter((row) => row.status === "out").length,
      value: 0,
    };
    return { ...page, data, summary, updatedAt: all[0]?.updatedAt ?? "" };
  },
  movements: async (params: { page?: number; pageSize?: number; sku?: string; q?: string } = {}) => {
    const page = await getList(`/inventory/adjustments${qs({ page: params.page ?? 1, pageSize: params.pageSize ?? 100 })}`);
    const data = page.data.map(mapMovement);
    const query = (params.q ?? "").toLowerCase();
    const filtered = query ? data.filter((row) => `${row.sku} ${row.productName} ${row.reason}`.toLowerCase().includes(query)) : data;
    return { ...page, data: params.sku ? filtered.filter((row) => row.sku === params.sku) : filtered };
  },
  adjustInventory: async (variantId: string, delta: number, reason: string, note: string) => {
    await send("/inventory/adjustments", "POST", { variantId, delta, reason: "correction", note: `${reason}${note ? ` · ${note}` : ""}` });
  },
  adjustInventoryBySku: async (sku: string, delta: number, reason: string, note: string) => {
    const page = await getList("/inventory?pageSize=100");
    const variant = page.data.find((row) => text(row.sku) === sku);
    if (!variant) throw new ApiUnavailableError("This SKU in inventory");
    await send("/inventory/adjustments", "POST", {
      variantId: text(variant.id),
      delta,
      reason: "correction",
      note: `${reason}${note ? ` · ${note}` : ""}`,
    });
  },
  audit: async (params: { page?: number; pageSize?: number; q?: string; entity?: string } = {}) => {
    const page = await getList(`/audit${qs({ page: params.page ?? 1, pageSize: params.pageSize ?? 100 })}`);
    const data = page.data.map(mapAudit);
    const query = (params.q ?? "").toLowerCase();
    const filtered = query ? data.filter((row) => `${row.actor} ${row.action} ${row.entityId}`.toLowerCase().includes(query)) : data;
    return { ...page, data: params.entity ? filtered.filter((row) => row.entity === params.entity) : filtered };
  },
  categories: async () => {
    const page = await getList("/categories");
    return { data: page.data.map(mapCategory) };
  },
  vendors: async () => {
    const page = await getList("/vendors");
    return { data: page.data.map(mapVendor) };
  },
  coupons: async () => {
    const page = await getList("/coupons");
    return { data: page.data.map(mapCoupon) };
  },
  content: async () => {
    const [posts, banners] = await Promise.all([getList("/posts"), getList("/banners")]);
    return { data: [...posts.data.map(mapContent), ...banners.data.map(mapContent)] };
  },
  settings: async () => mapSettings(await getData<Json>("/settings")),
  team: async () => {
    const page = await getList("/users");
    return { data: page.data.map(mapUser) };
  },
};

export type Resources = typeof resources;
