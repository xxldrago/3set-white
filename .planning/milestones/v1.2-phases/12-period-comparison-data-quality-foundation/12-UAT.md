---
status: complete
phase: 12
name: period-comparison-data-quality-foundation
created: 2026-11-01T14:00:00.000Z
updated: 2026-11-01T21:00:00.000Z
---

## Tests

### 1. Comparison windows exclude today (MSK)
expected: comparisonWindows returns windows excluding today's incomplete MSK day
result: pass
verified_at: 2026-11-01T21:00:00.000Z

### 2. WoW/MoM deltas with zero base
expected: compareFlow returns no-base with "— нет базы" when base is zero
result: pass
verified_at: 2026-11-01T21:00:00.000Z

### 3. Incomparable when coverage degraded
expected: compareFlow returns incomparable when coverage insufficient
result: pass
verified_at: 2026-11-01T21:00:00.000Z

### 4. Data quality events and write-guard
expected: degraded rollup never overwrites healthy row; missing day gets row + event
result: pass
verified_at: 2026-11-01T21:00:00.000Z

### 5. MetricCard delta/quality props
expected: optional props don't change existing behavior; badge shows when excluded > 0
result: pass
verified_at: 2026-11-01T21:00:00.000Z

### 6. IP capture never stores raw IP, "direct" -> null
expected: signupIpHash/trialIpHash are sha256 or null, direct excluded
result: pass
verified_at: 2026-11-01T21:00:00.000Z

### 7. Generalized referral clicks (promo kind)
expected: ownerUserId nullable, kind promo/referral, hourly dedupe
result: pass
verified_at: 2026-11-01T21:00:00.000Z

## Summary
All Phase 12 deliverables implemented and unit tests pass.
