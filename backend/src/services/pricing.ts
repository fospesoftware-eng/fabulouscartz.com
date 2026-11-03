import { prisma } from "../db.js";
import { getSettings } from "./settings.js";

export interface TaxShipping {
  taxMinor: number;
  shippingMinor: number;
  taxRatePercent: number;
  freeShippingThresholdMinor: number | null;
}

/** Tax and shipping are resolved from active rules, falling back to settings. */
export async function computeTaxAndShipping(subtotalAfterDiscountMinor: number): Promise<TaxShipping> {
  const settings = await getSettings();

  const taxRule = await prisma.taxRule.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  const rateBps = taxRule ? taxRule.rateBps : Math.round(settings.tax.ratePercent * 100);
  const taxMinor = Math.max(0, Math.round((subtotalAfterDiscountMinor * rateBps) / 10_000));

  const rules = await prisma.shippingRule.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  let shippingMinor = settings.shipping.flatMinor;
  let freeThreshold: number | null = settings.shipping.freeAboveMinor;
  let matched = false;
  for (const rule of rules) {
    const inRange =
      subtotalAfterDiscountMinor >= rule.minSubtotalMinor &&
      (rule.maxSubtotalMinor == null || subtotalAfterDiscountMinor <= rule.maxSubtotalMinor);
    if (!inRange) continue;
    matched = true;
    shippingMinor = rule.rateMinor;
    freeThreshold = rule.freeAboveMinor;
    if (rule.freeAboveMinor != null && subtotalAfterDiscountMinor >= rule.freeAboveMinor) {
      shippingMinor = 0;
    }
    break;
  }
  if (!matched && settings.shipping.freeAboveMinor != null && subtotalAfterDiscountMinor >= settings.shipping.freeAboveMinor) {
    shippingMinor = 0;
  }

  return {
    taxMinor,
    shippingMinor: Math.max(0, shippingMinor),
    taxRatePercent: rateBps / 100,
    freeShippingThresholdMinor: freeThreshold,
  };
}
