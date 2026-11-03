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

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith("http") ? path : path.startsWith("/api") ? path : `/api${path}`;
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401 && !path.includes("/auth/login")) {
      window.dispatchEvent(new CustomEvent("fc:unauthorized"));
    }
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
  const response = await fetch(path.startsWith("/api") ? path : `/api${path}`, { credentials: "include" });
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
