import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parse } from "../lib/validate.js";
import {
  createSession,
  hashPassword,
  rotateRefreshToken,
  revokeAllSessions,
  revokeSession,
  verifyPassword,
} from "../lib/auth.js";
import { getActor, requireActor } from "../lib/guards.js";
import { AppError, conflict, forbidden, unauthorized } from "../lib/errors.js";
import { serializeUser } from "../lib/serialize.js";
import { recordAudit } from "../lib/audit.js";
import { enqueueNotification } from "../services/notifications.js";
import { passwordSchema } from "../lib/password.js";
import {
  clearLoginFailures,
  lockedSeconds,
  loginThrottleKey,
  recordLoginFailure,
} from "../lib/login-throttle.js";
import { USERNAME_PATTERN, allocateUsername, normalizeUsername, usernameFromEmail } from "../lib/username.js";

const password = passwordSchema;
const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_PATTERN, "Username must be 3–32 characters using letters, numbers, dot, underscore or dash")
    .optional(),
  password,
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
});
const loginSchema = z
  .object({
    username: z.string().trim().min(1).max(64).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1),
  })
  .refine((value) => Boolean(value.username || value.email), {
    message: "Provide a username (or an email for legacy clients)",
    path: ["username"],
  });
const refreshSchema = z.object({ refreshToken: z.string().min(10) });
const profileSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().max(80).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/auth/register",
    { schema: { tags: ["Auth"], summary: "Register a customer account" } },
    async (request, reply) => {
      const input = parse(registerSchema, request.body);
      const email = input.email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw conflict("An account with this email already exists");
      const username = await allocateUsername(input.username ?? usernameFromEmail(email));

      const user = await prisma.user.create({
        data: {
          email,
          username,
          passwordHash: await hashPassword(input.password),
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          phone: input.phone ?? null,
          role: "customer",
        },
      });
      const tokens = await createSession(user, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      await enqueueNotification({
        template: "customer_welcome",
        toAddress: user.email,
        subject: "Welcome to Fabulous Cartz",
        payload: { firstName: user.firstName },
      });
      await recordAudit({
        actor: { id: user.id, email: user.email, role: "customer", sessionId: tokens.sessionId },
        action: "auth.register",
        entityType: "user",
        entityId: user.id,
        request,
      });

      return reply.status(201).send({
        user: serializeUser(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessExpiresIn: tokens.accessExpiresIn,
          refreshExpiresAt: tokens.refreshExpiresAt,
        },
      });
    },
  );

  app.post(
    "/auth/login",
    { schema: { tags: ["Auth"], summary: "Login with username (email fallback) and password" } },
    async (request, reply) => {
      const input = parse(loginSchema, request.body);
      const identifier = normalizeUsername(input.username ?? input.email ?? "");
      const throttleKey = loginThrottleKey(identifier, request.ip);
      const lock = lockedSeconds(throttleKey);
      if (lock !== null) {
        throw new AppError(
          429,
          "TOO_MANY_ATTEMPTS",
          `Too many failed attempts. Try again in ${lock} seconds.`,
          { retryAfterSeconds: lock },
        );
      }

      const user = input.username
        ? await prisma.user.findUnique({ where: { username: identifier } })
        : await prisma.user.findUnique({ where: { email: (input.email ?? "").toLowerCase() } });

      // Identical message for unknown user and wrong password: no enumeration.
      if (!user) {
        recordLoginFailure(throttleKey);
        throw unauthorized("Invalid username or password");
      }
      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        recordLoginFailure(throttleKey);
        throw unauthorized("Invalid username or password");
      }
      if (!user.isActive) throw forbidden("This account is disabled");

      clearLoginFailures(throttleKey);
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      const tokens = await createSession(user, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      await recordAudit({
        actor: { id: user.id, email: user.email, role: user.role as never, sessionId: tokens.sessionId },
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        request,
      });

      return reply.send({
        user: serializeUser({ ...user, lastLoginAt: new Date() }),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessExpiresIn: tokens.accessExpiresIn,
          refreshExpiresAt: tokens.refreshExpiresAt,
        },
      });
    },
  );

  app.post(
    "/auth/refresh",
    { schema: { tags: ["Auth"], summary: "Rotate a refresh token" } },
    async (request, reply) => {
      const input = parse(refreshSchema, request.body);
      const rotated = await rotateRefreshToken(input.refreshToken, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      const user = await prisma.user.findUnique({ where: { id: rotated.user.id } });
      if (!user) throw unauthorized("Account no longer exists");

      return reply.send({
        user: serializeUser(user),
        tokens: {
          accessToken: rotated.accessToken,
          refreshToken: rotated.refreshToken,
          accessExpiresIn: rotated.accessExpiresIn,
          refreshExpiresAt: rotated.refreshExpiresAt,
        },
      });
    },
  );

  app.post(
    "/auth/logout",
    { schema: { tags: ["Auth"], summary: "Revoke the current session" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      await revokeSession(actor.sessionId);
      return reply.send({ revoked: true });
    },
  );

  app.get(
    "/auth/me",
    { schema: { tags: ["Auth"], summary: "Current authenticated user" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const user = await prisma.user.findUnique({ where: { id: actor.id } });
      if (!user) throw unauthorized("Account no longer exists");
      return reply.send({ user: serializeUser(user) });
    },
  );

  app.patch(
    "/auth/me",
    { schema: { tags: ["Auth"], summary: "Update own profile" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const input = parse(profileSchema, request.body);
      const before = await prisma.user.findUnique({ where: { id: actor.id } });
      const user = await prisma.user.update({
        where: { id: actor.id },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        },
      });
      await recordAudit({
        actor,
        action: "auth.profile.update",
        entityType: "user",
        entityId: user.id,
        before: serializeUser(before as never),
        after: serializeUser(user),
        request,
      });
      return reply.send({ user: serializeUser(user) });
    },
  );

  app.post(
    "/auth/password",
    { schema: { tags: ["Auth"], summary: "Change password and revoke all sessions" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const input = parse(changePasswordSchema, request.body);
      const user = await prisma.user.findUnique({ where: { id: actor.id } });
      if (!user) throw unauthorized("Account no longer exists");
      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) throw unauthorized("Current password is incorrect");
      if (input.currentPassword === input.newPassword) {
        throw conflict("New password must differ from the current password");
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.newPassword) },
      });
      await revokeAllSessions(user.id);
      const tokens = await createSession(user, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });
      await recordAudit({
        actor,
        action: "auth.password.change",
        entityType: "user",
        entityId: user.id,
        request,
      });

      return reply.send({
        user: serializeUser(user),
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessExpiresIn: tokens.accessExpiresIn,
          refreshExpiresAt: tokens.refreshExpiresAt,
        },
      });
    },
  );

  app.get(
    "/auth/sessions",
    { schema: { tags: ["Auth"], summary: "List own active sessions" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const sessions = await prisma.refreshSession.findMany({
        where: { userId: actor.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true },
      });
      return reply.send({ data: sessions });
    },
  );

  app.delete(
    "/auth/sessions/:id",
    { schema: { tags: ["Auth"], summary: "Revoke a specific own session" } },
    async (request, reply) => {
      const actor = await getActor(request);
      if (!actor) throw unauthorized();
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const session = await prisma.refreshSession.findFirst({ where: { id, userId: actor.id } });
      if (!session) throw unauthorized("Session not found");
      await revokeSession(id);
      return reply.status(204).send();
    },
  );
}
