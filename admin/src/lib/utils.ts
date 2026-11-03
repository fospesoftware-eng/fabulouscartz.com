export function money(value: number, options?: { compact?: boolean; decimals?: boolean }): string {
  if (options?.compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options?.decimals ? 2 : 0,
    maximumFractionDigits: options?.decimals ? 2 : 0,
  }).format(value);
}

export function num(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function compact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function pct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function dateShort(value: string | Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short" }).format(new Date(value));
}

export function dateMedium(value: string | Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function dateTime(value: string | Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function isoDate(value: Date | string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function relative(value: string | Date | null): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateMedium(value);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function todayRange(): { from: string; to: string } {
  const today = new Date();
  return { from: isoDate(today), to: isoDate(today) };
}

export const STATUS_TONE: Record<string, string> = {
  published: "positive",
  active: "positive",
  delivered: "positive",
  paid: "positive",
  in_stock: "positive",
  draft: "warning",
  pending: "warning",
  processing: "info",
  packed: "gold",
  shipped: "info",
  low: "warning",
  archived: "neutral",
  cancelled: "danger",
  returned: "danger",
  refunded: "danger",
  failed: "danger",
  out: "danger",
  unfulfilled: "warning",
};

export function foldWords(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
