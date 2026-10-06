// Env schema wiring (OPS-01 / D-70/D-72): the prod origin for Platega return
// URLs and webhook host is accepted, a non-URL origin is rejected, and the
// Phase-5 additions (`ARTEMIDA_LOW_BALANCE_RUB`, `WHITELABEL_HOST`) default and
// coerce. Uses the exported `envSchema` directly so no process-level env needs
// to be mutated.
import { describe, expect, it } from "vitest";
import { envSchema } from "../../lib/env";

// Minimal set of required fields; everything else has a safe default.
const REQUIRED = {
  BOT_TOKEN: "test-bot-token",
  BOT_TEST_TOKEN: "test-bot-test-token",
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/setwhite",
  SESSION_SECRET: "unit-test-session-secret-at-least-32-characters",
  WEBHOOK_SECRET: "unit-test-webhook-secret",
  ARTEMIDA_API_KEY: "unit-test-artemida-key",
  PLATEGA_MERCHANT_ID: "unit-test-merchant-id",
  PLATEGA_SECRET: "unit-test-platega-secret",
};

describe("env schema — prod origin + Phase 5 vars", () => {
  it("parses the prod origin https://my.3set.online", () => {
    const parsed = envSchema.safeParse({
      ...REQUIRED,
      APP_BASE_URL: "https://my.3set.online",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.APP_BASE_URL).toBe("https://my.3set.online");
    }
  });

  it("rejects a non-URL APP_BASE_URL", () => {
    expect(
      envSchema.safeParse({ ...REQUIRED, APP_BASE_URL: "my.3set.online" }).success,
    ).toBe(false);
  });

  it("defaults ARTEMIDA_LOW_BALANCE_RUB to 500 when unset", () => {
    const parsed = envSchema.parse({ ...REQUIRED });
    expect(parsed.ARTEMIDA_LOW_BALANCE_RUB).toBe(500);
  });

  it("coerces a numeric-string ARTEMIDA_LOW_BALANCE_RUB", () => {
    const parsed = envSchema.parse({ ...REQUIRED, ARTEMIDA_LOW_BALANCE_RUB: "1234" });
    expect(parsed.ARTEMIDA_LOW_BALANCE_RUB).toBe(1234);
    expect(typeof parsed.ARTEMIDA_LOW_BALANCE_RUB).toBe("number");
  });

  it("rejects a negative ARTEMIDA_LOW_BALANCE_RUB", () => {
    expect(
      envSchema.safeParse({ ...REQUIRED, ARTEMIDA_LOW_BALANCE_RUB: "-1" }).success,
    ).toBe(false);
  });

  it("defaults WHITELABEL_HOST to sub.my.3set.online", () => {
    const parsed = envSchema.parse({ ...REQUIRED });
    expect(parsed.WHITELABEL_HOST).toBe("sub.my.3set.online");
  });

  it("accepts BOT_MODE=webhook and rejects an unknown mode", () => {
    expect(envSchema.safeParse({ ...REQUIRED, BOT_MODE: "webhook" }).success).toBe(true);
    expect(envSchema.safeParse({ ...REQUIRED, BOT_MODE: "longpoll" }).success).toBe(false);
  });
});
