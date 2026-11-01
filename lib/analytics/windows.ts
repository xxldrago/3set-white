// lib/analytics/windows.ts
// Pure MSK comparison windows for Phase 12 - WoW/MoM/days comparison.
// D-04: today's incomplete MSK day is excluded from both windows.
// D-02: auto by period (7 → WoW, 30 → MoM, 90 → previous 90 days).
// THE RULE: compute Moscow day in JS, never in SQL.

import { addMonths, mskDayLabel, mskDayStartInstant, mskDateKey } from "./time";

export interface WindowPair {
  fromDay: string;      // MSK label (YYYY-MM-DD) for start of current window
  toDay: string;        // MSK label for end of current window (end-exclusive)
  baseFromDay: string;  // MSK label for start of base window
  baseToDay: string;    // MSK label for end of base window (end-exclusive)
}

function shiftDays(label: string, delta: number): string {
  const d = new Date(mskDayStartInstant(label).getTime() + delta * 86400000);
  return mskDayLabel(d);
}

function firstOfMonth(label: string): string {
  const [y, m] = label.split('-').map(Number);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

/**
 * Build comparison windows for period in {7, 30, 90}, excluding today's incomplete MSK day.
 * Both windows are end-exclusive (toDay/baseToDay is the label of the day AFTER the last included day).
 */
export function comparisonWindows(
  period: 7 | 30 | 90,
  now: Date = new Date()
): WindowPair {
  const todayLabel = mskDayLabel(now);
  const yesterdayLabel = shiftDays(todayLabel, -1);
  
  if (period === 7) {
    // WoW: current = previous 7 complete MSK days, base = 7 days before that
    const curTo = yesterdayLabel;
    const curFrom = shiftDays(curTo, -6);
    const baseTo = shiftDays(curFrom, -1);
    const baseFrom = shiftDays(baseTo, -6);
    return {
      fromDay: curFrom,
      toDay: curTo,
      baseFromDay: baseFrom,
      baseToDay: baseTo,
    };
  }
  
  if (period === 30) {
    // MoM: current = previous MSK calendar month, base = month before that
    const thisMonthFirst = firstOfMonth(todayLabel);
    const prevMonthFirst = addMonths(thisMonthFirst, -1);
    const monthBeforeFirst = addMonths(prevMonthFirst, -1);
    // We need the last day of prev month
    // Find last day of prev month by going to start of this month and back 1
    const lastDayPrevMonth = shiftDays(thisMonthFirst, -1);
    const lastDayMonthBefore = shiftDays(prevMonthFirst, -1);
    
    return {
      fromDay: prevMonthFirst,
      toDay: lastDayPrevMonth,
      baseFromDay: monthBeforeFirst,
      baseToDay: lastDayMonthBefore,
    };
  }
  
  if (period === 90) {
    // 90 days: current = previous 90 days, base = 90 days before that
    const curTo = yesterdayLabel;
    const curFrom = shiftDays(curTo, -89);
    const baseTo = shiftDays(curFrom, -1);
    const baseFrom = shiftDays(baseTo, -89);
    return {
      fromDay: curFrom,
      toDay: curTo,
      baseFromDay: baseFrom,
      baseToDay: baseTo,
    };
  }
  
  // Fallback
  const curTo = yesterdayLabel;
  const curFrom = shiftDays(curTo, -6);
  const baseTo = shiftDays(curFrom, -1);
  const baseFrom = shiftDays(baseTo, -6);
  return {
    fromDay: curFrom,
    toDay: curTo,
    baseFromDay: baseFrom,
    baseToDay: baseTo,
  };
}

/**
 * Convert window pair to date bounds for SQL (end-exclusive)
 */
export function windowPair(period: 7 | 30 | 90, now: Date = new Date()): WindowPair {
  return comparisonWindows(period, now);
}

export function windowStartDay(period: 7 | 30 | 90): string {
  const w = comparisonWindows(period, new Date());
  return w.fromDay;
}

export function windowEndDay(period: 7 | 30 | 90): string {
  const w = comparisonWindows(period, new Date());
  return w.toDay;
}
