---
status: testing
phase: 09-payment-funnel-failure-analysis
source: [09-VERIFICATION.md]
started: 2026-10-27T13:35:00Z
updated: 2026-10-27T13:35:00Z
---

## Current Test

number: 1
name: Responsive layout of the three new analytics sections
expected: |
  «Воронка платежей» (4 funnel cards + expired card), «Ошибки выдачи» (code table or bordered
  empty panel) and «Скорость оплаты и выдачи» (2 + 2 timing cards) all render below the retention
  section; the funnel collapses to one column on mobile and the error table scrolls horizontally
  inside a focusable region; a zero/empty sample shows «—», never «0 %».
awaiting: user response

## Tests

### 1. Responsive layout of the three new analytics sections
expected: |
  Open /admin/analytics as administrator at 360, 768 and 1280 px and scroll below the retention
  section. All three new sections render; the funnel collapses to one column on mobile; the error
  table scrolls horizontally inside a focusable region; a zero/empty sample shows «—», never «0 %».
result: [pending]

### 2. Funnel conversion copy without a % unit (MD-02)
expected: |
  Read the funnel card sub-lines on a window with a known sample (e.g. ?period=30). Cards 2-4 read
  «конверсия … · отвал …» — decide whether the missing % unit is acceptable copy for an operator or
  must be added to the dictionary literal.
result: [pending]

### 3. Four funnel cards render as 3 + 1 at 1280 px (MD-03)
expected: |
  At 1280 px inspect the four funnel cards as a group. Confirm whether the 3 + 1 wrap of the fourth
  card («Ключ выдан») is acceptable, or whether the funnel needs its own 4-up grid.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
