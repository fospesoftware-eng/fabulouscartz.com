/**
 * Shared domain contract for the Fabulous Cartz operations console.
 * Imported by both the admin UI and the API server so the wire format
 * cannot drift between the two halves of the app.
 */

export const ROLES = ["admin", "manager", "fulfilment"] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  "pending",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["paid", "pending", "refunded", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["phonepe", "gpay", "upi", "card", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type ProductStatus = "published" | "draft" | "archived";
export type ProductMode = "buy" | "rent";
export type Segment = "VIP" | "Repeat" | "New" | "At risk" | "Wholesale";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  phone?: string;
  lastActiveAt: string;
  createdAt: string;
}

export interface StoredUser extends User {
  passwordSalt: string;
  passwordHash: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
  accent: string;
  visible: boolean;
  order: number;
  createdAt: string;
}

export interface Vendor {
  id: string;
  slug: string;
  name: string;
  rating: number;
  sales: number;
  email: string;
  location: string;
  description: string;
  active: boolean;
  order: number;
  createdAt: string;
}

export interface Variant {
  id: string;
  sku: string;
  size: string;
  color: string;
  price: number;
  rentalPrice: number;
  stock: number;
  rented: number;
  lowStockThreshold: number;
  rentWindowDays: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  details: string[];
  price: number;
  mrp?: number;
  modes: ProductMode[];
  categoryId: string;
  vendorId: string;
  images: string[];
  variants: Variant[];
  tags: string[];
  status: ProductStatus;
  featured: boolean;
  newArrival: boolean;
  topSeller: boolean;
  rating: number;
  reviews: number;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  segment: Segment;
  tags: string[];
  notes: string;
  createdAt: string;
  ordersCount: number;
  lifetimeValue: number;
  lastOrderAt: string | null;
}

export type OrderChannel = "web" | "instagram" | "whatsapp" | "store";

export interface OrderLine {
  id: string;
  productId: string;
  name: string;
  sku: string;
  image: string;
  qty: number;
  unitPrice: number;
  mode: "buy" | "rent";
  rentalDays?: number;
}

export interface OrderNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  label: string;
  detail?: string;
  at: string;
  by: string;
}

export interface ShippingAddress {
  line1: string;
  city: string;
  state: string;
  pin: string;
  country: string;
}

export interface Order {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderLine[];
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  couponCode?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  channel: OrderChannel;
  shippingAddress: ShippingAddress;
  notes: OrderNote[];
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  sku: string;
  productId: string;
  productName: string;
  delta: number;
  previous: number;
  next: number;
  reason: string;
  note: string;
  actor: string;
  at: string;
}

export interface InventoryRow {
  sku: string;
  productId: string;
  productName: string;
  image: string;
  size: string;
  color: string;
  stock: number;
  rented: number;
  available: number;
  lowStockThreshold: number;
  rentWindowDays: number;
  status: "in_stock" | "low" | "out";
  price: number;
  updatedAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  description: string;
  type: "percent" | "flat";
  value: number;
  minSpend: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  used: number;
  active: boolean;
  appliesTo: "all" | string;
  createdAt: string;
}

export interface ContentEntry {
  id: string;
  type: "hero" | "banner" | "editorial";
  title: string;
  subtitle: string;
  body: string;
  image: string;
  ctaLabel: string;
  ctaHref: string;
  status: "draft" | "published";
  author: string;
  updatedAt: string;
}

export interface Settings {
  brand: {
    name: string;
    tagline: string;
    email: string;
    supportPhone: string;
    address: string;
  };
  currency: string;
  taxRate: number;
  shippingFlat: number;
  freeShippingThreshold: number;
  payments: Record<PaymentMethod, boolean>;
  notifications: {
    orderCreated: boolean;
    lowStock: boolean;
    dailyDigest: boolean;
    refundRequests: boolean;
    newCustomer: boolean;
  };
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  actorRole: Role;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  kind: "order" | "stock" | "customer" | "system";
  read: boolean;
  href: string;
  at: string;
}

export interface MediaAsset {
  name: string;
  url: string;
  folder: string;
  size: number;
}

export interface Kpi {
  key: string;
  label: string;
  value: number;
  display: string;
  delta: number;
  sparkline: number[];
  meta: string;
}

export interface SeriesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface CategorySlice {
  name: string;
  value: number;
  color: string;
}

export interface TopProduct {
  id: string;
  name: string;
  image: string;
  revenue: number;
  units: number;
  category: string;
}

export interface DashboardData {
  greeting: string;
  range: string;
  kpis: Kpi[];
  revenueSeries: SeriesPoint[];
  categoryMix: CategorySlice[];
  topProducts: TopProduct[];
  recentOrders: Order[];
  lowStock: InventoryRow[];
  activity: TimelineEvent[];
  notifications: Notification[];
  fulfilment: { rate: number; dispatched: number; pending: number; returned: number };
  totals: { revenue: number; orders: number; aov: number; customers: number };
}

export interface AnalyticsData {
  range: number;
  totals: {
    revenue: number;
    orders: number;
    aov: number;
    units: number;
    refunds: number;
    newCustomers: number;
  };
  previous: { revenue: number; orders: number; aov: number };
  series: SeriesPoint[];
  categoryMix: CategorySlice[];
  paymentMix: { name: string; value: number; color: string }[];
  topProducts: TopProduct[];
  channelMix: { name: string; value: number }[];
}

export interface UsStateOrders {
  code: string;
  name: string;
  orders: number;
  revenue: number;
  aov: number;
  units: number;
  share: number;
}

export interface UsMapData {
  range: number;
  totals: { orders: number; revenue: number; aov: number; units: number };
  states: UsStateOrders[];
}

export interface UsStateDetail {
  state: UsStateOrders;
  range: number;
  topProducts: TopProduct[];
  recentOrders: Order[];
}

export interface LoginResponse {
  user: User;
  expiresAt: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets?: Record<string, number>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface CouponValidation {
  valid: boolean;
  code: string;
  discount: number;
  total: number;
  message: string;
}

export interface SearchResult {
  products: Pick<Product, "id" | "name" | "slug" | "images" | "status">[];
  orders: Pick<Order, "id" | "number" | "customerName" | "total" | "status">[];
  customers: Pick<Customer, "id" | "name" | "email">[];
}
