import type { Database } from "../store.js";
import {
  NOW,
  seedCategories,
  seedContent,
  seedCoupons,
  seedNotifications,
  seedProducts,
  seedSettings,
  seedUsers,
  seedVendors,
} from "./catalog.js";
import { seedAudit, seedCustomers, seedMovements, seedOrders } from "./commerce.js";
import { seedMarketplace } from "./marketplace.js";

export function buildSeed(): Database {
  const customers = seedCustomers();
  const orders = seedOrders(customers);
  const marketplace = seedMarketplace();
  return {
    version: 1,
    seededAt: NOW.toISOString(),
    users: seedUsers(),
    products: seedProducts,
    categories: seedCategories,
    vendors: seedVendors,
    customers,
    orders,
    coupons: seedCoupons,
    content: seedContent,
    settings: seedSettings,
    audit: seedAudit(),
    notifications: seedNotifications,
    movements: seedMovements(),
    sellers: marketplace.sellers,
    payouts: marketplace.payouts,
    listings: marketplace.listings,
    bookings: marketplace.bookings,
    blackouts: marketplace.blackouts,
    disputes: marketplace.disputes,
  };
}
