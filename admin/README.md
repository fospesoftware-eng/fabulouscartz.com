# Fabulous Cartz — Operations Console

A standalone admin back office for Fabulous Cartz: commerce operations plus marketplace sellers and peer-to-peer rental operations. It lives entirely inside `admin/` and never touches the storefront app at `src/`, `public/`, `index.html` or port 5173.

## Run

```bash
# from admin/
npm run setup        # installs admin + admin/server dependencies
npm run server       # API on http://localhost:4000
npm run dev          # console on http://localhost:5174  (/api proxied to 4000)
```

The JSON store is created on first boot at `admin/server/data/db.json`. Re-seed at any time with `npm run seed`.

### Seeded credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@fabulouscartz.com` | `Admin#2026` |
| Manager | `manager@fabulouscartz.com` | `Manager#2026` |
| Fulfilment | `fulfilment@fabulouscartz.com` | `Fulfil#2026` |

## What's inside

| Area | Screens |
| --- | --- |
| Commerce | Dashboard, Orders, Products, Inventory, Customers, Categories, Vendors, Content, Discounts, Analytics, Settings, Audit |
| Marketplace | Sellers pipeline + seller workspace, Payouts, Rental listings moderation |
| Rentals | Bookings board + booking workspace, Calendar, Deposits, Overdue, Disputes |

Shared help: ⌘K command palette, toasts, skeletons, empty/error states, notifications, signed-cookie auth, audit log.

## Architecture

```
admin/
  src/            React 19 + TypeScript + Vite console
    components/   Shell, UsOrderMap, RentalPulse, overlays, ui primitives
    context/      Theme, Auth, UI (toasts/command/notifications)
    lib/          api.ts, marketplace.ts adapter, hooks, utils
    pages/        one page per screen
    styles/       tokens, base, shell, components, surface, pages, marketplace, map
  shared/         types shared by console and server (commerce + marketplace)
  server/         Express + zod API, JSON file store, seed data
  public/         logo (byte-identical deployed artwork), self-hosted woff2 fonts
  scripts/        test-api.mjs contract suite, shoot.mjs
  screenshots/    verification captures
```

The API persists to a JSON file through an atomic tmp-file + rename write. Authentication is an HMAC-signed `fc_admin_session` cookie; passwords are scrypt-hashed. Role middleware gates money actions server-side, and the UI mirrors those gates with disabled controls plus an explicit reason.

## Marketplace / rental API adapter

All marketplace and rental calls go through `src/lib/marketplace.ts`, a shallow typed adapter over the documented contract:

- sellers: list / workspace / review / commission / suspend
- payouts: period list / seller history / mark-paid
- rental listings: list / moderate
- bookings: list / detail / transition (`allowedTransitions` drives the action bar)
- calendar: bookings + blackouts
- deposits: list / capture / release
- overdue, disputes + resolve, rental analytics

The base URL defaults to `/api/admin` and is switched with one env var:

```bash
VITE_MARKETPLACE_BASE=https://api.example.com/admin npm run dev
```

Fixtures come from the seeded API (`server/src/seed/marketplace.ts`: 12 sellers, 16 listings, 30 bookings across 11 states, 20 payouts, blackouts, disputes). When an endpoint is not yet live, the screens still render from that same typed shape, so the adapter is the only integration seam.

### Booking state machine

`requested → approved → deposit_authorized → dispatched → in_use → return_due → returned → inspection → completed`, with `overdue` and `disputed` side-states. The server validates every transition against `ALLOWED_TRANSITIONS` in `shared/marketplace.ts` and rejects invalid moves with `409`; the workspace only renders the transitions returned in `allowedTransitions`.

### Role gating

Fulfilment can operate rentals and bookings, but payout mark-paid, seller commission and deposit capture/release are visibly disabled with a reason. Admin and Manager have full money actions.

## Type and icon system

- **UI workhorse:** Inter, self-hosted variable woff2 (`public/fonts/inter-var-latin.woff2`), weights 400/500/600/700.
- **Hero accent:** Fraunces (`public/fonts/fraunces-var-latin.woff2`), only for the lead dashboard figure.
- **Brand accent:** Playfair Display italic 500 (`public/fonts/playfair-italic-500-latin.woff2`), used only for the header wordmark to match the deployed storefront exactly.
- **Scale:** documented in `src/styles/tokens.css` (`--type-2xs` 10px → `--type-3xl` 34px) with `--leading-tight` 1.12, `--leading-snug` 1.3, `--leading-normal` 1.55. No ad-hoc sizes for UI text.
- **Numerals:** tabular everywhere money or counts appear.
- **Icons:** Lucide only, one stroke weight (`1.6` at 24px), sizes 16 / 20 / 24, consistent icon-button containers. No emoji, no mixed filled/outline sets.

## Logo fidelity

The console header replicates the deployed storefront lockup from `https://fabulous.fospe.com/`: the inline 24×24 five-petal gold mark plus “Fabulous” in Playfair Display italic 500. The favicon is the deployed `/logo/brand-mark.svg`, copied byte-for-byte into `admin/public/logo/`.

```
1fac8194a1555f9597ff70a75ba341f4e350a15154889bd62c86fa127ef4cb3f  brand-mark.svg
95a19f709292c3bbc37dcfd58790b5637ed2f2a991bded86545034e9eb5a5037  brand-wordmark.svg
```

Both are identical to the local `public/logo/` originals and to the deployed files. Only permissible addition: a soft outer glow in dark theme — artwork untouched.

## Surface system

One primitive (`.card` in `surface.css`) inherited by every panel, tile, drawer, table and calendar shell:

1. ambient shadow (large, soft, low opacity)
2. contact shadow (tight, darker)
3. 1px top inner highlight
4. gradient fill (cream→ivory in light, emerald→ink in dark) + diagonal sheen + low-opacity grain
5. hairline gold border bright top-left, fading bottom-right
6. optional accent inset ring at 10–15%
7. a living top-right detail (sparkline, delta chip, radial ring or ribbon)

KPI tiles lift 2–4px on hover with a single sheen sweep and ≤3° pointer tilt. Reduced motion disables tilt, sweeps and transitions.

## Tests and screenshots

```bash
npm run build     # tsc --noEmit + vite build
npm test          # contract + role-gate suite against the live API
node scripts/shoot.mjs
```

`npm test` covers seller facets/review rules, payout summaries, listing moderation, all 11 booking states and their `allowedTransitions`, calendar payloads, deposit age/expiry, overdue fees, dispute outcomes, analytics keys, and fulfilment 403s on money actions.

Verification captures live in `screenshots/` (dashboard light/dark, map hover/selected, seller pipeline + profile, bookings board + workspace, calendar month/week, deposits + ledger, overdue, disputes, listings, payouts, mobile 390, corporate logo 1×/2×).
