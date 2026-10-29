---
status: complete
phase: 10-cohorts-retention-analytics
source: 10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md
started: "2026-10-29T17:00:00.000Z"
updated: "2026-10-29T17:10:00.000Z"
---

## Current Test

number: 10
name: Period selector independence
expected: |
  Open /admin/analytics as administrator (or manager). Below the existing "Скорость оплаты и выдачи" section, two new sections appear in order: "Когорты по регистрации" and "Когорты по первой оплате". Each contains a matrix (or an empty-state panel) and, above it, channel tabs "Все / Реферал / Промокод / Органика". The payer section additionally shows device tabs "Все / 1 / 2 / 3 / 4 / 5+" below the channel tabs.
awaiting: user response

## Tests

### 1. Cohort sections appear on /admin/analytics
expected: Below "Скорость оплаты и выдачи", two new sections appear in order: "Когорты по регистрации" and "Когорты по первой оплате", each with channel tabs (and device tabs on the payer section).
result: pass

### 2. Registration matrix shape (12 rows × 14 columns)
expected: The registration matrix renders 12 cohort rows (trailing 12 MSK months) and 14 columns: "Месяц" (MM.YYYY), "Размер", and M0..M11. Empty months show size 0 and "—" in every cell.
result: pass

### 3. Retained cell shows percent + absolute with gradient
expected: A cell with retained users shows "X% (retained/size)" (e.g. "42% (3/7)") with a green-tinted background whose intensity grows with the percentage. Empty/gap cells show "—" on a transparent background.
result: pass

### 4. Channel tabs filter the registration matrix
expected: Clicking "Реферал" / "Промокод" / "Органика" / "Все" updates the matrix (URL gains ?regCh=...) without a full page error; the tab shows the active state (dark background, lime text).
result: pass

### 5. Payer matrix shows revenue retention
expected: The payer matrix cells show "X% (money ₽)" (e.g. "85% (12 000 ₽)"). The M0 column shows "100% (base ₽)". A gap month shows "—".
result: pass

### 6. Device tabs filter the payer matrix
expected: Clicking device tabs "1".."5+" filters payer cohorts by the device count of the first paid order. "Все" shows all payers. Tabs wrap on narrow screens.
result: pass

### 7. Empty matrix state
expected: With no cohort data, the section shows the heading + meta and a bordered panel with "Пока нет данных для когорт: матрица заполнится после первых регистраций и оплат." No table is rendered.
result: pass

### 8. Mobile horizontal scroll
expected: On a 375px viewport the matrix scrolls horizontally inside its bordered region; tabs wrap; no layout breaks.
result: pass

### 9. No leak in RSC payload
expected: Viewing the page network/RSC payload shows cohort aggregates only — no providerCost, provider_cost, or userId fields.
result: pass

### 10. Period selector independence
expected: Changing ?period=7/30/90 does not change the cohort matrices (they always show 12×12). Only the KPI/waterfall/retention blocks react to ?period.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
