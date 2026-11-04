import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetLoginThrottle } from "../src/lib/login-throttle.js";
import { auth, loginAs, makeApp, STAFF } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
  resetLoginThrottle();
});

afterAll(async () => {
  await app.close();
});

const login = (payload: Record<string, unknown>, prefix = "/api/v1") =>
  app.inject({ method: "POST", url: `${prefix}/auth/login`, payload });

describe("username authentication", () => {
  it("logs in with a username and returns the principal without the password hash", async () => {
    const response = await login({ username: "admin", password: "Admin#2026" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.username).toBe("admin");
    expect(body.user.role).toBe("admin");
    expect(body.user.name).toBeTruthy();
    expect(body.tokens.accessToken).toBeTruthy();
    expect(response.body).not.toContain("passwordHash");
  });

  it("accepts email as a legacy fallback on both API prefixes", async () => {
    const legacy = await login({ email: "admin@fabulouscartz.com", password: "Admin#2026" });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().user.username).toBe("admin");

    const mounted = await login({ username: "admin", password: "Admin#2026" }, "/backoffice/api/v1");
    expect(mounted.statusCode).toBe(200);
    expect(mounted.json().user.username).toBe("admin");
  });

  it("matches usernames case-insensitively", async () => {
    const response = await login({ username: "ADMIN", password: "Admin#2026" });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.username).toBe("admin");
  });

  it("returns the same generic error for a wrong password and an unknown username", async () => {
    const wrongPassword = await login({ username: "manager", password: "wrong-password" });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json().error.message).toBe("Invalid username or password");

    const unknown = await login({ username: "nobody.here", password: "Admin#2026" });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.message).toBe("Invalid username or password");
  });

  it("keeps refresh-token rotation working for username sessions", async () => {
    const signedIn = await login({ username: "manager", password: "Manager#2026" });
    expect(signedIn.statusCode).toBe(200);
    const first = signedIn.json().tokens;

    const rotated = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    const second = rotated.json().tokens;
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: auth(second.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe("manager");
  });

  it("locks the username+IP pair after repeated failures", async () => {
    resetLoginThrottle();
    const username = "ghost.probe";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await login({ username, password: `Wrong#${attempt}00` });
      expect(failed.statusCode).toBe(401);
    }
    const locked = await login({ username, password: "Admin#2026" });
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe("TOO_MANY_ATTEMPTS");
    expect(locked.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
    resetLoginThrottle();
  });

  it("rejects passwords that do not meet the policy", async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `policy.${suffix}@example.com`;
    const short = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "Ab1!", firstName: "Policy" },
    });
    expect(short.statusCode).toBe(400);
    expect(JSON.stringify(short.json())).toMatch(/at least 10 characters/i);

    const noSymbol = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "abcdefgh12", firstName: "Policy" },
    });
    expect(noSymbol.statusCode).toBe(400);
    expect(JSON.stringify(noSymbol.json())).toMatch(/symbol/i);

    const strong = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "Policy#Pass123", firstName: "Policy" },
    });
    expect(strong.statusCode).toBe(201);
    expect(strong.json().user.username).toBe(`policy.${suffix}`);

    const adminToken = (await loginAs(app, STAFF.admin)).accessToken;
    const resetWeak = await app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${strong.json().user.id}/reset-password`,
      headers: auth(adminToken),
      payload: { newPassword: "password123" },
    });
    expect(resetWeak.statusCode).toBe(400);
  });
});
