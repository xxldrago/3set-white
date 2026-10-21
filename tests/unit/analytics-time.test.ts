import { describe, expect, it } from 'vitest';
import {
  MSK_OFFSET_MS,
  addMonths,
  mskDateKey,
  mskDayLabel,
  mskDayStartInstant,
  mskMonthLabel,
  pgTimestamp,
} from '../../lib/analytics/time';

describe('analytics/time — MSK primitives', () => {
  describe('verified values (the phase contract)', () => {
    it('labels an instant by its Moscow calendar day', () => {
      expect(mskDayLabel(new Date('2026-10-19T21:00:00Z'))).toBe('2026-10-20');
      expect(mskDayLabel(new Date('2026-10-19T20:59:59Z'))).toBe('2026-10-19');
      expect(mskDayLabel(new Date('2026-10-20T00:00:00Z'))).toBe('2026-10-20');
    });

    it('pins the fixed +03:00 offset', () => {
      expect(MSK_OFFSET_MS).toBe(3 * 60 * 60 * 1000);
    });

    it('mskDayStartInstant returns the INSTANT that starts the MSK day', () => {
      expect(mskDayStartInstant('2026-10-20').toISOString()).toBe('2026-10-19T21:00:00.000Z');
    });

    it('mskDateKey returns a UTC-midnight DATE KEY (not the same instant)', () => {
      expect(mskDateKey('2026-10-20').toISOString()).toBe('2026-10-20T00:00:00.000Z');
    });

    it('the two helpers differ by one day on purpose — never interchangeable', () => {
      const instant = mskDayStartInstant('2026-10-20');
      const key = mskDateKey('2026-10-20');
      expect(instant.getTime()).not.toBe(key.getTime());
      expect((key.getTime() - instant.getTime()) / 86_400_000).toBe(1);
      // Passing the instant where a date key belongs would store the previous day.
      expect(mskDayLabel(instant)).toBe('2026-10-20');
      expect(mskDayLabel(key)).toBe('2026-10-20');
    });

    it('pgTimestamp emits a UTC wall-clock literal for raw SQL comparisons', () => {
      expect(pgTimestamp(mskDayStartInstant('2026-10-20'))).toBe('2026-10-19 21:00:00');
      expect(pgTimestamp(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01 00:00:00');
    });
  });

  describe('month windows', () => {
    it('mskMonthLabel returns the first-of-month label', () => {
      expect(mskMonthLabel('2026-10-20')).toBe('2026-10-01');
      expect(mskMonthLabel('2026-10-01')).toBe('2026-10-01');
      expect(mskMonthLabel('2026-01-31')).toBe('2026-01-01');
    });

    it('MSK month start of 2026-10 is 2026-09-30T21:00:00.000Z', () => {
      expect(mskDayStartInstant(mskMonthLabel('2026-10-20')).toISOString()).toBe(
        '2026-09-30T21:00:00.000Z',
      );
    });

    it('addMonths steps calendar months and always lands on the 1st', () => {
      expect(addMonths('2026-10-01', 1)).toBe('2026-11-01');
      expect(addMonths('2026-10-01', 3)).toBe('2027-01-01');
      expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
      expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    });

    it('addMonths handles the February / leap-year boundary', () => {
      expect(addMonths('2024-01-01', 1)).toBe('2024-02-01');
      expect(addMonths('2024-02-01', 1)).toBe('2024-03-01');
      expect(addMonths('2026-02-01', 1)).toBe('2026-03-01');
      expect(addMonths('2024-01-01', 2)).toBe('2024-03-01');
      expect(addMonths('2026-01-01', 2)).toBe('2026-03-01');
    });
  });

  describe('Intl cross-check (fixed +03:00 vs the zone database)', () => {
    it('matches Europe/Moscow for every sampled instant 2020–2030 (0 mismatches)', () => {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const start = Date.UTC(2020, 0, 1);
      const end = Date.UTC(2030, 0, 1);
      const DAY_MS = 86_400_000;
      // Instant offsets inside a UTC day: midnight, mid-day and the two sides
      // of the 21:00Z MSK boundary — the exact values that flip the label.
      const OFFSETS_MS = [0, 12 * 60 * 60 * 1000, 20 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59_000, 21 * 60 * 60 * 1000];

      const mismatches: Array<{ instant: string; expected: string; actual: string }> = [];
      let samples = 0;

      for (let t = start; t < end; t += 40 * DAY_MS) {
        for (const offset of OFFSETS_MS) {
          const instant = new Date(t + offset);
          const expected = formatter.format(instant);
          const actual = mskDayLabel(instant);
          samples += 1;
          if (actual !== expected) {
            mismatches.push({ instant: instant.toISOString(), expected, actual });
          }
        }
      }

      expect(samples).toBeGreaterThan(300);
      expect(mismatches).toEqual([]);
    });
  });
});
