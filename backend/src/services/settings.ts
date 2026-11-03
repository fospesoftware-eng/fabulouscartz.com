import { prisma } from "../db.js";

export interface StoreSettings {
  store: {
    name: string;
    tagline: string;
    email: string;
    supportPhone: string;
    address: string;
    currency: string;
  };
  tax: {
    ratePercent: number;
    inclusive: boolean;
  };
  shipping: {
    flatMinor: number;
    freeAboveMinor: number;
  };
  payments: {
    mock: boolean;
    phonepe: boolean;
    razorpay: boolean;
    upi: boolean;
    card: boolean;
    cod: boolean;
  };
  notifications: {
    orderCreated: boolean;
    lowStock: boolean;
    dailyDigest: boolean;
    refundRequests: boolean;
    newCustomer: boolean;
  };
  marketplace: {
    defaultCommissionBps: number;
    rentalPlatformFeeBps: number;
    payoutCycle: "weekly" | "monthly";
  };
}

export const DEFAULT_SETTINGS: StoreSettings = {
  store: {
    name: "Fabulous Cartz",
    tagline: "The atelier marketplace for Indian craft",
    email: "hello@fabulouscartz.com",
    supportPhone: "+91 98470 21021",
    address: "Fort Kochi, Kerala 682001, India",
    currency: "USD",
  },
  tax: { ratePercent: 5, inclusive: false },
  shipping: { flatMinor: 1200, freeAboveMinor: 7500 },
  payments: { mock: true, phonepe: true, razorpay: false, upi: true, card: true, cod: false },
  notifications: {
    orderCreated: true,
    lowStock: true,
    dailyDigest: true,
    refundRequests: true,
    newCustomer: false,
  },
  marketplace: { defaultCommissionBps: 1200, rentalPlatformFeeBps: 1000, payoutCycle: "weekly" },
};

const SECTIONS = ["store", "tax", "shipping", "payments", "notifications", "marketplace"] as const;

export async function getSettings(): Promise<StoreSettings> {
  const rows = await prisma.appSetting.findMany();
  const result: StoreSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const row of rows) {
    if (!SECTIONS.includes(row.key as (typeof SECTIONS)[number])) continue;
    try {
      const parsed = JSON.parse(row.value) as Record<string, unknown>;
      Object.assign(result[row.key as keyof StoreSettings], parsed);
    } catch {
      // Ignore malformed rows; defaults remain authoritative.
    }
  }
  return result;
}

export async function getSection<K extends keyof StoreSettings>(key: K): Promise<StoreSettings[K]> {
  return (await getSettings())[key];
}

export async function updateSection<K extends keyof StoreSettings>(
  key: K,
  patch: Partial<StoreSettings[K]>,
): Promise<StoreSettings[K]> {
  const current = await getSection(key);
  const next = { ...current, ...patch };
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: JSON.stringify(next) },
    create: { key, value: JSON.stringify(next) },
  });
  return next;
}

export function publicSettings(settings: StoreSettings) {
  return {
    store: settings.store,
    tax: settings.tax,
    shipping: settings.shipping,
    payments: settings.payments,
  };
}
