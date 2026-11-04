/* Storefront imagery is served from the storefront host, not the API host.
   One base keeps URLs configurable without inventing paths in components. */
const configured = (import.meta.env.VITE_ASSET_BASE as string | undefined)?.trim();
export const ASSET_BASE = (configured && configured.length ? configured : "/img").replace(/\/+$/, "");

export function assetUrl(value: string | undefined | null): string {
  const path = (value ?? "").trim();
  if (!path) return "";
  if (/^(?:https?:)?\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) return path;
  const relative = path.startsWith("/img/") ? path.slice(4) : path.startsWith("/") ? path : `/${path}`;
  return `${ASSET_BASE}${relative}`;
}
