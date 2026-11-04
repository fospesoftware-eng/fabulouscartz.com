# Fabulous Cartz API (`/backend`)

Production-shaped backend for the Fabulous Cartz commerce platform: the storefront catalogue, cart and checkout flow, a multi-vendor marketplace (sellers, KYC, commission and payouts), peer-to-peer rentals (bookings, deposits, overdue handling and disputes), and the admin back office.

- **Node 20+**, TypeScript (strict), **Fastify 5**, **Prisma 6**, **zod**
- **SQLite** for local development; the schema and queries are written to move to **Postgres** with a provider swap and a fresh migration
- JWT access tokens + rotating refresh tokens, bcrypt password hashing, DB-backed session revocation
- Money is stored in **integer minor units** (USD cents in the seed) with decimal helpers in the serializers
- OpenAPI 3 generated from the live route table, Swagger UI at **`/docs`**

---

## Quick start

```bash
cd backend
npm install

cp .env.example .env        # defaults are ready for local dev

npx prisma migrate deploy   # or: npm run migrate
npm run seed                # catalogue + orders + 10 sellers + payouts + P2P rentals
npm run dev                 # http://127.0.0.1:4000  (Swagger: /docs)

# One-URL back office: builds ../admin, copies it into public/backoffice and serves it
npm run build:backoffice    # admin build only (API server unchanged)
npm run start:backoffice    # build admin + backend, then serve console + API on :4000
```

Admin console development (hot reload) stays a separate process:

```bash
cd ../admin && npm run dev  # http://localhost:5174/backoffice/ (proxies /backoffice/api to :4000)
```

Production-style check:

```bash
npm run build               # tsc, clean
npm start                   # runs dist/server.js (run build first)
npm test                    # resets/seeds test.db, then runs vitest
```

Health and readiness:

```bash
curl -s localhost:4000/health
curl -s localhost:4000/ready     # verifies DB connectivity with SELECT 1
```

> Port note: the API defaults to **4000** (`PORT` in `.env`). If another process already holds port 4000 on your machine, start with `PORT=4010 npm run dev` — nothing else needs to change.
>
> The API binds `HOST=127.0.0.1` by default. Set `HOST=0.0.0.0` to expose it on the LAN/in a container.

### Example requests

```bash
# Staff login (username is the documented path; email is a legacy fallback)
curl -s -X POST localhost:4000/backoffice/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"Admin#2026"}'

# Storefront catalogue
curl -s 'localhost:4000/api/v1/products?category=handmade-jewelry&sort=price_asc&pageSize=5'

# Guest cart → checkout (mock payment)
CT=$(curl -s -X POST localhost:4000/api/v1/cart | jq -r .data.cartToken)
curl -s -X POST localhost:4000/api/v1/cart/items -H "x-cart-token: $CT" \
  -H 'content-type: application/json' -d '{"variantId":"var_001_1","mode":"buy","quantity":1}'
curl -s -X POST localhost:4000/api/v1/cart/coupon -H "x-cart-token: $CT" \
  -H 'content-type: application/json' -d '{"code":"FESTIVE20"}'
curl -s -X POST localhost:4000/api/v1/checkout -H "x-cart-token: $CT" \
  -H 'content-type: application/json' -d '{
    "email":"buyer@example.com",
    "shippingAddress":{"recipient":"Buyer","line1":"12 Marine Drive","city":"Kochi","state":"Kerala","postalCode":"682001","country":"IN","phone":"+91 9000000000"},
    "paymentMethod":"mock"}'
# then POST /api/v1/payments/<paymentId>/confirm
```

---

## Back-office console (one URL)

The admin console and the API share one origin and one process. `/api/v1` stays
untouched for existing clients; the same routes are also mounted under
`/backoffice/api/v1`.

| URL | What it is |
| --- | --- |
| `http://127.0.0.1:4000/backoffice` | 302 → `/backoffice/` |
| `http://127.0.0.1:4000/backoffice/` | Console (SPA) |
| `http://127.0.0.1:4000/backoffice/rentals/bookings` | Deep link — served by the SPA fallback, never 404 |
| `http://127.0.0.1:4000/backoffice/api/v1/...` | API alias of `/api/v1/...` |
| `http://127.0.0.1:4000/api/v1/...` | Historical API (backwards compatible) |
| `http://127.0.0.1:4000/docs` | Swagger UI |
| `http://127.0.0.1:4000/health` | Liveness |

`ADMIN_CONSOLE_DIR` (default `./public/backoffice`) points at the copied console
build. If it is absent, `/backoffice` returns `503 CONSOLE_NOT_BUILT` instead of
404 so health checks can distinguish “API only” from “broken”.

- Console build: `cd ../admin && npm run build` — Vite `base: "/backoffice/"`, router `basename: "/backoffice"`.
- Copy + serve: `npm run build:backoffice` (builds `../admin`, copies `dist` into `public/backoffice`).
- Combined start: `npm run start:backoffice` (admin build → backend `tsc` → `node dist/server.js`).
- API base in the console: `VITE_API_BASE` (default `/backoffice/api/v1`); marketplace screens use `VITE_MARKETPLACE_BASE` (default `${VITE_API_BASE}/admin`).
- The alias is a request-URL rewrite (`/backoffice/api` → `/api`), not a second
  route registration. `/backoffice/api/v1/...` therefore runs the exact same
  handlers as `/api/v1/...`, and the generated OpenAPI stays canonical with 138
  paths relative to the `/api/v1` server (no duplicated `/backoffice` tree).
- Console deep links also accept the `rentals/` namespace
  (`/backoffice/rentals/bookings`, `/backoffice/rentals/listings`, …), which map
  to the same screens as `/backoffice/bookings`, `/backoffice/listings`, ….

---

## Seeded credentials

`npm run seed` is deterministic (fixed clock `2026-11-03T10:20:00+05:30`), so order dates, ratings and stock are stable across restarts.

Login accepts `username` (documented) or `email` (legacy).

| Role | Username | Email | Password |
| --- | --- | --- | --- |
| Admin | `admin` | `admin@fabulouscartz.com` | `Admin#2026` |
| Manager | `manager` | `manager@fabulouscartz.com` | `Manager#2026` |
| Fulfilment | `fulfilment` | `fulfilment@fabulouscartz.com` | `Fulfil#2026` |
| Customer (30) | `ananya.raghavan`, `diya.menon`, `meera.pillai`, … (email local-part) | `ananya.raghavan@example.com`, … | `Customer#2026` |
| Seller owner (10) | seller slug, e.g. `viya-crafts`, `omana-atelier`, `mercy-george-tailoring` | `seller1@fabulouscartz.com` … `seller10@fabulouscartz.com` | `Customer#2026` |

Usernames are lowercase, 3–32 characters of letters/digits/dot/underscore/dash and
case-insensitive at login. The `20261103133000_username_auth` migration backfills
existing rows deterministically from the email local-part and appends `_2`, `_3`,
… on collisions.

### Login contract

```http
POST /backoffice/api/v1/auth/login     (alias: /api/v1/auth/login)
{ "username": "admin", "password": "Admin#2026" }
```

- `username` is case-insensitive and trimmed. `email` remains supported as a
  fallback (`{ "email": "admin@fabulouscartz.com", "password": "..." }`).
- Success returns the same access/refresh token pair and the principal
  (`id`, `username`, `email`, `role`, `firstName`/`lastName`, `title`). The
  password hash is never serialized.
- Failures are deliberately indistinguishable: unknown username, wrong password
  and email-not-found all return `401` with `"Invalid username or password"`.
- Disabled accounts return `403` only after a correct password.

**Lockout** (in-memory, per process): 5 failed attempts for the same
`username+IP` inside 15 minutes lock that pair for 15 minutes. While locked the
endpoint returns `429 TOO_MANY_ATTEMPTS` with `details.retryAfterSeconds`. A
successful login clears the counter. Counters reset when the process restarts;
move them to Redis for a multi-instance deployment.

### Password policy

Enforced by zod on registration, staff creation, password change and admin reset:

- 10–128 characters
- at least one letter, one number and one symbol
- no character repeated four or more times in a row
- a small blocklist of predictable passwords (`password123`, `qwertyuiop`, …)

Validation errors list the specific rule that failed; login errors stay generic.

Coupons: `FESTIVE20` (20% off, min $40), `WELCOME10` (10%, min $25), `DANCE15` (15%, dance costumes only), `BRIDAL25`, `FREESHIP`, `JEWEL12`, `DIWALI18` (expired), `KIDS10` (kids wear only).

Seed volume: 6 categories, 11 vendors, **10 marketplace sellers** (6 KYC-approved, 2 pending, 1 rejected, 1 suspended) with 28 KYC documents and 3 onboarding requests, 21 products (19 active, 1 draft, 1 archived) / 51 SKUs — every product is attributed to a seller — 60 orders, 356 reviews, 8 coupons, 3 banners, 3 posts, 18 wishlist rows, 5 low-stock SKUs, **60 payouts** backed by **140 seller ledger entries** (6 monthly periods per seller, mixing paid/pending/failed plus unpaid balances for previews), **25 P2P rental listings** (active, pending-review, draft and suspended), **40 bookings** across 13 statuses (in_use, overdue, returned-pending-inspection, completed and disputed all represented) with US state distribution and 229 booking events, **40 rental deposits**, **49 deposit ledger entries**, **6 inspection reports** and **3 disputes** (open plus one resolved). Rental cities/states are spread across the US (CA, NY, TX, FL, WA, IL, GA, AZ, CO, MA, NJ, NC, MI, OH, PA, OR, TN, VA, UT, MN) so the console map renders.

Order addresses are deliberately mixed: **40 of 60 orders ship to weighted US destinations** (CA, NY and TX lead, plus FL, WA, IL, GA, AZ, CO, MA, NJ, PA, OH and NC) and the remaining **20 stay non-US (IN)**. Rental states such as **MI, OR, TN, VA, UT and MN** have rentals but no orders, so the order and booking layers are visibly different in the geo endpoint.

Seed counts drift slightly as you exercise the API.

---

## Architecture

```
backend/
├── prisma/
│   ├── schema.prisma            # 46 models, string “enums”, integer money
│   ├── migrations/              # init + marketplace_p2p_rentals + username_auth
│   └── seed.ts                  # deterministic catalogue, sellers, payouts, rentals
├── deploy/                     # nginx.conf + Caddyfile for /backoffice
├── scripts/copy-admin-dist.mjs  # admin dist → public/backoffice
├── public/backoffice/          # built console served at /backoffice/
├── src/
│   ├── server.ts                # process entry, graceful shutdown
│   ├── app.ts                   # plugins, hooks, error envelope, route tree
│   ├── config.ts                # zod-validated env
│   ├── db.ts                    # single PrismaClient
│   ├── lib/                     # auth, guards, errors, validate, pagination,
│   │                            # money, slug, serialize, audit, constants
│   ├── services/                # typed domain layer (no HTTP concerns)
│   │   ├── cart.ts  orders.ts  coupons.ts  pricing.ts  inventory.ts
│   │   ├── payments.ts  payments/providers.ts
│   │   ├── sellers.ts  rentals.ts
│   │   ├── analytics.ts  notifications.ts  settings.ts
│   └── routes/                  # thin HTTP layer: validate → service → reply
│       ├── auth.ts  catalog.ts  cart.ts  checkout.ts  engagement.ts
│       ├── sellers.ts  rentals.ts
│       └── admin/ catalog.ts  operations.ts  system.ts
│                  sellers.ts  payouts.ts  rentals.ts
├── tests/                       # vitest + fastify inject integration tests
├── uploads/                     # local media storage (served at /uploads/)
└── vitest.config.ts
```

Layering: routes never touch Prisma directly for domain work; services own transactions and business rules. Admin mutations and auth events call `recordAudit`, storing actor, action, entity, before/after JSON and the request id.

### Conventions

- **Pagination**: `{ data, meta: { page, pageSize, total, totalPages } }`
- **Errors**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "email", "code": "invalid_string", "message": "Invalid email" }],
    "requestId": "…"
  }
}
```

- **Request ids**: `x-request-id` accepted, generated when absent, echoed on every response.
- **Caching**: `@fastify/etag` on public GETs (`etag` + `If-None-Match` → 304).
- **CORS**: `http://localhost:5173` (storefront) and `http://localhost:5174` (admin), credentials enabled, `x-request-id` / `x-cart-token` exposed.
- **Guest carts** use an `x-cart-token` header; customers use a bearer token and their cart is resolved automatically. `POST /cart/merge` folds a guest cart into the signed-in cart.

### Auth & RBAC

| Capability | Admin | Manager | Fulfilment | Customer |
| --- | --- | --- | --- | --- |
| Catalogue/category/vendor CRUD | ✅ | ✅ | read only | ❌ |
| Inventory adjustments, thresholds | ✅ | ✅ | ✅ | ❌ |
| Orders: list/detail, status transitions | ✅ | ✅ | ✅ (status confirm/ship/deliver only) | ❌ |
| Order refunds | ✅ | ✅ | ❌ | ❌ |
| Customers, coupons, content, banners | ✅ | ✅ | read only | ❌ |
| Review moderation | ✅ | ✅ | read only | ❌ |
| Analytics & CSV | ✅ | ✅ | low stock only | ❌ |
| Settings, tax/shipping rules | ✅ | ✅ | ❌ | ❌ |
| Seller onboarding/KYC review, commission overrides | ✅ | ✅ | ❌ | ❌ |
| Seller payouts / commission ledger | ✅ | ✅ | ❌ (money) | ❌ |
| Rental listing moderation | ✅ | ✅ | read only | ❌ |
| Rental bookings, calendar, inspection | ✅ | ✅ | ✅ (dispatch/inspection states) | own bookings |
| Rental deposits, disputes, overdue sweep, rental analytics | ✅ | ✅ | ❌ (money) | ❌ |
| Team users, password resets | ✅ (writes) | read only | read only | ❌ |
| Storefront routes | public / customer | | | |

Access tokens are short-lived (`ACCESS_TOKEN_TTL`, default 15m) and carry a session id. The guards re-check that session in the database on every request, so logout, password change and admin revocation take effect immediately. Refresh tokens rotate on every use; replaying an old one revokes the session.

---

## Data model

46 Prisma models, normalised (no JSON blobs used as the primary store):

- **Identity**: `User` (unique lowercase `username` + email, roles, `isActive`, phone, title), `RefreshSession` (hashed token, rotation chain, revoke reason), `Address`
- **Catalogue**: `Category` (parent/child, `sortOrder`, `isVisible`), `Vendor`, `Product` (slug, status, buy/rent flags, rent daily/weekly/deposit, MRP), `ProductImage`, `ProductTag`, `ProductAttribute`, `ProductVariant` (unique SKU, per-SKU price, stock, reserved, threshold, rent window)
- **Inventory**: `StockAdjustment` (immutable ledger: delta, reason, before/after, actor), `StockReservation` (order, variant, quantity, status, rental window)
- **Commerce**: `Cart`, `CartItem` (buy/rent mode, rental dates), `Order`, `OrderItem` (price **snapshot**), `Payment`, `Refund`, `WebhookEvent` (unique `provider + eventId`), `OrderStatusEvent` (timeline), `Address` (shipping snapshot)
- **Discounts**: `Coupon` (percent/flat, min spend, windows, total + per-customer caps, category scope, stackable/free-shipping flags), `CouponRedemption`
- **Engagement**: `Review` (one per customer/product, moderation status), `WishlistItem`
- **Content/ops**: `Banner`, `ContentPost` (draft → published), `Notification` (outbox), `MediaAsset`, `AuditLog`, `AppSetting`, `TaxRule`, `ShippingRule`
- **Marketplace**: `Seller` (owner user, storefront identity, KYC state, per-seller commission override, masked payout account, rating/status) — **distinct from `Vendor`**, optional `vendorId` link for legacy attribution — `SellerKycDocument`, `SellerOnboardingRequest`, `SellerLedgerEntry` (per order-line sale/refund/commission rows), `Payout` (period gross/commission/refunds/net, `pending → processing → paid → failed`). `Product.sellerId` is backfilled by the seed for every catalogue row.
- **P2P rentals**: `RentalListing` (owner user or seller, optional product reference, condition grade, replacement value, daily/weekly/monthly rates, deposit, handover mode, US city/state, availability bounds, status), `RentalBlackout`, `Booking` (money snapshot, state machine, overdue accrual, US state), `BookingEvent` (transition timeline), `BookingNote` (thread notes), `RentalDeposit` (pre-auth hold), `DepositLedgerEntry` (`authorize|capture|release|expire`, unique idempotency keys), `InspectionReport`, `Dispute` (resolution + admin decision).

Money is `Int` minor units everywhere (`priceMinor`, `subtotalMinor`, `totalMinor`). Serializers expose `priceMinor` alongside a decimal `price` object for the UI.

---

## Order lifecycle and inventory

```
pending ──paid──► paid ──► confirmed ──► shipped ──► delivered ──► refunded
   │                 │          │            │            │
   └──cancelled◄─────┴──────────┴────────────┴────────────┘   (refunded allowed from paid onward)
```

Allowed transitions are declared once in [`src/lib/constants.ts`](src/lib/constants.ts) and enforced in [`src/services/orders.ts`](src/services/orders.ts):

| From | To |
| --- | --- |
| `pending` | `paid`, `cancelled` |
| `paid` | `confirmed`, `refunded` |
| `confirmed` | `shipped`, `refunded` |
| `shipped` | `delivered`, `refunded` |
| `delivered` | `refunded` |
| `cancelled`, `refunded` | — (terminal) |

Illegal transitions return **409** with `{"error":{"code":"INVALID_TRANSITION", …}}`. `POST /orders/:id/status` also returns `allowedTransitions` so the admin UI can render only valid buttons.

Inventory semantics:

1. **Checkout** validates availability and creates `StockReservation` rows inside the same transaction as the order (stock itself is not decremented yet).
2. **Payment success** (mock confirm or signed webhook) commits: reserved units are decremented from `stockQuantity` and the reservation is marked committed — idempotently.
3. **Cancellation** releases reservations without touching stock.
4. **Refund** restocks committed units through a `StockAdjustment` row (reason `return`/`cancellation`), preserving the ledger.
5. Rentals check the requested window against overlapping reservations and cloned units; rental deposits are snapshotted on the order item.

---

## Payments

`src/services/payments/providers.ts` defines a `PaymentProvider` interface:

```ts
interface PaymentProvider {
  name: string;
  createIntent(input): Promise<PaymentIntentResult>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  refund(payment, amountMinor, reason?): Promise<{ providerRefundId: string; status: string }>;
}
```

- **`mock`** — fully working: instant intents, `POST /api/v1/payments/:paymentId/confirm` settles the order, HMAC-SHA256 webhooks.
- **`razorpay`, `phonepe`, `upi`, `card`** — adapters are wired into the same interface but throw **503 `PROVIDER_NOT_CONFIGURED`** until credentials are supplied. This is deliberate: no live charge can happen by accident.

Webhooks: `POST /api/v1/webhooks/payments/:provider` reads the **raw** body (captured by a custom JSON content-type parser), verifies `x-webhook-signature` (HMAC-SHA256 for mock; Razorpay/PhonePe adapters use their own header conventions once secrets are set), and records the event in `WebhookEvent` with a unique `(provider, eventId)`. Duplicate deliveries return `{ "received": true, "duplicate": true }` and are not reprocessed. Successful payments settle the order exactly once; failed payments set `paymentStatus = failed` and leave the order `pending`.

### Plugging a real provider

1. Add a class implementing `PaymentProvider` (or fill in the existing stub) in `providers.ts` and register it in `getProvider`.
2. Add credentials to `.env` / `.env.example` and read them via `config.ts`.
3. Implement `verifyWebhook` with the provider's canonical signature scheme (Razorpay: `X-Razorpay-Signature` over the raw body with the webhook secret).
4. Map provider events (`payment.captured`, `payment.failed`, `refund.processed`) onto `processWebhook`'s internal types.
5. Enable the method in **Settings → Payments** (`PATCH /api/v1/admin/settings/payments`) so checkout accepts it.
6. Add the provider's public key to the returned `clientPayload` for the storefront SDK.

---

## Multi-vendor marketplace

`Seller` is the marketplace identity — it is deliberately **not** the catalogue `Vendor`. A seller has an owner `User`, a unique store slug, contact/address, KYC state (`pending | approved | rejected | suspended`) with `SellerKycDocument` metadata, a commission rate that overrides the platform default (`marketplace.defaultCommissionBps`, seeded at **1200 bps / 12%**), a masked payout account + verification state, rating, join date and status (`pending | active | suspended | rejected`).

- **Listings**: `Product.sellerId` is populated for every seeded catalogue row by mapping `vendorId → seller`. New admin products inherit the seller mapped to their vendor unless an explicit `sellerId` is supplied. Creating any new product (or activating an existing one) for a suspended/rejected seller returns **409**.
- **Onboarding**: `POST /sellers/onboarding` accepts a public application; admins review via `GET /admin/sellers/onboarding/requests` and `POST /admin/sellers/onboarding/requests/:id/review` (`approve | reject | request_info`). Approval creates/reuses the owner customer account and an active seller.
- **Commission ledger**: when an order becomes `paid`, one `SellerLedgerEntry(kind="sale")` is written per order line with `gross = lineTotal − deposit`, `commission = round(gross × sellerBps / 10000)`, `net = gross − commission`. Full refunds write reversing `kind="refund"` entries. The ledger is idempotent on `(orderItemId, kind)`.
- **Payouts**: `GET /admin/sellers/:id/payout-preview` aggregates unattached pending ledger rows. `POST /admin/payouts` snapshots that period into a `Payout` (`grossMinor`, `commissionMinor`, `refundsMinor`, `netMinor`) and attaches the ledger rows. Status lifecycle: `pending → processing → paid → failed`; `POST /admin/payouts/:id/mark-paid` requires a `reference` and records the audit trail.
- **Analytics**: `GET /admin/analytics/sellers` returns GMV, commission, refunds, net, order counts, rating and outstanding payout liability per seller; `/top` and `/payout-due` are convenience views.

## Peer-to-peer rentals

A `RentalListing` can be owned by a customer **or** a seller (with an optional `productRef`), carries condition grade, replacement value, daily/weekly/monthly rates, security deposit, handover mode (`ship | pickup | both`) with pickup location, availability bounds, blackouts, late fee per day and status (`draft | pending_review | active | paused | suspended`).

```
requested → approved → deposit_authorized → dispatched (or handed over) → in_use → return_due
         → returned → inspection → completed
side paths: declined, cancelled_by_renter, cancelled_by_owner, overdue, disputed
```

| From | Allowed to |
| --- | --- |
| `requested` | `approved`, `declined`, `cancelled_by_renter` |
| `approved` | `deposit_authorized`, `cancelled_by_renter`, `cancelled_by_owner` |
| `deposit_authorized` | `dispatched`, `in_use`, `cancelled_by_owner` |
| `dispatched` | `in_use`, `overdue` |
| `in_use` | `return_due`, `overdue`, `returned` |
| `return_due` | `returned`, `overdue` |
| `overdue` | `returned` |
| `returned` | `inspection` |
| `inspection` | `completed`, `disputed` |
| `disputed` | `completed` |
| `declined`, `cancelled_by_*`, `completed` | — terminal |

Transitions are declared once in [`src/lib/constants.ts`](src/lib/constants.ts) and enforced server-side in [`src/services/rentals.ts`](src/services/rentals.ts). Illegal transitions return **409** with `{ allowed: [...] }`; booking responses include `allowedTransitions`. **Fulfilment** may move only operational targets (`dispatched`, `in_use`, `return_due`, `returned`, `inspection`, `overdue`); money-bearing targets (`approved`, `deposit_authorized`, `completed`, `disputed`, cancellations) are **403** for Fulfilment.

- **Availability is atomic.** Booking creation runs under a per-listing in-process lock and a transaction that re-checks blocking bookings and blackouts; overlapping dates return **409**. Blocking statuses are all non-terminal states. The calendar endpoints (`GET /rentals/:id/calendar`, `GET /admin/rentals/calendar`) return bookings + blackouts for a window.
- **Never touches stock.** P2P rentals reserve calendar dates, not inventory; no `ProductVariant.stockQuantity` is changed.
- **Pricing.** Complete 30-day blocks bill at the monthly rate, complete 7-day blocks at the weekly rate, and remaining days at the daily rate (fallbacks are 30× / 7× daily). `rentalFee = quote`, `platformFee = 10%` (`marketplace.rentalPlatformFeeBps`), `ownerPayout = rentalFee − platformFee`, deposit is snapshotted separately.
- **Deposits.** `RentalDeposit` starts `pending`, becomes `authorized` on the `deposit_authorized` transition (ledger `authorize` row), may be **partially captured** with a reason (`damage_claim`, `late_fee_*`), then `released` or `expired`. Capture can never exceed the authorized amount (**409**); release is idempotent via ledger idempotency keys and repeated calls return the same state. Completing a booking releases the remaining hold.
- **Overdue.** `POST /admin/rentals/overdue/sweep` flags bookings past `endDate + graceDays` (default 2), transitions them to `overdue`, accrues `overdueDays × lateFeePerDayMinor` and logs an event. `GET /admin/rentals/overdue` is the admin queue.
- **Inspection & disputes.** Fulfilment can record a return condition report with photo metadata and a damage claim. A `Dispute` captures the claim and admin resolution (`renter_pays | owner_pays | split | refunded`); the decision captures/releases the deposit and completes the booking. `GET /admin/rentals/disputes` lists open cases.
- **Notes.** `GET|POST /rentals/bookings/:id/notes` provides lightweight booking-thread notes (participants or staff only).

Deliberately stubbed: real card pre-authorization/capture (the ledger is authoritative), e-signature, and third-party KYC verification. The state machines and money rules are real; no external provider is called.

---

## Analytics

All figures are computed from real orders (`paid`, `confirmed`, `shipped`, `delivered`) with a `from`/`to` date range (default: last 12 months):

- `GET /admin/analytics/summary` — gross/net revenue, refunds, tax, discounts, orders by status, AOV, unique customers, cart → order conversion
- `GET /admin/analytics/revenue-series?interval=day|week|month`
- `GET /admin/analytics/funnel` — carts created, carts converted, conversion rate
- `GET /admin/analytics/category-mix`, `/top-products`, `/low-stock`
- `GET /admin/analytics/export.csv?dataset=orders|products|low-stock|customers` — streamed CSV with proper headers
- `GET /admin/analytics/sellers`, `/sellers/top`, `/sellers/payout-due` — marketplace GMV, commission, refunds, net, order counts, ratings and payout liability
- `GET /admin/analytics/rentals`, `/rentals/states` — rental GMV, platform fees, owner payouts, deposit ledger, overdue/dispute counts and booking distribution by US state (feeds the console map)
- `GET /admin/analytics/geo` — combined **orders + rentals** per US state for the admin map (admin/manager only)

### Geographic analytics (`GET /admin/analytics/geo`)

Query parameters:

| Param | Values | Default | Notes |
| --- | --- | --- | --- |
| `metric` | `orders` \| `revenue` \| `bookings` | `orders` | Selects the ranking in `meta.ranking` (`revenue` = order + booking revenue); rows always carry both datasets |
| `from` / `to` | ISO date/time | last 12 months | Inclusive; orders filter on `placedAt`, bookings on `createdAt` |
| `include` | `orders`, `bookings`, `orders,bookings` | `orders,bookings` | Limits which datasets are read into rows |

Response `{ data, meta }`:

```json
{
  "data": [
    {
      "stateCode": "CA",
      "stateName": "California",
      "orderCount": 10,
      "orderRevenueMinor": 68808,
      "bookingCount": 2,
      "bookingRevenueMinor": 38500
    }
  ],
  "meta": {
    "metric": "orders",
    "include": ["orders", "bookings"],
    "range": { "from": "2025-11-04T03:09:47.434Z", "to": "2026-11-04T03:09:47.434Z" },
    "totals": {
      "states": 19,
      "orderCount": 40,
      "orderRevenueMinor": 375956,
      "bookingCount": 32,
      "bookingRevenueMinor": 936650
    },
    "ranking": [{ "stateCode": "CA", "stateName": "California", "value": 10 }],
    "excluded": {
      "nonUsOrders": 20,
      "unknownStateOrders": 0,
      "nonUsBookings": 0,
      "unknownStateBookings": 0
    }
  }
}
```

- Only states with data in the selected datasets appear. USPS two-letter codes and full state names are accepted on the address side and normalised; unrecognised states are excluded and counted.
- `meta.ranking` is the top 10 states by the chosen metric, descending, with zero-value states omitted.
- `orderCount` counts US orders in the window; `orderRevenueMinor` sums only `paid | confirmed | shipped | delivered` orders. `bookingCount` counts all bookings; `bookingRevenueMinor` sums realised rental fees (dispatched through completed/disputed).
- **Mixed addresses:** non-US shipping addresses are excluded from rows and reported in `meta.excluded.nonUsOrders`; non-US booking countries in `meta.excluded.nonUsBookings`. Nothing is silently dropped.
- Empty windows return `{ "data": [], "meta": { ... zeros ... } }` — clients should render the "no data for this period" state rather than an error.
- RBAC: Admin and Manager only; Fulfilment and Customer get **403**.

## Notifications

Mutations that need a message write to the `Notification` outbox (`email` / `sms` channel, recipient, template, payload, status). The `mock` driver logs and marks rows `sent`; `dispatchPending()` is exposed at `POST /admin/notifications/dispatch` and is safe to call repeatedly. Swap in SMTP/SMS by implementing the driver in `src/services/notifications.ts`.

## Media

`POST /api/v1/admin/media` accepts `multipart/form-data` (`file` field), validates MIME type (jpeg/png/webp/gif) and size (`MAX_UPLOAD_BYTES`, default 5 MB), writes to `UPLOAD_DIR` under a date-partitioned path, records a `MediaAsset` row and returns the public URL served by `@fastify/static` at `/uploads/*`. Delete removes the row and the file.

---

## Endpoint reference

Base path `/api/v1`. `public` = no token, `customer` = bearer customer, `staff` = Admin/Manager (or as noted), `admin` = Admin only.

### Auth

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/register` | public |
| POST | `/auth/login` | public |
| POST | `/auth/refresh` | public (refresh token in body) |
| POST | `/auth/logout` | authenticated |
| GET | `/auth/me` | authenticated |
| PATCH | `/auth/me` | authenticated |
| POST | `/auth/password` | authenticated |
| GET | `/auth/sessions` | authenticated |
| DELETE | `/auth/sessions/:id` | authenticated |

### Storefront — catalogue & content

| Method | Path | Access |
| --- | --- | --- |
| GET | `/products` | public — `q, category, vendor, mode, minPrice, maxPrice, tags, sort, page, pageSize` |
| GET | `/products/:slug` | public |
| GET | `/products/:slug/availability` | public |
| GET | `/products/:slug/reviews` | public |
| GET | `/search` | public — requires `q` |
| GET | `/categories` | public |
| GET | `/categories/:slug` | public |
| GET | `/vendors` | public |
| GET | `/vendors/:slug` | public |
| GET | `/banners` | public — `placement` |
| GET | `/posts` | public (published only) |
| GET | `/posts/:slug` | public |
| GET | `/settings/store` | public (store profile, payment toggles) |

### Storefront — cart, checkout, payments, engagement

| Method | Path | Access |
| --- | --- | --- |
| POST | `/cart` | public / customer |
| GET | `/cart` | public / customer |
| POST | `/cart/items` | public / customer |
| PATCH | `/cart/items/:itemId` | public / customer |
| DELETE | `/cart/items/:itemId` | public / customer |
| POST | `/cart/coupon` | public / customer |
| DELETE | `/cart/coupon` | public / customer |
| POST | `/cart/merge` | customer |
| POST | `/coupons/validate` | public / customer |
| POST | `/checkout` | public / customer |
| GET | `/orders` | customer |
| GET | `/orders/:orderNumber` | customer or matching `email` |
| GET | `/orders/:orderNumber/status` | customer or matching `email` |
| GET | `/orders/:orderNumber/payments` | customer or matching `email` |
| GET | `/payments/providers` | public |
| POST | `/payments/intents` | customer or matching `email` |
| POST | `/payments/:paymentId/confirm` | public (mock driver only) |
| POST | `/webhooks/payments/:provider` | provider signature |
| GET | `/wishlist` | customer |
| POST | `/wishlist` | customer |
| DELETE | `/wishlist/:productId` | customer |
| POST | `/reviews` | public (guest needs `authorName`) / customer |

### Storefront — marketplace sellers & P2P rentals

| Method | Path | Access |
| --- | --- | --- |
| GET | `/sellers` | public — active/`kycStatus=approved`, `q`, `state`, pagination |
| GET | `/sellers/:slug` | public |
| GET | `/sellers/:slug/products` | public |
| GET | `/sellers/:slug/rentals` | public |
| POST | `/sellers/onboarding` | public (application) |
| GET | `/rentals` | public — `q, category, city, state, condition, handoverMode, minPrice, maxPrice, availableFrom, availableTo, sort` |
| GET | `/rentals/search` | public (alias) |
| GET | `/rentals/:id` | public (active listings only; `id` or slug) |
| GET | `/rentals/:id/calendar?from&to` | public |
| POST | `/rentals/:id/bookings` | customer — reserves the date range atomically |
| GET | `/rentals/bookings` | customer/staff — own renter/owner bookings (`role=renter|owner|any`) |
| GET | `/rentals/bookings/:id` | participant or staff |
| POST | `/rentals/bookings/:id/cancel` | participant |
| POST | `/rentals/bookings/:id/owner-action` | owner/staff — `approve | decline` |
| POST | `/rentals/bookings/:id/return` | participant |
| GET / POST | `/rentals/bookings/:id/notes` | participant or staff |
| POST | `/rentals/bookings/:id/dispute` | participant |

### Admin — catalogue

| Method | Path | Access |
| --- | --- | --- |
| GET | `/admin/products` | staff |
| POST | `/admin/products` | Admin/Manager |
| GET | `/admin/products/:id` | staff |
| PATCH | `/admin/products/:id` | Admin/Manager |
| DELETE | `/admin/products/:id` | Admin/Manager (archives) |
| POST | `/admin/products/:id/variants` | Admin/Manager |
| PATCH | `/admin/variants/:id` | Admin/Manager |
| DELETE | `/admin/variants/:id` | Admin/Manager |
| GET | `/admin/categories` | staff |
| POST | `/admin/categories` | Admin/Manager |
| PATCH | `/admin/categories/:id` | Admin/Manager |
| DELETE | `/admin/categories/:id` | Admin |
| GET | `/admin/vendors` | staff |
| POST | `/admin/vendors` | Admin/Manager |
| PATCH | `/admin/vendors/:id` | Admin/Manager |
| DELETE | `/admin/vendors/:id` | Admin |

### Admin — operations

| Method | Path | Access |
| --- | --- | --- |
| GET | `/admin/orders` | staff |
| GET | `/admin/orders/:id` | staff |
| PATCH | `/admin/orders/:id/status` | staff (state machine) |
| POST | `/admin/orders/:id/refunds` | Admin/Manager |
| GET | `/admin/customers` | staff |
| GET | `/admin/customers/:id` | staff |
| PATCH | `/admin/customers/:id` | Admin/Manager |
| GET | `/admin/inventory` | staff |
| GET | `/admin/inventory/adjustments` | staff |
| POST | `/admin/inventory/adjustments` | staff |
| GET | `/admin/inventory/reservations` | staff |
| PATCH | `/admin/inventory/variants/:id/threshold` | staff |
| GET | `/admin/coupons` | staff |
| POST | `/admin/coupons` | Admin/Manager |
| PATCH | `/admin/coupons/:id` | Admin/Manager |
| DELETE | `/admin/coupons/:id` | Admin/Manager |
| GET | `/admin/coupons/:id/redemptions` | staff |
| GET | `/admin/reviews` | staff |
| PATCH | `/admin/reviews/:id` | Admin/Manager |
| GET | `/admin/banners` | staff |
| POST | `/admin/banners` | Admin/Manager |
| PATCH | `/admin/banners/:id` | Admin/Manager |
| DELETE | `/admin/banners/:id` | Admin/Manager |
| GET | `/admin/posts` | staff |
| POST | `/admin/posts` | Admin/Manager |
| PATCH | `/admin/posts/:id` | Admin/Manager |
| DELETE | `/admin/posts/:id` | Admin/Manager |
| POST | `/admin/posts/:id/publish` | Admin/Manager |

### Admin — analytics, system

| Method | Path | Access |
| --- | --- | --- |
| GET | `/admin/analytics/summary` | Admin/Manager |
| GET | `/admin/analytics/revenue-series` | Admin/Manager |
| GET | `/admin/analytics/funnel` | Admin/Manager |
| GET | `/admin/analytics/category-mix` | Admin/Manager |
| GET | `/admin/analytics/top-products` | Admin/Manager |
| GET | `/admin/analytics/low-stock` | staff |
| GET | `/admin/analytics/geo` | Admin/Manager |
| GET | `/admin/analytics/export.csv` | Admin/Manager |
| GET | `/admin/settings` | Admin/Manager |
| PATCH | `/admin/settings/:section` | Admin/Manager |
| GET | `/admin/users` | staff |
| POST | `/admin/users` | Admin |
| PATCH | `/admin/users/:id` | Admin |
| POST | `/admin/users/:id/reset-password` | Admin |
| GET | `/admin/audit` | Admin/Manager |
| GET | `/admin/notifications` | staff |
| POST | `/admin/notifications/dispatch` | staff |
| GET | `/admin/media` | staff |
| POST | `/admin/media` | Admin/Manager |
| DELETE | `/admin/media/:id` | Admin/Manager |

### Admin — marketplace sellers & payouts

| Method | Path | Access |
| --- | --- | --- |
| GET | `/admin/sellers` | Admin/Manager — `q, status, kycStatus, state` |
| GET | `/admin/sellers/:id` | Admin/Manager — KYC docs, ledger, payouts, payout preview |
| POST | `/admin/sellers` | Admin/Manager |
| PATCH | `/admin/sellers/:id` | Admin/Manager |
| POST | `/admin/sellers/:id/review` | Admin/Manager — `approve | reject | suspend | reinstate` |
| PATCH | `/admin/sellers/:id/commission` | Admin/Manager — bps override (`null` clears) |
| POST | `/admin/sellers/:id/kyc-documents` | Admin/Manager |
| POST | `/admin/sellers/kyc-documents/:documentId/review` | Admin/Manager |
| GET | `/admin/sellers/onboarding/requests` | Admin/Manager |
| POST | `/admin/sellers/onboarding/requests/:id/review` | Admin/Manager |
| GET | `/admin/sellers/:id/payout-preview` | Admin/Manager |
| GET | `/admin/payouts` | Admin/Manager — `sellerId, status, from, to` |
| GET | `/admin/payouts/:id` | Admin/Manager |
| POST | `/admin/payouts` | Admin/Manager — generate from unpaid ledger |
| POST | `/admin/payouts/:id/mark-paid` | Admin/Manager — requires `reference` |
| POST | `/admin/payouts/:id/status` | Admin/Manager — `processing | paid | failed` |
| GET | `/admin/payouts/preview/:sellerId` | Admin/Manager (alias) |
| GET | `/admin/analytics/sellers` | Admin/Manager |
| GET | `/admin/analytics/sellers/top` | Admin/Manager |
| GET | `/admin/analytics/sellers/payout-due` | Admin/Manager |

### Admin — P2P rentals

| Method | Path | Access |
| --- | --- | --- |
| GET | `/admin/rentals/listings` | Admin/Manager — moderation queue |
| GET | `/admin/rentals/listings/:id` | Admin/Manager |
| PATCH | `/admin/rentals/listings/:id` | Admin/Manager — status/price/content moderation |
| GET | `/admin/rentals/listings/:id/calendar?from&to` | staff |
| GET | `/admin/rentals/bookings` | staff — `status, state, listingId, renterUserId, ownerUserId, overdue, from, to` |
| GET | `/admin/rentals/bookings/:id` | staff |
| POST | `/admin/rentals/bookings/:id/transition` | staff — Fulfilment limited to dispatch/inspection states |
| GET | `/admin/rentals/calendar?from&to&state` | staff — platform-wide |
| POST | `/admin/rentals/bookings/:id/inspection` | staff — Fulfilment allowed |
| GET | `/admin/rentals/deposits` | Admin/Manager (money) |
| POST | `/admin/rentals/deposits/:id/capture` | Admin/Manager (money) — partial capture with reason |
| POST | `/admin/rentals/deposits/:id/release` | Admin/Manager (money) — idempotent |
| GET | `/admin/rentals/overdue` | staff |
| POST | `/admin/rentals/overdue/sweep` | Admin/Manager (late-fee money) |
| GET | `/admin/rentals/disputes` | Admin/Manager |
| POST | `/admin/rentals/disputes/:id/resolve` | Admin/Manager — decision + deposit settlement |
| GET | `/admin/analytics/rentals` | Admin/Manager |
| GET | `/admin/analytics/rentals/states` | Admin/Manager |

### Service

| Method | Path |
| --- | --- |
| GET | `/health` (outside `/api/v1`) |
| GET | `/ready` (outside `/api/v1`) |
| GET | `/docs` — Swagger UI |
| GET | `/docs/json` — OpenAPI 3 document |
| GET | `/uploads/*` — static media |

Settings sections accepted by `PATCH /admin/settings/:section`: `store`, `payments`, `shipping`, `tax`, `notifications`, `marketplace` (default commission bps, rental platform fee bps, payout cycle).

---

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `test` disables request logging |
| `PORT` / `HOST` | `4000` / `127.0.0.1` | |
| `DATABASE_URL` | `file:./dev.db` | relative to `prisma/` |
| `JWT_SECRET` / `REFRESH_SECRET` | dev values | **change in production** (`openssl rand -hex 32`) |
| `ACCESS_TOKEN_TTL` | `15m` | |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174` | comma-separated |
| `PUBLIC_BASE_URL` | `http://localhost:4000` | used for absolute media URLs |
| `UPLOAD_DIR` / `MAX_UPLOAD_BYTES` | `./uploads` / `5242880` | |
| `PAYMENT_DEFAULT_PROVIDER` | `mock` | |
| `MOCK_WEBHOOK_SECRET` | `mock-webhook-secret` | HMAC key for mock webhooks |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | empty | enables the Razorpay adapter |
| `PHONEPE_MERCHANT_ID` / `PHONEPE_SALT_KEY` / `PHONEPE_WEBHOOK_SECRET` | empty | enables PhonePe |
| `NOTIFICATION_DRIVER` | `mock` | `mock` logs; SMTP is an adapter stub |

All variables are validated by zod at startup (`src/config.ts`); invalid values fail fast.

---

## Testing

```bash
npm test
```

- `test:db` resets `prisma/test.db` (`db push --force-reset`) and seeds it
- `vitest` sets `NODE_ENV=test` and `DATABASE_URL=file:./test.db` (see `vitest.config.ts`), so the dev database is never touched
- Tests use `app.inject()` — no port, no network

Coverage:

| File | What it proves |
| --- | --- |
| `tests/auth.test.ts` | login, wrong password, register/duplicate/zod errors, refresh rotation + reuse rejection, logout revocation, password change invalidates sessions, anonymous 401 |
| `tests/rbac.test.ts` | unauth 401, customer 403 on admin, fulfilment blocked from catalogue writes but allowed order/inventory reads, manager allowed, revoked-session 401 |
| `tests/catalog.test.ts` | 19 active products listed with pagination meta, category/vendor/mode/price filters, sorting, search validation, banners/posts, draft→active→archived visibility, stock adjustments + ledger, zod error envelope |
| `tests/checkout.test.ts` | guest cart CRUD, coupon validation (valid/unknown/min-spend/category), apply/remove coupon totals, reservation at checkout, decrement on payment, confirm idempotency, illegal transitions 409, cancel releases reservation, provider stub 503, empty-cart 400 |
| `tests/webhook.test.ts` | invalid signature 401, signed success settles once, duplicate eventId is not reprocessed, failed payment does not settle |
| `tests/marketplace.test.ts` | overlapping rental booking rejected 409 (adjacent start allowed), illegal booking transition 409 with `allowedTransitions`, deposit capture above authorized 409, deposit release idempotency (single release ledger row), per-seller commission + payout preview/generate/mark-paid math, Fulfilment 403 on payout money endpoints but allowed dispatch/inspection transitions, suspended seller blocked from publishing new listings, public sellers exclude suspended/rejected |
| `tests/auth-username.test.ts` | username login (no password hash in payload), email fallback and `/backoffice/api/v1` alias, case-insensitive match, identical generic error for wrong password vs unknown user, refresh rotation + reuse rejection, lockout 429 after 5 failures with `retryAfterSeconds`, password-policy rejection (length/number/symbol) on register and admin reset |
| `tests/analytics-geo.test.ts` | per-state rows carry both datasets with totals/exclusions and USPS codes, metric switch changes the ranking, explicit date window is applied and echoed, manager 200 vs fulfilment/customer 403, empty-state shape, `/backoffice/api/v1` alias with `include=bookings` |

Result: **8 files / 52 tests passing** (46 pre-existing + 6 geographic analytics).

---

## Deployment — fabulous.fospe.com

Target shape:

```
https://fabulous.fospe.com/backoffice/            → console
https://fabulous.fospe.com/backoffice/api/v1/...  → API
https://fabulous.fospe.com/                      → storefront (unchanged)
```

The Fastify process serves the console and the API; the storefront stays on its
own upstream at the root.

### Replit single-service deployment

The published Replit deployment runs **one Fastify process** on the port mapped
to 80 (5000 locally) and serves everything from it:

```
/                      built storefront (dist/index.html + /assets + /img)
/backoffice/           admin console (SPA, deep links included)
/backoffice/api/v1/    API alias
/api/v1/               canonical API
/docs, /health, /ready
```

Root scripts (run from the repo root):

```bash
npm run build:deploy   # storefront build → dist, admin build → backend/public/backoffice,
                       # prisma generate, backend tsc
npm run start:deploy   # migrate deploy; seed only when the User table is empty; start Fastify
```

`start:deploy` (`backend/scripts/deploy-start.mjs`) is the deploy entry point.
It fails with a readable log and a non-zero exit when `JWT_SECRET` /
`REFRESH_SECRET` are missing or shorter than 16 characters, or when the
storefront/console bundles were not built.

First boot is self-sufficient: `prisma migrate deploy` creates the SQLite
database (`backend/prisma/deploy.db` by default, gitignored) and the deterministic
seed runs only if there are no users. Later boots skip the seed. Storefront
imagery ships in `dist/img` (Vite copies `public/img`), so the console's `/img`
asset base resolves on the same origin without a second copy.

Replit Secrets to set (Tools → Secrets):

| Secret | Value |
| --- | --- |
| `JWT_SECRET` | strong unique value, ≥16 chars (`openssl rand -hex 32`) |
| `REFRESH_SECRET` | a different strong value, ≥16 chars |
| `PUBLIC_BASE_URL` | `https://fabulous.fospe.com` |
| `CORS_ORIGINS` | optional; defaults to the deployed origin plus localhost dev ports |

Optional overrides: `PORT` (default `5000`), `HOST` (default `0.0.0.0`),
`DATABASE_URL` (default `file:./deploy.db`), `ADMIN_CONSOLE_DIR`
(`./public/backoffice`), `STOREFRONT_DIR` (`../dist`). Do not commit `.env`,
databases, `dist`, `uploads` or `public/backoffice`.

### Environment

| Variable | Value |
| --- | --- |
| `PORT` | `4000` |
| `HOST` | `127.0.0.1` (set `0.0.0.0` only inside a container) |
| `DATABASE_URL` | production Postgres URL (see “SQLite → Postgres”) |
| `ADMIN_CONSOLE_DIR` | `./public/backoffice` (default) |
| `JWT_SECRET` / `REFRESH_SECRET` | strong unique secrets (`openssl rand -hex 32`) |
| `ACCESS_TOKEN_TTL` | e.g. `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | e.g. `30` |
| `PUBLIC_BASE_URL` | `https://fabulous.fospe.com` (used by the OpenAPI servers and media URLs) |
| `CORS_ORIGINS` | `https://fabulous.fospe.com` (the same-origin console needs no CORS; list it for direct API clients) |

Build and start:

```bash
cd backend
npm ci
npm run build:backoffice      # admin build → public/backoffice
npm run build                 # tsc → dist
npx prisma migrate deploy
npm run seed                  # first install only
node dist/server.js           # or: npm run start:backoffice
```

Health check: `GET /health` (liveness) and `GET /ready` (DB `SELECT 1`).
Do not route `/backoffice/api` to a CDN/static handler — it must reach Fastify so
the SPA fallback cannot swallow API 404s.

### systemd unit

```ini
[Unit]
Description=Fabulous Cartz back office + API
After=network.target

[Service]
Type=simple
User=fabulous
WorkingDirectory=/opt/fabulous/backend
EnvironmentFile=/opt/fabulous/backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### pm2

```bash
pm2 start dist/server.js --name fabulous-api --update-env
pm2 save
pm2 startup
```

### Reverse proxy

Samples live in the repo:

- [`deploy/nginx.conf`](deploy/nginx.conf) — TLS, `/backoffice/api/` before `/backoffice`, legacy `/api/`, storefront at `/`.
- [`deploy/Caddyfile`](deploy/Caddyfile) — `handle /backoffice* { reverse_proxy 127.0.0.1:4000 }`, `/api/*`, `/docs*`, health, storefront at `/`.

Both preserve the URI, so the backend receives `/backoffice/api/v1/...` exactly
as requested. `/backoffice` → `/backoffice/` is handled by the backend itself.

---

## SQLite → Postgres

The schema deliberately avoids SQLite-only features: no Prisma `enum` types (string columns + zod), no `Json` columns used as the source of truth, no raw SQL, and all money in `Int`.

1. `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

2. Set `DATABASE_URL=postgresql://user:pass@host:5432/fabulouscartz?schema=public`.
3. Generate a Postgres baseline migration (`npx prisma migrate dev --name postgres_init`) and deploy it. Do **not** replay the SQLite migration folder against Postgres.
4. Optional hardening: convert `status`/`role` text columns to native enums, and add GIN indexes for search (`title`/`description` trigram).
5. For higher write throughput, replace `prisma db push` in `test:db` with a Postgres test database (or Testcontainers).

No application code changes are required; the services only use Prisma's typed API.

---

## Known limitations

- **Payments are sandbox-only.** `mock` is fully functional; Razorpay/PhonePe/UPI/Card adapters verify configuration but do not call live APIs. No 3-D Secure, captures, partial captures or settlement reconciliation.
- **Refunds** create `Refund` rows and mark the payment/order, but money movement for live providers must be implemented in `PaymentProvider.refund`.
- **Search** is a `contains` query (case-insensitive on SQLite) — adequate for 21 products, not for a large catalogue. Postgres should use `pg_trgm` + GIN, or move to Meilisearch/Typesense.
- **Email/SMS** are outbox + mock driver. No template rendering engine or retry/backoff worker is scheduled automatically (dispatch is manual).
- **Carts** never expire automatically (no TTL job); add a scheduled cleanup for production.
- **Analytics** is computed on read. For large order volumes, materialise daily aggregates.
- **Media** is on local disk; production needs S3/GCS and an image pipeline.
- **Rental availability** is enforced by an overlap check inside an interactive transaction plus an in-process per-listing promise-chain lock. This is safe for a single API instance; a horizontally scaled deployment needs a Postgres advisory lock or a `daterange` exclusion constraint (and a rental-calendar index) instead.
- **Deposits are pre-authorization stubs.** `deposit_authorized`, partial capture and release are recorded in the deposit ledger with the reason, but no real card hold/capture is sent to a PSP — wire this into `PaymentProvider` before going live.
- **KYC is self-declared metadata.** `SellerKycDocument` stores document type/number/reference and review state; there is no identity provider (Persona/Onfido/Stripe Identity) call, no OCR or liveness check.
- **Seller agreements are not e-signed.** `SellerOnboardingRequest` records acceptance flags/timestamps only; no DocuSign/e-sign envelope is produced.
- **Payouts do not move money.** `Payout` transitions (`pending → processing → paid → failed`) and the mark-paid reference are bookkeeping; disbursement via Stripe Connect/PayPal/bank rails is out of scope.
- **Rental messaging is booking notes only** (`BookingNote`), not a real-time chat channel; notifications use the mock outbox like the rest of the app.
- **Overdue handling** is a manual `POST /admin/rentals/overdue/sweep` (grace period + per-day late fee + admin flag); schedule it with a worker/cron in production.
- **Rate limiting** is not enabled globally (`@fastify/rate-limit` is the drop-in next step) — required before public launch. Login has its own in-memory username+IP lockout.
- **Console token storage** is `localStorage` (bearer tokens), so XSS on the console origin is the trust boundary; cookies would require CSRF protection. `/backoffice` and `/backoffice/api` share an origin, so no CORS/mixed-content path is involved.
- **Notification drawer** still calls the console's original `/notifications` contract; the backend exposes `/admin/notifications` with a different envelope. Non-blocking 404 in the drawer until the adapter is pointed at `/admin/notifications`.
- **Some console screens still use the bundled mock envelope.** The default dashboard calls `/dashboard` (not implemented by this API; it exposes `/admin/analytics/*`) and some marketplace/rental screens read `admin/server` field names (`number`, `listingTitle`, `state`, …) instead of this API's (`bookingNumber`, `listing.title`, `status`, …). Requests reach the mounted API and return `200`, but those screens render an offline card or empty rows until the adapters are mapped. Auth, navigation, sellers/payouts/listing screens and the URL mount are unaffected.
- **Audit coverage** is complete for admin mutations, auth and payments; high-volume customer cart/wishlist churn is intentionally not written to `AuditLog`.
- **Refresh tokens** are stored hashed but sessions are not bound to device/IP metadata.
- **Test DB** is SQLite and recreated per run; it does not prove Postgres behaviour.
- `tsc` excludes `tests/`, so tests are type-checked by Vitest's transformer, not by `npm run build`.

---

## Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | `tsc -p tsconfig.json` → `dist/` |
| `npm start` | `node dist/server.js` |
| `npm run migrate` | `prisma migrate dev` |
| `npm run seed` | re-seed the configured database (destructive: clears domain tables) |
| `npm run test:db` | reset + seed `test.db` |
| `npm test` | `test:db` + vitest |

`SIGINT`/`SIGTERM` trigger `app.close()`, which stops accepting requests, drains in-flight work and disconnects Prisma.
