export interface ApiErrorShape {
  status: number;
  code: string;
  fields?: Record<string, string>;
  message: string;
}

export class ApiError extends Error implements ApiErrorShape {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * The console and the API share one origin when served by the backend:
 * /backoffice (console) + /backoffice/api/v1 (API). VITE_API_BASE overrides the
 * default without code changes (deployed domains, split-host setups).
 */
export const API_BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "/backoffice/api/v1"
).replace(/\/$/, "");

const TOKENS_KEY = "fc.backoffice.tokens";

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
}

function readTokens(): StoredTokens | null {
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTokens;
    return parsed.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

let tokens: StoredTokens | null = readTokens();

export function getStoredTokens(): StoredTokens | null {
  return tokens ?? readTokens();
}

export function storeTokens(next: StoredTokens): void {
  tokens = next;
  try {
    window.localStorage.setItem(TOKENS_KEY, JSON.stringify(next));
  } catch {
    /* storage disabled: keep the in-memory copy for this tab */
  }
}

export function clearTokens(): void {
  tokens = null;
  try {
    window.localStorage.removeItem(TOKENS_KEY);
  } catch {
    /* ignore */
  }
}

function resolveUrl(path: string): string {
  if (/^https?:/i.test(path) || path.startsWith(API_BASE)) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Rotate the persisted refresh token exactly once, even for concurrent 401s. */
async function refreshAccessToken(): Promise<boolean> {
  const stored = getStoredTokens();
  if (!stored?.refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(resolveUrl("/auth/refresh"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: stored.refreshToken }),
        });
        if (!response.ok) return false;
        const payload = (await response.json()) as { tokens?: StoredTokens };
        if (!payload.tokens?.accessToken) return false;
        storeTokens({
          accessToken: payload.tokens.accessToken,
          refreshToken: payload.tokens.refreshToken ?? stored.refreshToken,
        });
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function send(path: string, options: RequestInit): Promise<Response> {
  const stored = getStoredTokens();
  const { headers, ...rest } = options;
  return fetch(resolveUrl(path), {
    credentials: "include",
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(stored ? { authorization: `Bearer ${stored.accessToken}` } : {}),
      ...(headers ?? {}),
    },
  });
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isAuthCall = path.includes("/auth/login") || path.includes("/auth/refresh") || path.includes("/auth/logout");
  let response = await send(path, options);

  if (response.status === 401 && !isAuthCall) {
    if (await refreshAccessToken()) {
      response = await send(path, options);
    }
    if (response.status === 401) {
      clearTokens();
      window.dispatchEvent(new CustomEvent("fc:unauthorized"));
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const envelope = payload as { error?: { code?: string; message?: string; fields?: Record<string, string> } };
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? "request_failed",
      envelope?.error?.message ?? "The request could not be completed.",
      envelope?.error?.fields,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export async function downloadCsv(path: string, filename: string): Promise<void> {
  const stored = getStoredTokens();
  const response = await fetch(resolveUrl(path), {
    credentials: "include",
    ...(stored ? { headers: { authorization: `Bearer ${stored.accessToken}` } } : {}),
  });
  if (!response.ok) throw new ApiError(response.status, "export_failed", "The export could not be generated.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
