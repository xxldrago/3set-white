import { describe, it } from 'vitest';

// Wave 0 stub: real known-answer HMAC vectors land in plan 01-03 (lib/auth.ts).
// These skipped placeholders prove the runner collects the spec before the implementation exists.
describe.skip('auth-widget (Wave 0 stub)', () => {
  it('accepts a good Widget hash', () => {});
  it('rejects a forged Widget hash', () => {});
  it('rejects a stale auth_date', () => {});
  it('rejects a replayed hash', () => {});
});
