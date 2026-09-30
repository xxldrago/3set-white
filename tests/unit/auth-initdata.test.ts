import { describe, it } from 'vitest';

// Wave 0 stub: real WebAppData-path vectors land in plan 01-03 (lib/auth.ts).
describe.skip('auth-initdata (Wave 0 stub)', () => {
  it('accepts good initData', () => {});
  it('rejects tampered initData pair', () => {});
  it('rejects missing hash', () => {});
  it('rejects stale auth_date', () => {});
});
