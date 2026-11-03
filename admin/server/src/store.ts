import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type {
  AuditEntry,
  Category,
  ContentEntry,
  Coupon,
  Customer,
  Notification,
  Order,
  Product,
  Settings,
  StockMovement,
  StoredUser,
  Vendor,
} from "../../shared/types.js";
import type { Blackout, Booking, Dispute, Payout, RentalListing, Seller } from "../../shared/marketplace.js";
import { buildSeed } from "./seed/index.js";
import { seedMarketplace } from "./seed/marketplace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const dbFile = path.join(dataDir, "db.json");
const secretFile = path.join(dataDir, "session.secret");

export interface Database {
  version: number;
  seededAt: string;
  users: StoredUser[];
  products: Product[];
  categories: Category[];
  vendors: Vendor[];
  customers: Customer[];
  orders: Order[];
  coupons: Coupon[];
  content: ContentEntry[];
  settings: Settings;
  audit: AuditEntry[];
  notifications: Notification[];
  movements: StockMovement[];
  sellers: Seller[];
  payouts: Payout[];
  listings: RentalListing[];
  bookings: Booking[];
  blackouts: Blackout[];
  disputes: Dispute[];
}

let db: Database | null = null;
let secret: string | null = null;

export function dbPath(): string {
  return dbFile;
}

export function loadDb(): Database {
  if (db) return db;
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    const seeded = buildSeed();
    writeDb(seeded);
    db = seeded;
    return db;
  }
  const parsed = JSON.parse(fs.readFileSync(dbFile, "utf8")) as Database;
  if (!parsed.sellers || !parsed.bookings || !parsed.listings) {
    const extra = seedMarketplace();
    const migrated: Database = {
      ...parsed,
      sellers: parsed.sellers ?? extra.sellers,
      payouts: parsed.payouts ?? extra.payouts,
      listings: parsed.listings ?? extra.listings,
      bookings: parsed.bookings ?? extra.bookings,
      blackouts: parsed.blackouts ?? extra.blackouts,
      disputes: parsed.disputes ?? extra.disputes,
    };
    writeDb(migrated);
    db = migrated;
    return db;
  }
  db = parsed;
  return db;
}

export function writeDb(next: Database): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${dbFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, dbFile);
  db = next;
}

export function saveDb(): void {
  if (db) writeDb(db);
}

export function getDb(): Database {
  return loadDb();
}

export function mutate<T>(fn: (database: Database) => T): T {
  const database = loadDb();
  const result = fn(database);
  writeDb(database);
  return result;
}

export function getSessionSecret(): string {
  if (secret) return secret;
  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(secretFile)) {
    secret = fs.readFileSync(secretFile, "utf8").trim();
    return secret;
  }
  secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

export function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
