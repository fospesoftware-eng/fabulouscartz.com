import { Router } from "express";
import { z } from "zod";
import { ApiError, SESSION_COOKIE, asyncHandler, currentUser, logAudit, publicUser, requireAuth, validate } from "../helpers.js";
import { getDb, mutate } from "../store.js";
import { hashPassword, signToken, TOKEN_TTL_MS, verifyPassword } from "../security.js";
import { getSessionSecret } from "../store.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email("Enter a valid work email."),
  password: z.string().min(1, "Password is required."),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z
    .string()
    .min(10, "Use at least 10 characters.")
    .regex(/[A-Z]/, "Include one uppercase letter.")
    .regex(/[0-9]/, "Include one number."),
});

const attempts = new Map<string, { count: number; resetAt: number }>();

function throttle(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return;
  }
  entry.count += 1;
  if (entry.count > 6) {
    throw new ApiError(429, "too_many_attempts", "Too many sign-in attempts. Try again in a few minutes.");
  }
}

authRouter.post(
  "/login",
  asyncHandler((req, res) => {
    const body = validate(loginSchema, req.body);
    const key = `${req.ip}:${body.email.toLowerCase()}`;
    throttle(key);
    const database = getDb();
    const user = database.users.find((entry) => entry.email.toLowerCase() === body.email.toLowerCase());
    if (!user || !verifyPassword(body.password, user.passwordSalt, user.passwordHash)) {
      throw new ApiError(401, "invalid_credentials", "That email and password combination is not recognised.");
    }
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const token = signToken({ sub: user.id, role: user.role, exp: expiresAt }, getSessionSecret());
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TOKEN_TTL_MS / 1000}`,
    );
    attempts.delete(key);
    user.lastActiveAt = new Date().toISOString();
    mutate(() => undefined);
    res.json({ user: publicUser(user), expiresAt: new Date(expiresAt).toISOString() });
  }),
);

authRouter.get(
  "/me",
  asyncHandler((req, res) => {
    const user = currentUser(req);
    if (!user) throw new ApiError(401, "unauthorized", "Session expired.");
    res.json({ user });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler((_req, res) => {
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/password",
  requireAuth,
  asyncHandler((req, res) => {
    const body = validate(passwordSchema, req.body);
    const user = req.user!;
    const result = mutate((database) => {
      const stored = database.users.find((entry) => entry.id === user.id);
      if (!stored) throw new ApiError(404, "not_found", "Account not found.");
      if (!verifyPassword(body.currentPassword, stored.passwordSalt, stored.passwordHash)) {
        throw new ApiError(422, "invalid_password", "Your current password is incorrect.", {
          currentPassword: "Incorrect password.",
        });
      }
      const hashed = hashPassword(body.newPassword);
      stored.passwordSalt = hashed.salt;
      stored.passwordHash = hashed.hash;
      logAudit(database, user, "auth.password_changed", "team", user.id, "Password rotated by account owner");
      return { ok: true };
    });
    res.json(result);
  }),
);
