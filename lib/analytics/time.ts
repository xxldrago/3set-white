// Moscow (Europe/Moscow) calendar-day primitives for the analytics layer.
//
// THE RULE: compute the Moscow calendar day in JS, pass values to Postgres;
// never let SQL decide what today is. `CURRENT_DATE`, `now()::date` and
// `date_trunc` resolve against the session TimeZone (Asia/Vladivostok locally,
// UTC in Docker), so the same rows would bucket into different days depending
// on where the query ran (D-15).
//
// Two helpers look similar and are NOT interchangeable:
//   - `mskDayStartInstant(label)` → the INSTANT a Moscow day begins, for
//     `timestamp(3)` window comparisons only.
//   - `mskDateKey(label)` → a UTC-midnight DATE KEY, for `@db.Date` params only.
// They differ by one day. The pg adapter serializes a JS Date by its UTC
// components (verified), so handing an MSK-start instant to a `date` column
// silently stores the PREVIOUS day.

/** Europe/Moscow is a fixed +03:00 offset (no DST since 2014-10-26). */
export const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * The Moscow calendar day of an INSTANT.
 *
 * `2026-10-19T21:00:00Z` → `"2026-10-20"` (Moscow has already rolled over).
 */
export function mskDayLabel(at: Date): string {
  return new Date(at.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The INSTANT at which a Moscow calendar day starts: `"2026-10-20"` →
 * `2026-10-19T21:00:00.000Z`.
 *
 * Use for `timestamp(3)` comparisons ONLY. NEVER pass this into a `@db.Date`
 * column or a `::date` parameter — the adapter writes UTC components, so it
 * would store the previous day. Use {@link mskDateKey} for date columns.
 */
export function mskDayStartInstant(label: string): Date {
  return new Date(Date.parse(`${label}T00:00:00.000Z`) - MSK_OFFSET_MS);
}

/**
 * The DATE KEY for a Moscow calendar day: `"2026-10-20"` →
 * `2026-10-20T00:00:00.000Z`.
 *
 * Use for `@db.Date` params ONLY (the stored value IS the MSK label). Not an
 * instant — for `timestamp` windows use {@link mskDayStartInstant}.
 */
export function mskDateKey(label: string): Date {
  return new Date(`${label}T00:00:00.000Z`);
}

/**
 * A UTC wall-clock literal (`"YYYY-MM-DD HH:mm:ss"`) for raw-SQL `timestamp`
 * comparisons — independent of the session TimeZone.
 */
export function pgTimestamp(instant: Date): string {
  return instant.toISOString().slice(0, 19).replace('T', ' ');
}

/** The first-of-month label for a day label: `"2026-10-20"` → `"2026-10-01"`. */
export function mskMonthLabel(label: string): string {
  return `${label.slice(0, 7)}-01`;
}

/**
 * Step whole calendar months from a first-of-month label and return the next
 * first-of-month label: `addMonths("2026-10-01", 3)` → `"2027-01-01"`.
 *
 * Pure string math — no Date object, so no month-length or timezone drift.
 */
export function addMonths(label: string, n: number): string {
  const year = Number(label.slice(0, 4));
  const month = Number(label.slice(5, 7));
  const index = year * 12 + (month - 1) + n;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index - nextYear * 12 + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
}
