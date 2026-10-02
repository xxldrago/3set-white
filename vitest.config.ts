import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Dummy values so lib/env.ts (fail-fast) can load in unit tests without a
    // real .env / database. Tests never touch the network (fake fetch) or the
    // real ARTEMIDA host. Integration tests needing Postgres remain explicit.
    env: {
      BOT_TOKEN: 'unit-test-bot-token-0000000000',
      BOT_TEST_TOKEN: 'unit-test-bot-test-token-0000000000',
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
      SESSION_SECRET: 'unit-test-session-secret-at-least-32-characters',
      WEBHOOK_SECRET: 'unit-test-webhook-secret',
      ARTEMIDA_API_KEY: 'unit-test-artemida-key',
      ARTEMIDA_BASE_URL: 'https://artemida.test/v1',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
    },
  },
});
