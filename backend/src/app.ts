import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import etag from "@fastify/etag";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { AppError } from "./lib/errors.js";
import { authRoutes } from "./routes/auth.js";
import { catalogRoutes } from "./routes/catalog.js";
import { cartRoutes } from "./routes/cart.js";
import { checkoutRoutes, paymentRoutes } from "./routes/checkout.js";
import { engagementRoutes } from "./routes/engagement.js";
import { sellerStorefrontRoutes } from "./routes/sellers.js";
import { rentalRoutes } from "./routes/rentals.js";
import { adminCatalogRoutes } from "./routes/admin/catalog.js";
import { adminOperationsRoutes } from "./routes/admin/operations.js";
import { adminSystemRoutes } from "./routes/admin/system.js";
import { adminSellerRoutes } from "./routes/admin/sellers.js";
import { adminPayoutRoutes } from "./routes/admin/payouts.js";
import { adminRentalRoutes } from "./routes/admin/rentals.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isTest
      ? false
      : { level: config.NODE_ENV === "production" ? "info" : "debug" },
    genReqId: (request) => {
      const header = request.headers["x-request-id"];
      return typeof header === "string" && header.length > 0 ? header : randomUUID();
    },
    bodyLimit: 6 * 1024 * 1024,
    trustProxy: true,
    // The console and the API share one origin. Requests under the back-office
    // mount are transparently rewritten to the historical /api paths, so a
    // route is registered once and /backoffice/api/v1/... behaves exactly like
    // /api/v1/... (same handlers, same auth, same OpenAPI paths).
    rewriteUrl: (request) => {
      const url = request.url ?? "/";
      if (url === "/backoffice/api" || url.startsWith("/backoffice/api/") || url.startsWith("/backoffice/api?")) {
        return url.slice("/backoffice".length);
      }
      return url;
    },
  });

  // Capture the raw JSON body for webhook signature verification while still
  // exposing parsed JSON to normal handlers.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    (request as unknown as { rawBody?: Buffer }).rawBody = body as Buffer;
    if (!body || body.length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse((body as Buffer).toString("utf8")));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: ["x-request-id", "x-cart-token"],
    allowedHeaders: ["authorization", "content-type", "x-cart-token", "x-request-id", "x-webhook-signature"],
  });

  await app.register(etag, { weak: true });
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 12 },
  });

  const uploadDir = path.resolve(config.UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  await app.register(staticPlugin, {
    root: uploadDir,
    prefix: "/uploads/",
    decorateReply: false,
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Fabulous Cartz Commerce API",
        description:
          "Single source of truth API for the Fabulous Cartz storefront and admin back office. " +
          "All money is integer minor units (USD cents). Authenticate with a bearer JWT from /api/v1/auth/login.",
        version: "1.0.0",
      },
      servers: [
        { url: config.PUBLIC_BASE_URL, description: "Local API" },
        { url: `${config.PUBLIC_BASE_URL}/api/v1`, description: "API v1" },
      ],
      tags: [
        { name: "Auth", description: "Registration, sessions, passwords" },
        { name: "Catalogue", description: "Public products, categories, vendors, search" },
        { name: "Cart", description: "Guest and customer carts" },
        { name: "Checkout", description: "Order creation" },
        { name: "Orders", description: "Customer and guest order access" },
        { name: "Payments", description: "Provider intents, mock confirmation, webhooks" },
        { name: "Discounts", description: "Coupon validation" },
        { name: "Reviews", description: "Product reviews" },
        { name: "Wishlist", description: "Customer wishlists" },
        { name: "Content", description: "Banners and editorial" },
        { name: "Settings", description: "Public store settings" },
        { name: "Sellers", description: "Public marketplace seller storefronts" },
        { name: "Rentals", description: "Peer-to-peer rental listings and bookings" },
        { name: "Admin · Catalogue", description: "Product/category/vendor management" },
        { name: "Admin · Sellers", description: "Seller onboarding, KYC review, commission and analytics" },
        { name: "Admin · Payouts", description: "Commission ledger and payout settlement" },
        { name: "Admin · Rentals", description: "Rental moderation, bookings, deposits, disputes" },
        { name: "Admin · Inventory", description: "Stock, reservations, adjustments" },
        { name: "Admin · Orders", description: "Order operations and refunds" },
        { name: "Admin · Customers", description: "Customer CRM" },
        { name: "Admin · Discounts", description: "Coupon management" },
        { name: "Admin · Reviews", description: "Moderation" },
        { name: "Admin · Content", description: "Banners and posts" },
        { name: "Admin · Analytics", description: "Reports and CSV exports" },
        { name: "Admin · Settings", description: "Store/tax/shipping/payment config" },
        { name: "Admin · Team", description: "Staff accounts and roles" },
        { name: "Admin · Audit", description: "Immutable mutation log" },
        { name: "Admin · Notifications", description: "Outbox" },
        { name: "Admin · Media", description: "Image uploads" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true, persistAuthorization: true },
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.get("/health", { schema: { tags: ["Health"], summary: "Liveness check" } }, async (_request, reply) =>
    reply.send({
      status: "ok",
      service: "fabulouscartz-api",
      version: "1.0.0",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get("/ready", { schema: { tags: ["Health"], summary: "Readiness check (DB connectivity)" } }, async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: "ready", database: "ok" });
    } catch (error) {
      request.log.error({ err: error }, "readiness check failed");
      return reply.status(503).send({ status: "not_ready", database: "unavailable" });
    }
  });

  app.setNotFoundHandler(async (request, reply) =>
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    }),
  );

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
          requestId: request.id,
        },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
          requestId: request.id,
        },
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply.status(409).send({
          error: {
            code: "CONFLICT",
            message: "A record with these unique values already exists",
            details: { target: error.meta?.target },
            requestId: request.id,
          },
        });
      }
      if (error.code === "P2025") {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Record not found", requestId: request.id },
        });
      }
    }

    request.log.error({ err: error }, "Unhandled request error");
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId: request.id,
      },
    });
  });

  // Registered once. `rewriteUrl` above makes /backoffice/api/v1/... resolve to
  // these same routes, so the console shares one origin with the API without a
  // second copy of every route (which also keeps the OpenAPI paths canonical).
  const apiV1 = async (instance: FastifyInstance) => {
    await instance.register(authRoutes);
    await instance.register(catalogRoutes);
    await instance.register(cartRoutes);
    await instance.register(checkoutRoutes);
    await instance.register(paymentRoutes);
    await instance.register(engagementRoutes);
    await instance.register(sellerStorefrontRoutes);
    await instance.register(rentalRoutes);
  };
  const apiV1Admin = async (instance: FastifyInstance) => {
    await instance.register(adminCatalogRoutes);
    await instance.register(adminOperationsRoutes);
    await instance.register(adminSystemRoutes);
    await instance.register(adminSellerRoutes);
    await instance.register(adminPayoutRoutes);
    await instance.register(adminRentalRoutes);
  };

  await app.register(apiV1, { prefix: "/api/v1" });
  await app.register(apiV1Admin, { prefix: "/api/v1/admin" });

  // The admin console build is served from this directory. When it is absent
  // (API-only deployments) /backoffice returns a short JSON hint instead of 404.
  const consoleRoot = path.resolve(config.ADMIN_CONSOLE_DIR);
  const consoleIndex = path.join(consoleRoot, "index.html");
  const consoleReady = fs.existsSync(consoleIndex);

  if (consoleReady) {
    await app.register(staticPlugin, {
      root: consoleRoot,
      prefix: "/backoffice/",
      wildcard: false,
      index: ["index.html"],
    });

    app.get("/backoffice", { schema: { hide: true } }, async (_request, reply) =>
      reply.redirect("/backoffice/"),
    );

    // SPA fallback: real files are served above, every other console path gets
    // index.html so deep links (/backoffice/rentals/bookings) never 404.
    app.get("/backoffice/*", { schema: { hide: true } }, async (request, reply) => {
      const wildcard = (request.params as { "*": string })["*"] ?? "";
      if (wildcard.startsWith("api/")) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: `API route /backoffice/${wildcard} not found`,
            requestId: request.id,
          },
        });
      }
      const candidate = path.resolve(consoleRoot, wildcard);
      if (
        candidate.startsWith(consoleRoot) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        return reply.sendFile(wildcard, consoleRoot);
      }
      return reply.type("text/html; charset=utf-8").send(fs.readFileSync(consoleIndex, "utf8"));
    });
  } else {
    app.get("/backoffice", { schema: { hide: true } }, async (_request, reply) =>
      reply.status(503).send({
        error: {
          code: "CONSOLE_NOT_BUILT",
          message: "Admin console not built. Run `npm run build:backoffice`.",
        },
      }),
    );
  }

  if (!config.isTest) {
    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  }

  return app;
}
