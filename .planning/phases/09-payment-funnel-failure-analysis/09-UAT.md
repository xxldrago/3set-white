---
status: testing
phase: 09-payment-funnel-failure-analysis
source: [09-VERIFICATION.md]
started: 2026-10-27T13:35:00Z
updated: 2026-10-27T03:50:00Z
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

### 2. Funnel conversion copy carries a % unit (MD-02)
expected: |
  Read the funnel card sub-lines on a window with a known sample (e.g. ?period=30). Cards 2-4 read
  «конверсия N% · отвал N%». Confirm the unit renders and nothing else on the card is cramped.
result: passed — resolved in code (commit ce3402a: dictionary literal now carries `%`)

### 3. Four funnel cards render 4-up at 1280 px (MD-03)
expected: |
  At 1280 px the four funnel cards sit in one row of four (not 3 + 1). Confirm it, and that the
  loading skeleton does not reflow on hydration.
result: passed — resolved in code (commit 361fb6a: `FUNNEL_GRID` lg:grid-cols-4 + matching skeleton)

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
