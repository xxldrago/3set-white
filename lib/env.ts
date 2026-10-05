// Single zod-validated env schema, fail-fast at boot (Don't-Hand-Roll:
// no process.env.X! scattered through code). Importing this module throws
// on missing/invalid env so misconfiguration fails at startup, not as a
// 500 in prod. Never log the parsed values — they include secrets.
import { z } from "zod";

export const envSchema = z.object({
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
  // Own SMTP relay for Phase 6 mail (D-87/D-90, 06-03). Server-only — never
  // a NEXT_PUBLIC_* var. All OPTIONAL on purpose: without SMTP_HOST/SMTP_FROM
  // `lib/mail.ts` degrades to a logged no-op (dev/test need no credentials;
  // production relay setup is an owner user_setup item). Fail-fast still
  // applies to set-but-malformed values (bad port, non-email FROM).
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required (prod relay host)").optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1, "SMTP_USER is required (relay auth login)").optional(),
  SMTP_PASS: z.string().min(1, "SMTP_PASS is required (relay auth password)").optional(),
  SMTP_FROM: z.string().email("SMTP_FROM must be an email address").optional(),
  SMTP_SECURE: z.stringbool().default(false),
  // White Label subscription host (D-72/D-74, OPS-02). The provider returns
  // subscription links on this host; `lib/whitelabel.ts` verifies the returned
  // URL against it and falls back to the provider URL on mismatch — the host is
  // never constructed or rewritten. Server-only — never a NEXT_PUBLIC_* var.
  WHITELABEL_HOST: z.string().min(1).default("sub.my.3set.online"),
  // ARTEMIDA low-balance alert threshold in RUB (D-70). Consumed by the admin
  // balance chip in 05-07; carried in the schema here so that plan can read it.
  ARTEMIDA_LOW_BALANCE_RUB: z.coerce.number().nonnegative().default(500),
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
