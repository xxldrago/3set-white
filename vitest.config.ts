import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // DB-backed suites share ONE real local Postgres, and the outbox worker /
    // reconcile scanners are global (not user-scoped). Running files in parallel
    // lets one file's drain claim another's jobs → cross-test races. Run files
    // one at a time; the suite is small (~6s) and deterministic.
    fileParallelism: false,
    // Dummy values so lib/env.ts (fail-fast) can load in unit tests without a
    // real .env / database. Pure unit tests never touch the network (fake
    // fetch) or the real ARTEMIDA host. DB-backed trial/cache tests DO hit the
    // real Postgres, so DATABASE_URL defers to the caller's env when present
    // (local Postgres) and falls back to a clearly-non-connectable dummy.
    env: {
      BOT_TOKEN: 'unit-test-bot-token-0000000000',
      BOT_TEST_TOKEN: 'unit-test-bot-test-token-0000000000',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@127.0.0.1:5432/test',
      SESSION_SECRET: 'unit-test-session-secret-at-least-32-characters',
      WEBHOOK_SECRET: 'unit-test-webhook-secret',
      ARTEMIDA_API_KEY: 'unit-test-artemida-key',
      ARTEMIDA_BASE_URL: 'https://artemida.test/v1',
      PLATEGA_MERCHANT_ID: 'unit-test-merchant-id',
      PLATEGA_SECRET: 'unit-test-platega-secret',
      PLATEGA_BASE_URL: 'https://app.platega.test',
      APP_BASE_URL: 'http://localhost:3000',
      CRON_SECRET: 'unit-test-cron-secret-000000000000',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
    },
  },
});
