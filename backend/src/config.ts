import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  JWT_SECRET: z.string().min(16),
  REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:5174"),
  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  ADMIN_CONSOLE_DIR: z.string().default("./public/backoffice"),
  STOREFRONT_DIR: z.string().default("../dist"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  PAYMENT_DEFAULT_PROVIDER: z.string().default("mock"),
  MOCK_WEBHOOK_SECRET: z.string().default("mock-webhook-secret"),
  PHONEPE_WEBHOOK_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  PHONEPE_MERCHANT_ID: z.string().default(""),
  PHONEPE_SALT_KEY: z.string().default(""),
  NOTIFICATION_DRIVER: z.string().default("mock"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  isTest: parsed.data.NODE_ENV === "test",
};
export type Config = typeof config;
