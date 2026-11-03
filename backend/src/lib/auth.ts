import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { unauthorized } from "./errors.js";
import type { Role } from "./constants.js";

const accessKey = new TextEncoder().encode(config.JWT_SECRET);
const refreshKey = new TextEncoder().encode(config.REFRESH_SECRET);

export const PASSWORD_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

interface TokenUser {
  id: string;
  email: string;
  role: string;
}

export async function createSession(
  user: TokenUser,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<TokenPair> {
  const sessionId = crypto.randomUUID();
  const refreshExpiresAt = new Date(
    Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const accessToken = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: sessionId,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.ACCESS_TOKEN_TTL)
    .setIssuer("fabulouscartz-api")
    .setAudience("fabulouscartz")
    .sign(accessKey);

  const refreshToken = await new SignJWT({
    sub: user.id,
    sid: sessionId,
    typ: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(refreshExpiresAt)
    .setIssuer("fabulouscartz-api")
    .setAudience("fabulouscartz")
    .sign(refreshKey);

  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent ?? undefined,
      ip: meta.ip ?? undefined,
    },
  });

  return {
    accessToken,
    refreshToken,
    accessExpiresIn: config.ACCESS_TOKEN_TTL,
    refreshExpiresAt,
    sessionId,
  };
}

export interface AccessPayload {
  sub: string;
  email: string;
  role: Role;
  sid: string;
  typ: "access";
}

export async function verifyAccessToken(token: string): Promise<AccessPayload | null> {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      algorithms: ["HS256"],
      issuer: "fabulouscartz-api",
      audience: "fabulouscartz",
    });
    if (payload.typ !== "access" || typeof payload.sid !== "string" || typeof payload.sub !== "string") {
      return null;
    }
    return payload as unknown as AccessPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string,
): Promise<{ sub: string; sid: string } | null> {
  try {
    const { payload } = await jwtVerify(token, refreshKey, {
      algorithms: ["HS256"],
      issuer: "fabulouscartz-api",
      audience: "fabulouscartz",
    });
    if (payload.typ !== "refresh" || typeof payload.sid !== "string" || typeof payload.sub !== "string") {
      return null;
    }
    return { sub: payload.sub as string, sid: payload.sid as string };
  } catch {
    return null;
  }
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Rotate a refresh token; returns new pair or throws 401. */
export async function rotateRefreshToken(
  token: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<TokenPair & { user: TokenUser }> {
  const payload = await verifyRefreshToken(token);
  if (!payload) throw unauthorized("Invalid or expired refresh token");

  const session = await prisma.refreshSession.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw unauthorized("Session revoked or expired");
  }
  if (session.tokenHash !== sha256(token)) {
    // Token reuse / tampering: revoke the whole session chain.
    await revokeSession(session.id);
    throw unauthorized("Refresh token does not match the active session");
  }
  if (!session.user.isActive) throw unauthorized("Account is disabled");

  const pair = await createSession(session.user, meta);
  await prisma.refreshSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date(), replacedById: pair.sessionId },
  });

  return { ...pair, user: { id: session.user.id, email: session.user.email, role: session.user.role } };
}
