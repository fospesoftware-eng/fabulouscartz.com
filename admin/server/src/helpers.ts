import type { NextFunction, Request, Response } from "express";
import type { AuditEntry, Role, StoredUser, User } from "../../shared/types.js";
import type { Database } from "./store.js";
import { getDb } from "./store.js";
import { verifyToken } from "./security.js";
import { getSessionSecret } from "./store.js";
import { z } from "zod";

export const SESSION_COOKIE = "fc_admin_session";

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function publicUser(user: StoredUser): User {
  const { passwordSalt, passwordHash, ...rest } = user;
  void passwordSalt;
  void passwordHash;
  return rest;
}

export function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.cookie;
  if (!raw) return {};
  return raw.split(";").reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf("=");
    if (index > -1) acc[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return acc;
  }, {});
}

export function currentUser(req: Request): User | null {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const payload = verifyToken(token, getSessionSecret());
  if (!payload) return null;
  const user = getDb().users.find((entry) => entry.id === payload.sub);
  if (!user) return null;
  return publicUser(user);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user) {
    next(new ApiError(401, "unauthorized", "Please sign in to the operations console."));
    return;
  }
  req.user = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user ?? currentUser(req);
    if (!user) {
      next(new ApiError(401, "unauthorized", "Please sign in to the operations console."));
      return;
    }
    if (!roles.includes(user.role)) {
      next(new ApiError(403, "forbidden", "Your role does not have permission for this action."));
      return;
    }
    req.user = user;
    next();
  };
}

export function validate<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      fields[issue.path.join(".") || "_"] = issue.message;
    }
    throw new ApiError(422, "validation_failed", "Some fields need attention.", fields);
  }
  return result.data as z.infer<S>;
}

export function pageParams(req: Request, defaultSize = 20, maxSize = 100): { page: number; pageSize: number } {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(String(req.query.pageSize ?? defaultSize), 10) || defaultSize));
  return { page, pageSize };
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const data = items.slice((page - 1) * pageSize, page * pageSize);
  return { data, page, pageSize, total, totalPages };
}

export function logAudit(
  database: Database,
  user: User | null,
  action: string,
  entity: string,
  entityId: string,
  detail: string,
): AuditEntry {
  const entry: AuditEntry = {
    id: `aud_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    actor: user?.name ?? "System",
    actorRole: user?.role ?? "admin",
    action,
    entity,
    entityId,
    detail,
  };
  database.audit.unshift(entry);
  database.audit = database.audit.slice(0, 800);
  return entry;
}

export function notification(
  database: Database,
  title: string,
  body: string,
  kind: "order" | "stock" | "customer" | "system",
  href: string,
): void {
  database.notifications.unshift({
    id: `ntf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    title,
    body,
    kind,
    read: false,
    href,
    at: new Date().toISOString(),
  });
  database.notifications = database.notifications.slice(0, 80);
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
