import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { forbidden, unauthorized } from "./errors.js";
import { bearerToken, verifyAccessToken } from "./auth.js";
import type { Role } from "./constants.js";

export interface Actor {
  id: string;
  email: string;
  role: Role;
  sessionId: string;
}

/** Resolve the caller. Returns null for guests / invalid tokens. */
export async function getActor(request: FastifyRequest): Promise<Actor | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const session = await prisma.refreshSession.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.isActive || session.user.id !== payload.sub) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role as Role,
    sessionId: session.id,
  };
}

export async function requireActor(request: FastifyRequest): Promise<Actor> {
  const actor = await getActor(request);
  if (!actor) throw unauthorized();
  return actor;
}

export function requireRole(actor: Actor, roles: Role[]): void {
  if (!roles.includes(actor.role)) {
    throw forbidden(`Requires one of: ${roles.join(", ")}`);
  }
}

/** Staff helper: any non-customer role. */
export function requireStaff(actor: Actor): void {
  if (actor.role === "customer") throw forbidden("Staff access required");
}
