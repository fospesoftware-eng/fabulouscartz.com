# Fabulous Cartz — BUILD NOTES

## Stack

| Layer | Tool |
|---|---|
| Build | Vite 8 |
| Framework | React 19 + TypeScript |
| Styling | Tailwind CSS 3 + custom CSS tokens (CSS variables for light/dark) |
| Routing | React Router DOM |
| Scroll | Lenis smooth scroll + GSAP (ScrollTrigger used in Loading) |
| Icons | lucide-react |

All assets are procedural. No large binary image assets. R3F/Three.js was in v1.0, removed in the v1.1 CULT-GAIA polish pass (bundle dropped 67%).

## How to run

```bash
cd /Users/asterantony/caering-mobileapp/fabulouscartz.com
npm install          # already done in this workspace
npm run dev          # local dev server (Vite default: http://localhost:5173)
npm run build        # typecheck + production build
npm run preview      # preview production build
```

## Theme system

- Switches via `.dark` class on `<html>` (persisted in `localStorage` as `fc-theme`)
- Every surface color comes from CSS custom properties defined in `src/index.css` (`:root` light + `html.dark` dark)
- Tailwind provides the static palette; CSS vars drive runtime theme switching
- Logo swaps between `brand-mark-light.svg` and `brand-mark-dark.svg` — so the crest is always visible against its background, never a flat color

## Where things live

| What | Path |
|---|---|
| Logo mark — light theme | `public/logo/brand-mark-light.svg` |
| Logo mark — dark theme | `public/logo/brand-mark-dark.svg` |
| Wordmark | `public/logo/brand-wordmark.svg` |
| Animated loading screen (liquid-gold sheen) | `src/components/LoadingScreen.tsx` |
| Favicon | `public/logo/brand-mark-light.svg` (referenced from `index.html`) |
| Brand sheet (HTML) | [brand-sheet.html](computer:///Users/asterantony/caering-mobileapp/fabulouscartz.com/public/brand-sheet.html) |
| Data (products, categories, vendors) | `src/data/index.ts` |
| Theme tokens | `src/index.css` + `tailwind.config.js` |
| Context providers | `src/context/ThemeContext.tsx`, `src/context/CartContext.tsx` |
| Components | `src/components/Header.tsx`, `Footer.tsx`, `LoadingScreen.tsx`, `CursorGlow.tsx`, `ProductCard.tsx`, `CartDrawer.tsx` |
| Sections (home) | `src/sections/Hero.tsx`, `Featured.tsx`, `Categories.tsx`, `BrandStory.tsx`, `Craft.tsx`, `Testimonials.tsx`, `Editorial.tsx`, `CTA.tsx` |
| Pages | `src/pages/Home.tsx`, `Category.tsx`, `ProductDetail.tsx`, `About.tsx`, `Contact.tsx` |

---

## CULT GAIA reference — what we actually learned

The PDF at `/Users/asterantony/.trae-cn/attachments/…/CULT-GAIA-—-website-redesign-Behance-…pdf` is a 4-page Behance case study (1600×7800px each). Rendered via `pymupdf` to `/tmp/cultgaia_chunks/` for inspection.

**Color system (5 colors, no gradients):**
- `#FFFFFF`, `#E0E0E0`, `#E5DCD7`, `#7E6A61`, `#1B1C1E` — beige, taupe, ink. They used zero gradients, one flat color per section.

**Typography discipline:**
- ONE typeface pair — Playfair Display (display + all caps nav) + Helvetica/Inter (body). They did NOT mix multiple serifs.
- Hero split headline: `CULT — GAIA` giant Playfair DISPLAY ALL CAPS with a very thin horizontal rule between the two words.
- Nav links are ALL CAPS, tracking `0.22–0.3em`, no hovers beyond color shift.

**Header (the key lesson):**
- CULT GAIA's header is **extremely minimal**. Left: `cult gaia` in small serif, no circle mark. Center: nothing. Right: `SHOP LOGIN WISHLIST BAG` — 4 lean text links, no icons.
- NO search icon, NO account icon pill, NO mode pills, NO 3D objects. The header is chrome-free so photography breathes below.

**Hero composition:**
- ONE full-bleed editorial photograph (no collage, no 3D, no pill buttons, no stats, no carousel dots).
- ONE eyebrow link at top-left (`Resort 2021 →`).
- ONE giant headline filling most of the screen.
- ONE very lean CTA (`Add to bag` as a circular pill).
- Restraint. Everything else is pushed below the fold.

**Product grid:**
- Asymmetric layout on some rows (small + wide + small).
- Consistent neutral studio surface behind every card (white/cream/grey, uniform soft top light). NO gradient backgrounds.
- Product objects are studio-lit: single top-left key light, cool rim shadow bottom-right, very low 3% film grain overlay, cast shadow under the piece.

**Section labels:**
- `NEW ARRIVALS ————` (label + thin line extending rightward, ~50% width).
- Tabs are UNDERLINES, not pill buttons.

**CTA styling:**
- Circular pill with a ring border (no heavy filled rounded rectangles).
- Example: `Add to bag` in a circular pill with a ring — no gradient, no shadow.

**Footer:**
- Flat dark charcoal `#1B1C1E` background (no gradient).
- Cream text on dark. 4 editorial columns. No decorative strips, no newsletter hero, no huge logo.
- `© 2026 CULT GAIA — All rights reserved.` on one line.

### What we kept from Fabulous Cartz (not copying CULT GAIA):
- **Our emerald + gold palette** — Fabulous Cartz is colorful Indian ethnic; CULT GAIA is beige luxury. We're a different brand with a different heritage.
- **Our 3D loading screen** — CULT GAIA doesn't have one; ours is a premium differentiator.
- **Dark theme** — CULT GAIA is light-only; we provide both themes per user preference.

### What we changed in response to CULT GAIA (v1 → v1.1):
| Before (v1.0) | After (v1.1) |
|---|---|
| Hero: 3D R3F ornament + 2 floating cards + 2 CTAs + 2 mode pills + stats + vendor marquee | Hero: ONE full-bleed gradient mesh, ONE split headline (`Fabulous / Cartz —`), ONE ring-pill CTA, ONE eyebrow. Everything else below fold. |
| Header: Logo + wordmark + 5 nav items + search + account + theme toggle + cart — 8 items | Header: Logo + wordmark + nav (center) + theme + cart — 3 groups. Search/account moved behind mobile. |
| Product cards: gradient backgrounds + flat SVG "icon" | Product cards: uniform studio-lit surface (same top-left key light across ALL cards), cast shadow, 3% grain, rim shadow, gold ring on hover. |
| Footer: emerald gradient + gold strip + newsletter form + social icons + categories grid | Footer: flat charcoal `#1B1C1E` + cream text + 4 editorial columns, zero decoration. |
| Section tabs: pill buttons | Section tabs: underline-only. Section label pattern changed to `NEW ARRIVALS ————`. |
| Bundle: **1,419 KB** (gzip 405 KB) with R3F | Bundle: **472 KB** (gzip 153 KB) — R3F stripped, 67% reduction. |
| Logo asset: single SVG, dark-mode-only filter `brightness(1.1)` — emerald ring nearly invisible on dark header | Logo assets split into TWO versions. Light: emerald + gold on cream. Dark: white body + mint/gold on charcoal with soft glow halo. |

---

## Bundle sizes (before → after polish)

```
v1.0 (initial build):
dist/assets/index-*.css     29.28 kB │ gzip  7.08 kB
dist/assets/index-*.js   1,419.47 kB │ gzip 405.51 kB   ← R3F pulls THREE.js

v1.1 (CULT GAIA polish):
dist/assets/index-*.css     29.62 kB │ gzip  7.06 kB   (unchanged)
dist/assets/index-*.js     471.96 kB │ gzip 152.51 kB   (67% reduction)
```

1,419 KB → 472 KB main JS chunk. CSS stayed flat (~30 KB). Build time dropped from ~970 ms to ~500 ms.

---

## Mobile art direction

- Header collapses to hamburger; nav drawer full-width on mobile (CULT GAIA-style editorial links, not category grid).
- Hero headline stacks; gradient mesh adapts via `clamp()` on type scale.
- Product grid is 2 cols below 768px, 3 at tablet, 4 at desktop — consistent with CULT GAIA.
- All sections use `clamp()` for typography so display heads scale gracefully.

## Reduced motion

- Lenis stops when `prefers-reduced-motion` is set
- GSAP animations on Loading Screen shortened/clamped
- Global CSS rule at bottom of `index.css` clamps durations to 0.01ms

## Known limitations

- **Product imagery is still procedural SVG**, but now studio-lit with consistent top-left key light, cast shadow, rim shadow, 3% grain overlay, and fabric sheen. If real photography is desired for launch, swap `ProductCard.tsx → StudioLitProduct()` and `ProductDetail.tsx → ProductArtLarge/Small` for `<img>` tags. Curated Unsplash/Pexels imagery can be downloaded to `public/img/` — note we do NOT hotlink at runtime.
- No real checkout flow — cart is localStorage-backed, checkout is a UI button. Wire to Stripe/PayPal to go live.
- No E2E tests or a11y audit — this is v1.1, a polish pass.

## Verify checklist before deploy

- [x] `npm run build` — passes with no TypeScript errors, no Vite warnings (except `__dirname` in vite.config which is suppressed via `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`)
- [ ] Open dev server and toggle light/dark theme on every page (browser MCP sandbox couldn't connect to localhost on this machine — run `npm run dev` locally to verify)
- [ ] Resize viewport across 390 / 768 / 1440 / 1920
- [ ] Cart persistence works (add, refresh, still there)
- [ ] Links go somewhere (internal routes work, external `#` stubs noted)
- [x] Bundle size < 500 KB JS — confirmed 472 KB
