import express from "express";
import type { NextFunction, Request, Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "./helpers.js";
import { loadDb } from "./store.js";
import { authRouter } from "./routes/auth.js";
import { ordersRouter } from "./routes/orders.js";
import { productsRouter } from "./routes/products.js";
import { inventoryRouter } from "./routes/inventory.js";
import { customersRouter } from "./routes/customers.js";
import { categoriesRouter, contentRouter, discountsRouter, vendorsRouter } from "./routes/catalogue.js";
import { mapRouter } from "./routes/geo.js";
import { marketplaceRouter } from "./routes/marketplace.js";
import {
  analyticsRouter,
  auditRouter,
  dashboardRouter,
  healthRouter,
  mediaRouter,
  notificationsRouter,
  searchRouter,
  settingsRouter,
  teamRouter,
} from "./routes/system.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mediaRoot = path.resolve(__dirname, "../../public/media");
const port = Number(process.env.PORT ?? 4000);

loadDb();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" }));
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin && /^http:\/\/localhost:(5173|5174)$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use("/media", express.static(mediaRoot, { maxAge: "7d", fallthrough: true }));

app.get("/api", (_req, res) => {
  res.json({ service: "Fabulous Cartz Operations API", version: "1.0.0", docs: "/api/health" });
});
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/products", productsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/customers", customersRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/vendors", vendorsRouter);
app.use("/api/content", contentRouter);
app.use("/api/discounts", discountsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/team", teamRouter);
app.use("/api/audit", auditRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/media", mediaRouter);
app.use("/api/search", searchRouter);
app.use("/api/map", mapRouter);
app.use("/api/admin", marketplaceRouter);

app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "That endpoint does not exist." } });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, fields: error.fields } });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: { code: "invalid_json", message: "The request body is not valid JSON." } });
    return;
  }
  console.error("[api] unhandled", error);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong inside the operations API." } });
});

app.listen(port, () => {
  console.log(`Fabulous Cartz admin API listening on http://localhost:${port}`);
});
