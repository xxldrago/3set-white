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
  // 1plat.cash (parallel payment provider, switchable via admin UI).
  // Server-only merchant credentials. Optional: when unset the provider is
  // disabled and the active provider remains platega (D-77: no secrets in code).
  ONPLAT_API_KEY: z.string().min(1, "ONPLAT_API_KEY must not be empty").optional(),
  ONPLAT_BASE_URL: z.string().url().default("https://1plat.cash/v1"),
  // Active payment provider: "platega" (default) or "oneplat".
  PAYMENT_PROVIDER: z.enum(["platega", "oneplat"]).default("platega"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  // Public marketing site that hosts the legal pages (/privacy, /terms). The
  // cabinet (APP_BASE_URL) does not serve them, so the bot links point here.
  LEGAL_BASE_URL: z.string().url().default("https://3set.online"),
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
  // smtp.bz HTTP API (preferred over the SMTP relay when set — no SMTP ports
  // needed). Key from the smtp.bz panel (profile → API access); the sender
  // domain of SMTP_FROM must be added + verified there (SPF/DKIM per their
  // instructions). Optional base override for tests/stubs.
  SMTPBZ_API_KEY: z.string().min(1, "SMTPBZ_API_KEY must not be empty").optional(),
  SMTPBZ_API_BASE: z.string().url().default("https://api.smtp.bz/v1"),
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
  // Inbox that receives public support requests submitted from the static
  // landing (POST /api/support/intake). Optional on purpose: when unset the
  // route still delivers to admins via Telegram and skips only the email
  // copy (`lib/mail.ts` degrades to a logged no-op), so an unconfigured inbox
  // never loses a request and never blocks boot. Fail-fast still applies to a
  // set-but-malformed value. Server-only — never a NEXT_PUBLIC_* var.
  SUPPORT_ADMIN_EMAIL: z
    .string()
    .email("SUPPORT_ADMIN_EMAIL must be an email address")
    .optional(),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  // Bot username for the bot-redirect login deep link (plan 06-06, G-06-4b).
  // Optional: when unset the request route falls back to a cached `getMe()`.
  // Server-only (the client receives only the built t.me URL, never this var).
  TELEGRAM_BOT_USERNAME: z.string().min(1).optional(),
  // Bot API base URL. Default is Telegram's own endpoint; when the host
  // blocks api.telegram.org egress, point this at a Cloudflare Worker
  // forwarder (see workers/telegram-forwarder.js), e.g.
  // https://xxx.workers.dev. No trailing slash. Server-only.
  TELEGRAM_API_ROOT: z
    .string()
    .url()
    .default("https://api.telegram.org"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // During Next.js build phase, env vars may not be available.
  // Skip validation if we're in a build context (no runtime needed).
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.SKIP_ENV_VALIDATION === "true") {
    // Return a minimal valid object for build-time type checking
    return {
      BOT_TOKEN: "build-dummy",
      BOT_TEST_TOKEN: "build-dummy",
      DATABASE_URL: "postgresql://build:build@localhost/build",
      SESSION_SECRET: "build-secret-build-secret-build-secret",
      WEBHOOK_SECRET: "build-webhook-secret",
      ARTEMIDA_API_KEY: "build-dummy",
      ARTEMIDA_BASE_URL: "https://artemida.cc/v1",
      PLATEGA_MERCHANT_ID: "build-dummy",
      PLATEGA_SECRET: "build-dummy",
      PLATEGA_BASE_URL: "https://app.platega.io",
      ONPLAT_API_KEY: undefined,
      ONPLAT_BASE_URL: "https://1plat.cash/v1",
      PAYMENT_PROVIDER: "platega",
      APP_BASE_URL: "http://localhost:3000",
      LEGAL_BASE_URL: "https://3set.online",
      SMTP_HOST: undefined,
      SMTP_PORT: 587,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
      SMTP_FROM: undefined,
      SMTP_SECURE: false,
      SMTPBZ_API_KEY: undefined,
      SMTPBZ_API_BASE: "https://api.smtp.bz/v1",
      WHITELABEL_HOST: "sub.my.3set.online",
      ARTEMIDA_LOW_BALANCE_RUB: 500,
      CRON_SECRET: undefined,
      UPLOAD_DIR: "/data/uploads",
      ADMIN_TELEGRAM_IDS: undefined,
      SUPPORT_ADMIN_EMAIL: undefined,
      BOT_MODE: "polling",
      TELEGRAM_BOT_USERNAME: undefined,
      TELEGRAM_API_ROOT: "https://api.telegram.org",
      LOG_LEVEL: "info",
      NODE_ENV: "production",
    } as Env;
  }

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
