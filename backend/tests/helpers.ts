import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
  role: string;
}

export const STAFF = {
  admin: { email: "admin@fabulouscartz.com", password: "Admin#2026" },
  manager: { email: "manager@fabulouscartz.com", password: "Manager#2026" },
  fulfilment: { email: "fulfilment@fabulouscartz.com", password: "Fulfil#2026" },
};

export async function makeApp(): Promise<FastifyInstance> {
  return buildApp();
}

export async function loginAs(
  app: FastifyInstance,
  credentials: { email: string; password: string },
): Promise<LoginResult> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: credentials,
  });
  if (response.statusCode !== 200) {
    throw new Error(`Login failed for ${credentials.email}: ${response.statusCode} ${response.body}`);
  }
  const body = response.json();
  return {
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    userId: body.user.id,
    role: body.user.role,
  };
}

export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export const ADDRESS = {
  recipient: "Test Buyer",
  line1: "1 Test Street",
  city: "Kochi",
  state: "Kerala",
  postalCode: "682001",
  country: "IN",
  phone: "+91 9000000000",
};

/** Create a single-variant product through the admin API and return ids. */
export async function createProduct(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; slug: string; variantId: string; sku: string }> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const payload = {
    title: `Test Product ${suffix}`,
    description: "Test product",
    categoryId: "cat_womens",
    vendorId: "ven_omana",
    priceMinor: 4500,
    status: "active",
    buyEnabled: true,
    rentEnabled: true,
    rentDailyMinor: 450,
    rentDepositMinor: 9000,
    tags: ["test"],
    variants: [
      {
        sku: `TEST-${suffix.toUpperCase()}`,
        size: "S",
        color: "Sage",
        priceMinor: 4500,
        stockQuantity: 10,
        lowStockThreshold: 3,
      },
    ],
    ...overrides,
  };

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/admin/products",
    headers: auth(token),
    payload,
  });
  if (response.statusCode !== 201) {
    throw new Error(`Product create failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json();
  return {
    id: body.data.id,
    slug: body.data.slug,
    variantId: body.data.variants[0].id,
    sku: body.data.variants[0].sku,
  };
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  paymentId: string;
  totalMinor: number;
  cartToken: string;
}

/** Guest cart → checkout, returning the created order and pending payment. */
export async function placeGuestOrder(
  app: FastifyInstance,
  variantId: string,
  options: { quantity?: number; couponCode?: string; email?: string; paymentMethod?: string } = {},
): Promise<PlacedOrder> {
  const cart = await app.inject({ method: "POST", url: "/api/v1/cart" });
  const cartToken = cart.json().data.cartToken as string;

  const add = await app.inject({
    method: "POST",
    url: "/api/v1/cart/items",
    headers: { "x-cart-token": cartToken },
    payload: { variantId, mode: "buy", quantity: options.quantity ?? 1 },
  });
  if (add.statusCode !== 201) throw new Error(`Add to cart failed: ${add.body}`);

  if (options.couponCode) {
    await app.inject({
      method: "POST",
      url: "/api/v1/cart/coupon",
      headers: { "x-cart-token": cartToken },
      payload: { code: options.couponCode },
    });
  }

  const email = options.email ?? `guest-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const checkout = await app.inject({
    method: "POST",
    url: "/api/v1/checkout",
    headers: { "x-cart-token": cartToken },
    payload: {
      email,
      shippingAddress: ADDRESS,
      paymentMethod: options.paymentMethod ?? "mock",
    },
  });
  if (checkout.statusCode !== 201) throw new Error(`Checkout failed: ${checkout.body}`);
  const body = checkout.json();
  return {
    orderId: body.data.id,
    orderNumber: body.data.orderNumber,
    paymentId: body.payment.id,
    totalMinor: body.data.totalMinor,
    cartToken,
  };
}

export async function getProduct(app: FastifyInstance, slug: string) {
  const response = await app.inject({ method: "GET", url: `/api/v1/products/${slug}` });
  return response;
}
