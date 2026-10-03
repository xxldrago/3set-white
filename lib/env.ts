// Single zod-validated env schema, fail-fast at boot (Don't-Hand-Roll:
// no process.env.X! scattered through code). Importing this module throws
// on missing/invalid env so misconfiguration fails at startup, not as a
// 500 in prod. Never log the parsed values — they include secrets.
import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required (prod bot via BotFather)"),
  BOT_TEST_TOKEN: z.string().min(1, "BOT_TEST_TOKEN is required (separate dev bot via BotFather)"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (postgres connection string)"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be >= 32 chars (generate: openssl rand -hex 32)"),
  WEBHOOK_SECRET: z.string().min(16, "WEBHOOK_SECRET must be >= 16 chars"),
  // ARTEMIDA Paid API V1 (D-20). Server-only — never expose via NEXT_PUBLIC_*.
  ARTEMIDA_API_KEY: z.string().min(1, "ARTEMIDA_API_KEY is required"),
  ARTEMIDA_BASE_URL: z.string().url().default("https://artemida.cc/v1"),
  // Platega.io (D-36/D-37). Server-only merchant credentials. Two-mode
  // separation is env-only: `.env.local` holds the test merchant pair, prod
  // holds the live pair — nothing in code branches on mode.
  PLATEGA_MERCHANT_ID: z.string().min(1, "PLATEGA_MERCHANT_ID is required"),
  PLATEGA_SECRET: z.string().min(1, "PLATEGA_SECRET is required"),
  PLATEGA_BASE_URL: z.string().url().default("https://app.platega.io"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  // Shared secret for the optional manual reconcile trigger
  // (POST /api/cron/reconcile). Optional: when unset the route refuses (503) —
  // the instrumentation.ts worker remains the primary path (A6 fallback).
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be >= 16 chars").optional(),
  // Local upload volume for ticket attachments (D-53). Server-only — never a
  // NEXT_PUBLIC_* var. Default mirrors the compose mount at /data/uploads.
  UPLOAD_DIR: z.string().min(1).default("/data/uploads"),
  // Comma-separated Telegram ids allowed to reply/close tickets in Phase 4
  // (D-51). Optional: empty/unset means no admins. Server-only.
  ADMIN_TELEGRAM_IDS: z.string().optional(),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${details}`);
  }
  return parsed.data;
}

export const env = loadEnv();
