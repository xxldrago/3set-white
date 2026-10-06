// Structured logging (pino). Use this everywhere — no `console.*` in lib/.
// PII/secrets discipline (V7, T-02-03): never log BOT_TOKEN, session JWTs,
// or full Telegram updates carrying PII at info level — log ids/outcomes.
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
});
