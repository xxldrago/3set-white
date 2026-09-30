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
