import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import type { Actor } from "./guards.js";

export interface AuditInput {
  actor: Actor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  request?: FastifyRequest;
  meta?: Record<string, unknown>;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value, (_key, val) => (typeof val === "bigint" ? String(val) : val));
  } catch {
    return String(value);
  }
}

/** Append-only audit record. Never throws into the request path. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const ip = input.request?.ip;
    await prisma.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actorRole: input.actor?.role ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: serialize(input.before),
        after: serialize(input.after),
        ip,
        requestId: input.request?.id,
      },
    });
  } catch {
    // Auditing must never break a business transaction; errors are logged by the
    // request logger and can be alerted on separately.
  }
}
