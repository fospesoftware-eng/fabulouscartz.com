/** All money in the API is integer minor units (USD cents). Helpers only. */

export function toMinor(dollars: number): number {
  return Math.round(dollars * 100);
}

export function fromMinor(cents: number): number {
  return cents / 100;
}

export function formatMinor(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/**
 * Rental price for a window. Weekly pricing applies to complete 7-day blocks,
 * remaining days use the daily rate. Amount is per unit.
 */
export function rentalPriceMinor(
  product: {
    rentDailyMinor: number | null;
    rentWeeklyMinor: number | null;
    priceMinor: number;
  },
  days: number,
): number {
  if (days <= 0) return 0;
  const daily = product.rentDailyMinor ?? Math.max(200, Math.round(product.priceMinor * 0.12));
  const weekly = product.rentWeeklyMinor ?? daily * 7;
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  return weeks * weekly + rest * daily;
}

export function rentalDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function depositForProduct(
  product: { rentDepositMinor: number; priceMinor: number },
  variant?: { rentDepositMinor: number | null } | null,
): number {
  if (variant?.rentDepositMinor != null) return variant.rentDepositMinor;
  return product.rentDepositMinor || product.priceMinor;
}

// ---------------------------------------------------------------------------
// Peer-to-peer rental pricing & commissions
// ---------------------------------------------------------------------------

export interface RentalRates {
  daily: number;
  weekly?: number | null;
  monthly?: number | null;
}

export interface RentalQuote {
  days: number;
  months: number;
  weeks: number;
  remainderDays: number;
  amountMinor: number;
  effectiveDailyMinor: number;
}

/**
 * P2P rental pricing rule: complete 30-day blocks bill at the monthly rate,
 * complete 7-day blocks at the weekly rate, and every remaining day at the
 * daily rate. Missing weekly/monthly rates fall back to 7×/30× the daily rate.
 * Weekly/monthly rates are per listing, never per unit.
 */
export function rentalQuoteMinor(rates: RentalRates, days: number): RentalQuote {
  const safeDays = Math.max(0, Math.floor(days));
  if (safeDays === 0) {
    return { days: 0, months: 0, weeks: 0, remainderDays: 0, amountMinor: 0, effectiveDailyMinor: 0 };
  }
  const monthly = rates.monthly ?? rates.daily * 30;
  const weekly = rates.weekly ?? rates.daily * 7;
  const months = Math.floor(safeDays / 30);
  const afterMonths = safeDays % 30;
  const weeks = Math.floor(afterMonths / 7);
  const remainderDays = afterMonths % 7;
  const amountMinor = months * monthly + weeks * weekly + remainderDays * rates.daily;
  return {
    days: safeDays,
    months,
    weeks,
    remainderDays,
    amountMinor,
    effectiveDailyMinor: Math.round(amountMinor / safeDays),
  };
}

/** Commission in minor units for a gross amount, rounded half-up. */
export function commissionMinor(grossMinor: number, bps: number): number {
  if (grossMinor <= 0 || bps <= 0) return 0;
  return Math.round((grossMinor * bps) / 10000);
}

/** Whole days between two dates (calendar-day based). */
export function rentalDaysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

