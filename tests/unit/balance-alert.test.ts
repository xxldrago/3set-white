import { describe, expect, it } from 'vitest';
import { classifyBalance, parseAdminTelegramIds } from '@/lib/balance-alert';

describe('balance alert classifier', () => {
  it('pins critical, low, and ok boundaries', () => {
    expect(classifyBalance({ balance: 0, currency: 'RUB', unlimited: false }, 500)).toBe('critical');
    expect(classifyBalance({ balance: 500, currency: 'RUB', unlimited: false }, 500)).toBe('low');
    expect(classifyBalance({ balance: 501, currency: 'RUB', unlimited: false }, 500)).toBe('ok');
  });

  it('handles unlimited and unavailable reads', () => {
    expect(classifyBalance({ balance: 0, currency: 'RUB', unlimited: true }, 500)).toBe('ok');
    expect(classifyBalance(null, 500)).toBe('unknown');
  });

  it('parses configured admin recipients safely and uniquely', () => {
    expect(parseAdminTelegramIds('10, 20,10, nope, -3')).toEqual([10, 20]);
  });
});
