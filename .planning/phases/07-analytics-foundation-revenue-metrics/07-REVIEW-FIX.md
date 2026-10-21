---
phase: 07-analytics-foundation-revenue-metrics
fixed_at: 2026-10-21T20:58:18+10:00
review_path: .planning/phases/07-analytics-foundation-revenue-metrics/07-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-10-21T20:58:18+10:00
**Source review:** `.planning/phases/07-analytics-foundation-revenue-metrics/07-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-02: Coverage window excludes today; cash window includes it

**Files modified:** `lib/analytics/service.ts`
**Commit:** `86f18df`
**Applied fix:** Replaced the daily_metrics-based coverage sum with a direct query on paid orders (new `windowOrders` now includes `providerCost`). Coverage metrics (`coverageKnown`, `coverageTotal`) are now computed from `windowOrders`, ensuring today's orders are included and the window aligns with cash/ARPU/ARPPU metrics.

### WR-01: Chart / a11y surfaces show fractional rubles

**Files modified:** `components/admin/MrrSparkline.tsx`, `components/admin/MrrWaterfall.tsx`
**Commit:** `f7efc07`
**Applied fix:** Rounded all displayed MRR values to whole rubles using `Math.round()`:
- In `MrrSparkline.tsx`: header meta and screen-reader table values.
- In `MrrWaterfall.tsx`: net marker title, bar tooltips, and the sr-only data table cells.

## Skipped Issues

None — all findings were successfully fixed.

---

_Fixed: 2026-10-21T20:58:18+10:00_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
