// tests/unit/quiet-hours.test.ts
// Unit tests for Phase 13 quiet hours deferral logic (lib/worker.ts).

import { describe, it, expect } from 'vitest';
import { isQuietHoursMSK, getNextDeliveryTime } from '../../lib/worker';

describe('isQuietHoursMSK', () => {
  it('returns true for 22:00 MSK', () => {
    // 22:00 MSK = 19:00 UTC
    const date = new Date('2026-10-31T19:00:00.000Z');
    expect(isQuietHoursMSK(date)).toBe(true);
  });

  it('returns true for 23:00 MSK', () => {
    // 23:00 MSK = 20:00 UTC
    const date = new Date('2026-10-31T20:00:00.000Z');
    expect(isQuietHoursMSK(date)).toBe(true);
  });

  it('returns true for 00:00 MSK (midnight)', () => {
    // 00:00 MSK = 21:00 UTC previous day
    const date = new Date('2026-10-30T21:00:00.000Z');
    expect(isQuietHoursMSK(date)).toBe(true);
  });

  it('returns true for 08:00 MSK', () => {
    // 08:00 MSK = 05:00 UTC
    const date = new Date('2026-10-31T05:00:00.000Z');
    expect(isQuietHoursMSK(date)).toBe(true);
  });

  it('returns false for 09:00 MSK', () => {
    // 09:00 MSK = 06:00 UTC
    const date = new Date('2026-10-31T06:00:00.000Z');
    expect(isQuietHoursMSK(date)).toBe(false);
  });

  it('returns false for 12:00 MSK', () => {
    // 12:00 MSK = 09:00 UTC
    const date = new Date('2026-10-31T09:00:00.000Z');
    expect(isQuietHoursMSK(date)).toBe(false);
  });

  it('returns false for 21:00 MSK', () => {
    // 21:00 MSK = 18:00 UTC
    const date = new Date('2026-10-31T18:00:00.000Z');
    expect(isQuietHoursMSK(date)).toBe(false);
  });
});

describe('getNextDeliveryTime', () => {
  it('returns same time when not in quiet hours', () => {
    // 12:00 MSK = 09:00 UTC
    const now = new Date('2026-10-31T09:00:00.000Z');
    const next = getNextDeliveryTime(now);
    expect(next.getTime()).toBe(now.getTime());
  });

  it('returns 09:00 MSK next day when in quiet hours', () => {
    // 23:00 MSK = 20:00 UTC (in quiet hours)
    const now = new Date('2026-10-31T20:00:00.000Z');
    const next = getNextDeliveryTime(now);
    
    // Should be 09:00 MSK next day = 06:00 UTC Nov 1
    expect(next.toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });

  it('returns 09:00 MSK same day when in early morning quiet hours', () => {
    // 03:00 MSK = 00:00 UTC (in quiet hours)
    const now = new Date('2026-10-31T00:00:00.000Z');
    const next = getNextDeliveryTime(now);
    
    // Should be 09:00 MSK same day = 06:00 UTC Oct 31
    expect(next.toISOString()).toBe('2026-10-31T06:00:00.000Z');
  });
});
