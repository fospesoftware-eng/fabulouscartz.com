#!/usr/bin/env node
/**
 * Single deploy entry point: bootstraps the database (migrations + first-boot
 * seed) and starts the Fastify service that serves the built storefront at
 * `/`, the admin console at `/backoffice/` and the API at `/api/v1` and
 * `/backoffice/api/v1`.
 *
 * Run through the repo-root `npm run start:deploy` after `build:deploy`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");

process.chdir(backendRoot);
dotenv.config({ path: path.join(backendRoot, ".env") });

function fail(message) {
  console.error(`\n[deploy] ${message}\n`);
  process.exit(1);
}

const missingSecrets = ["JWT_SECRET", "REFRESH_SECRET"].filter(
  (key) => !process.env[key] || process.env[key].length < 16,
);
if (missingSecrets.length > 0) {
  fail(
    [
      "Missing or too short required secrets:",
      `  ${missingSecrets.join(", ")}`,
      "",
      "Set them in Replit → Tools → Secrets (each at least 16 characters), then Republish.",
      "Locally, copy backend/.env.example to backend/.env and fill those two values.",
    ].join("\n"),
  );
}

process.env.NODE_ENV ??= "production";
process.env.HOST ??= "0.0.0.0";
process.env.PORT ??= "5000";
process.env.PUBLIC_BASE_URL ??= "https://fabulous.fospe.com";
process.env.CORS_ORIGINS ??=
  "https://fabulous.fospe.com,http://localhost:5173,http://localhost:5174";
process.env.DATABASE_URL ??= "file:./deploy.db";
process.env.ADMIN_CONSOLE_DIR ??= "./public/backoffice";
process.env.STOREFRONT_DIR ??= "../dist";

const storefrontIndex = path.join(repoRoot, "dist", "index.html");
const consoleIndex = path.join(backendRoot, "public", "backoffice", "index.html");
if (!fs.existsSync(storefrontIndex)) {
  fail("Storefront build is missing (dist/index.html). Run `npm run build:deploy` first.");
}
if (!fs.existsSync(consoleIndex)) {
  fail(
    "Admin console build is missing (backend/public/backoffice/index.html). " +
      "Run `npm run build:deploy` first.",
  );
}

function run(command, args) {
  console.log(`[deploy] ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: backendRoot, stdio: "inherit", env: process.env });
}

console.log(`[deploy] database ${process.env.DATABASE_URL}`);
try {
  run("npx", ["prisma", "migrate", "deploy"]);
} catch (error) {
  fail(`Database migration failed: ${error instanceof Error ? error.message : String(error)}`);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
let userCount = 0;
try {
  userCount = await prisma.user.count();
} catch (error) {
  await prisma.$disconnect();
  fail(
    `Database is not migrated correctly: ${error instanceof Error ? error.message : String(error)}`,
  );
}
await prisma.$disconnect();

if (userCount === 0) {
  console.log("[deploy] empty database — seeding demo data (first boot only)");
  try {
    run("npx", ["tsx", "prisma/seed.ts"]);
  } catch (error) {
    fail(`First-boot seed failed: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  console.log(`[deploy] database already seeded (${userCount} users) — skipping seed`);
}

console.log(
  `[deploy] starting combined service on ${process.env.HOST}:${process.env.PORT} ` +
    `(storefront /, console /backoffice/, API /api/v1 and /backoffice/api/v1)`,
);
await import(pathToFileURL(path.join(backendRoot, "dist", "server.js")).href);
