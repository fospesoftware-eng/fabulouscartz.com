import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { auth, loginAs, makeApp, STAFF } from "./helpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
});

describe("health", () => {
  it("reports liveness and readiness", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe("ok");

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().database).toBe("ok");
  });

  it("echoes a caller-supplied request id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "req-test-123" },
    });
    expect(response.headers["x-request-id"]).toBe("req-test-123");
  });
});

describe("auth", () => {
  it("logs a staff user in and returns a token pair", async () => {
    const session = await loginAs(app, STAFF.admin);
    expect(session.role).toBe("admin");
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: auth(session.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(STAFF.admin.email);
  });

  it("rejects a wrong password with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: STAFF.admin.email, password: "wrong-password" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("registers a customer, rejects duplicates and invalid payloads", async () => {
    const email = `register-${Date.now()}@example.com`;
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "Passw0rd!2026", firstName: "Test" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().user.role).toBe("customer");

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "Passw0rd!2026", firstName: "Test" },
    });
    expect(duplicate.statusCode).toBe(409);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "not-an-email", password: "short", firstName: "X" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rotates refresh tokens and rejects reuse", async () => {
    const session = await loginAs(app, STAFF.manager);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const rotated = first.json().tokens.refreshToken;
    expect(rotated).not.toBe(session.refreshToken);

    const reuse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);

    const stillValid = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: rotated },
    });
    expect(stillValid.statusCode).toBe(200);
  });

  it("revokes the session on logout so the access token stops working", async () => {
    const session = await loginAs(app, STAFF.fulfilment);
    const before = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: auth(session.accessToken),
    });
    expect(before.statusCode).toBe(200);

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: auth(session.accessToken),
    });
    expect(logout.statusCode).toBe(200);

    const after = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: auth(session.accessToken),
    });
    expect(after.statusCode).toBe(401);
  });

  it("changes password, invalidates old sessions and needs the new password", async () => {
    const email = `pwchange-${Date.now()}@example.com`;
    const registered = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email, password: "Original#2026", firstName: "Pw" },
    });
    expect(registered.statusCode).toBe(201);
    const accessToken = registered.json().tokens.accessToken as string;

    const wrong = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: auth(accessToken),
      payload: { currentPassword: "nope", newPassword: "Replacement#2026" },
    });
    expect(wrong.statusCode).toBe(401);

    const changed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/password",
      headers: auth(accessToken),
      payload: { currentPassword: "Original#2026", newPassword: "Replacement#2026" },
    });
    expect(changed.statusCode).toBe(200);

    const oldToken = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: auth(accessToken),
    });
    expect(oldToken.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "Replacement#2026" },
    });
    expect(newLogin.statusCode).toBe(200);

    const oldPassword = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email, password: "Original#2026" },
    });
    expect(oldPassword.statusCode).toBe(401);
  });

  it("rejects anonymous access to protected routes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/orders" });
    expect(response.statusCode).toBe(401);
  });
});
