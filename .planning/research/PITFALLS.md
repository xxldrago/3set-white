# Pitfalls Research

**Domain:** Adding stabilization/quality analytics features (period comparison, anomaly alerts, promo/referral fraud signals, save-list reminders, CSV export, metric dictionary) to a live Next.js 16 + Postgres 17 VPN shop.
**Researched:** 2026-10-31
**Confidence:** HIGH for code-grounded pitfalls (verified against `lib/analytics/*`, `lib/outbox.ts`, `lib/reminders-service.ts`, `prisma/schema.prisma`); MEDIUM for cross-tool CSV behavior and fraud-heuristic thresholds.

> Scope note: these are pitfalls of **adding** v1.2 features to a system that already ships v1.1 analytics, a `Notification` outbox, an expiry-reminder scan and a broadcast path. Most of the damage comes from new code silently disagreeing with — or colliding with — the existing conventions, not from greenfield mistakes.

## Critical Pitfalls

### Pitfall 1: Comparing a partial current period against a complete previous period

**What goes wrong:**
`windowStartDay(period)` in `lib/analytics/service.ts` is `mskDayLabel(Date.now() - (period-1) * DAY_MS)` — a rolling window that **includes today**, which is only partially elapsed. The previous window (`period` days before that) is complete. Naively wiring WoW as "current 7 days vs previous 7 days" therefore produces a systematic negative delta for almost the whole day (at 09:00 MSK roughly 25% of today's sales are in), and a `+`/`-` swing every time the page is refreshed. Once that delta drives alerts (Phase 13), the admin gets a "оплаты упали" alert every morning that resolves itself by evening.

The same trap appears in MoM: the current MSK month is 3 days old, the previous month has 31 days, so "MoM −91%" is arithmetically true and operationally meaningless.

**Why it happens:**
Reusing the existing `period` selector plumbing (which was designed for "last N days, inclusive of today") for a *comparison* semantic that needs two equal, complete buckets. The existing loaders were never meant to be compared; nobody wrote down what "previous period" means.

**How to avoid:**
- Define the comparison contract explicitly in Phase 12 and encode it once, e.g. `compareWindows(period)` returning `{ current: {from,to}, previous: {from,to}, partial: boolean }`.
- Default to **complete-period comparison**: for WoW use the last 7 *complete* MSK days (yesterday and back) vs the 7 before; for MoM use the last *complete* MSK month vs the month before (or a same-length trailing window, labelled as such).
- If today must be included, either annualize/pro-rate it or render the delta with a visible `неполный период` badge and **suppress alerting** on partial windows (`partial === true` → no alert).
- Put the actual date ranges in the UI next to the delta ("к 24–30 окт"), never just "к прошлой неделе".

**Warning signs:**
- Deltas are strongly negative in the morning and drift toward zero by midnight.
- Same-period numbers change on reload without new orders.
- Alert history shows the same alert firing daily around 03:00–09:00 MSK.

**Phase to address:**
Phase 12 (contract + UI), enforced in Phase 13 (alert evaluator refuses partial windows).

---

### Pitfall 2: Zero, missing and tiny baselines (NaN, Infinity, "+∞%")

**What goes wrong:**
Three distinct states get collapsed into one number:
1. **True zero baseline** (no sales last week — a new shop, a dead promo code) → `(cur - prev) / prev` = `Infinity` or `NaN`, which renders as `∞%`, `NaN%`, or `—` depending on the formatter, and sorts wrongly.
2. **Missing data** (rollup day not written, cron failed, `daily_metrics` has no row) → `buildDailySeries` in `lib/analytics/series.ts` emits an `emptyAggregate` **zero row for every day in the range**, so "no data" and "zero sales" are indistinguishable downstream.
3. **Tiny baseline** (1 order last week, 3 this week) → `+200%` delta that is pure noise, and a "оплаты выросли в 3 раза" alert on a sample of 1.

**Why it happens:**
Percentage change is written as a one-liner (`(cur/prev - 1) * 100`) in a UI helper, and the zero/missing distinction was already erased upstream (series gap-filling, `null → 0` coercions, `catch(() => null)`).

**How to avoid:**
- Model the delta as a discriminated union, not a number: `{ kind: 'absolute-only' } | { kind: 'pct', value: number } | { kind: 'no-baseline' } | { kind: 'insufficient-data' }`. Never render `Infinity`/`NaN`; render `—` plus absolute delta plus a tooltip explaining why.
- Carry a `hasData`/`sampleCount` alongside every aggregate. `buildDailySeries`'s zero rows must stay truthful for sparklines but must be paired with a "rollup row exists" set (`daily_metrics` presence by day) for comparisons.
- Guard alerts with minimum sample sizes (e.g. `paidOrders >= 10` in the baseline window) and a minimum absolute change (₽ or count) in addition to the percentage.
- Test with prev ∈ {0, 1, 2} explicitly; also test negative-free money deltas and rounding at whole-RUB boundaries.

**Warning signs:**
- The word `NaN` or `∞` anywhere in `.planning`/review diffs, or `Infinity` guard clauses appearing ad hoc in components.
- A "growth" alert on a week with 2 orders.
- A "drop" alert on a day where the rollup simply did not run.

**Phase to address:**
Phase 12 (delta model, UI, tests), consumed by Phase 13 (thresholds + sample guards).

---

### Pitfall 3: Month-length and month-boundary arithmetic done with milliseconds or on non-month-start labels

**What goes wrong:**
`lib/analytics/time.ts` already warns that `addMonths()` is pure **first-of-month string math** — `addMonths("2026-10-01", -1) → "2026-09-01"`. It takes a *month label*, not a day label. Reusing it for "same day last month" (`addMonths("2026-03-31", -1)`) silently returns `"2026-02-01"`, not `"2026-02-28"`. Equally, `Date.now() - 30 * DAY_MS` is a rolling 30-day window, not "previous month" — in March it is 30 of 31 days, in February it is 2 days longer than the month.

MSK has no DST (fixed +03:00 since 2014), so the "DST bug" people look for does not exist here; the actual bug is **bucket length inequality** dressed up as a month.

**Why it happens:**
The two helpers look interchangeable (`mskDayStartInstant` vs `mskDateKey` already cause a one-day error if swapped — the file says so explicitly). A developer reaching for "one month ago" grabs the nearest function with "month" in its name.

**How to avoid:**
- Only ever ask "which MSK months am I comparing" in month labels (`"2026-09-01"`), and derive day bounds via `mskDayStartInstant(firstLabel)` / `mskDayStartInstant(addMonths(label, 1))`.
- If a day-level "same day last month" is genuinely needed, add a **separate** clamped helper (`addMonthsClamped(dayLabel, n)`) with its own tests for 29/30/31 → 28/29 February; do not overload `addMonths`.
- Label every comparison with its true bucket length (31 vs 30 days, 28 vs 31) in the UI/tooltip; MoM on unequal months must say so.
- Prefer same-length trailing windows for anything that feeds an alert; keep calendar months for reporting only.

**Warning signs:**
- Any `new Date(...).setMonth(...)` in new code.
- `addMonths` called with a label ending in something other than `-01`.
- A February/March comparison that is off by one or two days in manual reconciliation.

**Phase to address:**
Phase 12.

---

### Pitfall 4: Degraded data that silently zeroes a metric (and overwrites healthy rollups)

**What goes wrong:**
Two coupled failure modes:

(a) **Zeroing.** A failed/timed-out/partial ARTEMIDA response becomes `0` or `null` at the boundary (`catch(() => null)` in `loadBurnRunway`, `balance` fallback in `rollup.ts`, `providerCost` nulls filtered out by `.filter(o => o.providerCost !== null)`). Downstream, `0` and "unknown" are the same value: `activeKeys` drops, `marginPct` denominators shrink (`costedOrders` vs `totalOrders`), `runwayDays` becomes `null`. The admin sees a real-looking 30% drop caused entirely by the provider being slow.

(b) **Overwriting.** `upsertDailyMetrics` writes **absolute values** (deliberately, so re-rolling 7 days self-heals). A rollup run that happened while ARTEMIDA was degraded writes *lower* `provider_cost_rub` / `active_keys` over previously correct numbers. Re-rolling later only fixes it if someone knows to re-run; there is no "this row was computed from degraded input" marker.

**Why it happens:**
The `catch` blocks were written when the value was "a nice-to-have card" (the balance snapshot comment literally says "convenience series, not an invariant"). v1.2 promotes the same numbers into alert thresholds and ROI decisions, where a silent zero is destructive.

**How to avoid:**
- Introduce an explicit provenance type at the boundary: `{ value: number } | { value: null, degraded: true, reason: 'timeout'|'http_5xx'|'partial' }`. Never let a degraded result coerce to `0`.
- Persist data-quality events (`dq_events` / flags table: day, source, metric, kind, affectedRowCount) — one row per degraded observation, so the UI can say "12 записей исключено".
- **Refuse to write** a rollup row (or write it into a `degraded` variant / skip the upsert for affected columns) when the input was degraded. Absolute-value upsert + degraded input is data loss.
- Exclude degraded rows from *both* aggregate sides and always report the excluded count next to the number ("ARPPU 412 ₽ (3 заказа исключены)").
- Regression test: seed identical orders + a degraded provider fixture, assert v1.1 numbers are byte-identical on healthy input (Roadmap success criterion 5).

**Warning signs:**
- `|| 0`, `?? 0`, `Number(x ?? 0)` on any provider-derived field.
- `activeKeys` or `costPerKey` moving on a day with no key changes.
- An alert whose explanation cannot be reproduced by re-running the loader.

**Phase to address:**
Phase 12 (flags + write-guard), read by Phase 13/14.

---

### Pitfall 5: Asymmetric exclusion — degraded current period vs healthy baseline (false "drop")

**What goes wrong:**
Phase 12 excludes degraded rows from aggregates. If the *current* window contains 3 degraded days and the *previous* window is clean, the comparison shows a drop that is an artifact of exclusion, not of business. The inverse also holds: comparing a clean current period against a previously-degraded baseline makes the business look like it is growing. Worse, a "coverage" percentage that is computed but not compared lets this pass silently.

This is the most likely way the alerting system loses credibility in week 1: it fires a real-looking drop that the owner cannot reproduce from raw orders.

**Why it happens:**
Exclusion is implemented locally in each loader ("drop bad rows here"), while the comparison layer knows nothing about coverage. Nobody writes the rule "compare only when both sides have comparable coverage".

**How to avoid:**
- Every aggregate carries `{ included, excluded, coverage }`. The comparison computes deltas only when `min(coverageCur, coveragePrev) >= threshold` (e.g. 0.95); otherwise return `{ kind: 'incomparable', reason: 'degraded' }` and render that state explicitly.
- Alert evaluator treats `incomparable` as **suppress + log**, never as "no change" and never as a drop.
- Show both coverage figures in the delta tooltip; link to the degraded-events list.
- Add a test fixture with asymmetric degraded days and assert the delta is `incomparable` (not a number).

**Warning signs:**
- Delta values move when only a `dq_events` fixture changes.
- The phrase "we excluded some rows" appears in support chat but not in the UI.
- An alert that says "оплаты упали на 40%" while total orders are flat.

**Phase to address:**
Phase 12 (contract), hard-required by Phase 13 (gate before alert).

---

### Pitfall 6: Alert dedupe keyed on the wrong thing — and a queue that cannot carry alert content

**What goes wrong:**
`enqueueNotification` is an upsert on UNIQUE `dedupeKey` with `update: {}`, so **the first key wins forever**. Consequences for alerts:

- Key includes the run timestamp / random id → every cron retry creates a new row → duplicates.
- Key includes the observed value (`alert:payments:12`) → a metric oscillating around the threshold mints a new alert per tick → spam.
- Key is only the date (`alert:payments:2026-10-31`) → the second, genuinely different incident of the same day is silently swallowed; and once the row is `done`, re-firing after a manual re-run is impossible.
- `Notification` has **no payload column**. The existing precedent, `dispatchBalanceAlert`, recovers its message by `dedupeKey.split(':')` — so alert text, threshold, actual value and period have nowhere to live. Encoding values into the key breaks dedupe (see above); encoding nothing means the Telegram message says "оплаты упали" with no number, or worse, is reconstructed from *live* data at dispatch time and shows a different value than the one that triggered it.

**Why it happens:**
The `Notification` table was built for deliveries whose content is derivable from `ticketId`/`keyId`/`userId`. Alerts are the first producer whose content is a *snapshot*, not a reference. Reusing `enqueueNotification` unchanged is the path of least resistance.

**How to avoid:**
- Introduce a first-class `Alert` table (needed anyway for ALR "история сработавших алертов" and enable/disable): `id, type, severity, windowLabel, metric, value, threshold, state ('firing'|'resolved'), firstSeenAt, lastSeenAt, resolvedAt, payload jsonb`.
- Dedupe on **business identity**, not on time or value: UNIQUE `(type, windowLabel)` (or `(type, windowLabel, band)`) — one open alert per type per evaluated window. A retried cron re-evaluates and *updates* `lastSeenAt`/value on the existing row instead of creating a new one.
- Notification rows then carry only a reference: `dedupeKey = alert:{alertId}:{telegramId}`, and the dispatcher loads the `Alert` row to render the message (snapshot at trigger time — never re-read live metrics at dispatch).
- Add an explicit `payload Json?` to `Notification` *or* (preferred) keep Notification content-free and let each dispatcher own a typed loader, following `dispatchBalanceAlert` but keyed by an id, not by parsed key segments.
- Status transitions: firing → resolved generates exactly one "восстановилось" message, keyed `alert:{id}:resolved:{telegramId}`.

**Warning signs:**
- New alert code that string-concatenates metric values into a `dedupeKey`.
- Duplicate Telegram messages minutes apart after a cron retry.
- An alert message whose number differs from the dashboard it links to.
- `lastError: 'P2002'` in worker logs, or (worse) no error and no message.

**Phase to address:**
Phase 13 (schema + evaluator + dispatcher). The `Alert` table decision must land before the evaluator is written.

---

### Pitfall 7: Alert evaluation against incomplete data, and fail-open threshold configuration

**What goes wrong:**
Three related failures:

- **Race with the rollup.** Cron order is `/api/cron/analytics` at 03:05; a new alert cron at 03:06 may read a `daily_metrics` table that has not yet been re-rolled (or was skipped because the previous run failed). "Yesterday = 0 orders" → "оплаты упали 100%".
- **Retry storm.** Host cron retries a 5xx; each retry re-evaluates. Without the window-based identity of Pitfall 6 you get N messages; with it you get N evaluations that may flip firing/resolved as data trickles in.
- **Fail-open config.** Thresholds live in `Setting` (string values, conventions already used by RFM/referrals). `Number('')` → `0`; `Number('%')` → `NaN`; `NaN > threshold` is always `false` → **the alert silently never fires**, which looks exactly like "the business is healthy".

**Why it happens:**
Settings are read ad hoc (`prisma.setting.findMany` appears in two modules, no shared validating loader). Alerts are treated as a pure function of metrics, ignoring the pipeline's own freshness.

**How to avoid:**
- Evaluate only on **sealed** days: require a `daily_metrics.computed_at` marker for the last day in the window, or evaluate strictly up to yesterday MSK. Reject evaluation with `{ skipped: 'stale_rollup' }` and log it.
- Make the alert run idempotent by design: read window → compute → upsert `Alert` by `(type, windowLabel)` → enqueue notifications keyed `alert:{id}:{telegramId}`. Retries become cheap and harmless.
- Validate thresholds through one zod-backed `getAlertSettings()` loader (`min 1`, integer, explicit defaults); on invalid config **raise an admin-visible config error alert** rather than evaluating with garbage. Add a "test alert" button that proves the pipeline works.
- Run alert evaluation *after* a successful rollup in the same cron invocation (or chain on the rollup result), and expose `lastEvaluatedAt`/`lastOutcome` in the admin UI.

**Warning signs:**
- An alert type that has never fired in the history table.
- `lastEvaluatedAt` older than the last deploy, or absent.
- Alert cron duration > rollup duration, or `429` from ARTEMIDA caused by alert evaluation.

**Phase to address:**
Phase 13.

---

### Pitfall 8: Reminder duplication — the save-list colliding with the existing 3-day reminder

**What goes wrong:**
`lib/reminders-service.ts` already scans `expiresAt <= now + 3 days` and enqueues `remind:{keyId}:{UTC-day}`. Phase 15 adds a **7-day** save-list with "push-напоминание". Three collision modes:

1. **Same namespace** → `enqueueNotification`'s `update: {}` silently swallows the new reminder (or the old one), so one of the two never sends and nothing errors.
2. **Different namespace** (`savelist:{keyId}:{day}`) → the same user gets a 7-day nudge, a 3-day reminder, and possibly a 1-day reminder — three DMs about one expiry, which is exactly the spam users report as "бот завалил сообщениями".
3. **Mass-send via broadcast** → `broadcast:{broadcastId}:{userId}` dedupes *per broadcast*, not per recipient, so a double-clicked "Отправить" creates two broadcasts and two DMs per user. The preview count is also computed at click time and can drift from the actual recipient set.

**Why it happens:**
The 3-day reminder was built as a standalone scan (`docs` say "ONE durable Notification row per key per day"). The save-list is built by a different phase, from the UI downwards, without reading the existing scan's contract.

**How to avoid:**
- **One policy module** owns the cadence: `lib/expiry-policy.ts` exporting `REMINDER_STEPS = [7, 3, 1]`, `reminderDedupeKey(keyId, step, dayLabel)` and the "which step is due today" predicate. Both the existing scan and the save-list read from it; the old `3` becomes a constant in that module, not a literal in `reminders-service.ts`.
- Dedupe key includes the **step and the MSK day**: `remind:{keyId}:{step}:{mskDay}`. Cross-step sends are then intentional and visible, and re-running the same day is a no-op.
- Save-list "send reminder" must be *idempotent per key per day*, and the bulk action must go through the broadcast machinery with a server-generated idempotency token (form nonce or `broadcastId` created server-side before the click handler can be repeated).
- Recompute recipients server-side at send time; the preview number is advisory only. Show "N получателей (обновлено)".
- Decide and document: does the save-list button *enqueue the same* reminder (then it must reuse the same key and just be a manual trigger), or a *different* campaign message (then it needs a distinct step id)? The current ambiguity is the bug.

**Warning signs:**
- Users replying "мне уже пришло" or blocking the bot.
- Two `Notification` rows per key with different types but the same day.
- A `Notification` count for a remind type that is exactly half the scanned count (silent swallow).

**Phase to address:**
Phase 15, with the key-namespace decision written down in Phase 13 (where the notification dispatcher contract is finalized).

---

### Pitfall 9: "Last 7 days" computed as a rolling millisecond horizon on stale cached keys

**What goes wrong:**
`listExpiringKeys` uses `horizon = now + 3 * 86_400_000` — a rolling 168/72-hour window, not "7 MSK calendar days". Two keys expiring at 23:50 and 00:10 on the same MSK day land in different list days, so "истекает через 7 дней" flips a day early/late, and the list an admin exports does not match what the reminder logic will actually send. Combined with the existing UTC-day dedupe (`now.toISOString().slice(0,10)`), the "day" that governs whether a reminder already went out is a **UTC** day while the list, the UI copy and the analytics are **MSK**: between 00:00 and 03:00 MSK the two disagree, so a run at 00:30 MSK and a run at 03:05 MSK can be different UTC days and send twice for one MSK day (or the same UTC day and send once across two MSK days).

On top of the timezone issue, `KeyCache` is a **cache** (`lastSyncedAt`, synced from ARTEMIDA): a key renewed directly at the provider, renewed by the `autoRenew` scan, or deleted at the provider can appear in the save-list as "истекает и не продлён". Trial keys included in `listExpiringKeys` cannot be renewed at all (ARTEMIDA constraint), so a "продлите подписку" nudge on a trial key is both wrong and undeliverable.

**Why it happens:**
Rolling durations are the easiest thing to type, and `KeyCache` reads like a source of truth even though the file comment says "cached". Trial exclusion exists in analytics (`withoutTrialOrders`, `trialRefs`) but not in the reminder scan (which deliberately *includes* trials to send a *buy* nudge — a different message).

**How to avoid:**
- Compute the save-list window in **MSK day labels**: `expiringBetween(mskDayStartInstant(todayLabel), mskDayStartInstant(addDaysLabel(todayLabel, 7)))`, and display "истекает 07.11 (через 6 дн.)" using the same label math.
- One day-key convention for the whole reminder subsystem — MSK, not UTC — and a comment explaining why it differs from the old UTC choice (if you migrate, migrate the key format **and** accept one duplicate day during rollout, or keep UTC *and* document it in the UI copy).
- Exclude `autoRenew = true` keys from "не продлённых" (or label them "автопродление"), exclude keys whose `lastSyncedAt` is older than a freshness threshold, and split trials into a separate list with **buy** copy ("trial нельзя продлить — предложите покупку").
- Re-fetch/refresh the key state for the listed set before a bulk send (provider round-trip or a forced sync), and require `status` to be active.

**Warning signs:**
- A user who renewed yesterday still receives "ваша подписка истекает".
- Save-list row count changing between two loads seconds apart with a fixed period.
- `lastSyncedAt` far behind `now` on listed keys.

**Phase to address:**
Phase 15 (and the key/day convention in Phase 12's time contract).

---

### Pitfall 10: Fraud heuristics that flag legitimate users (and miss real farms)

**What goes wrong:**
`ipHash`-based clustering on this stack has three specific, structural false-positive sources:

1. **The `"direct"` sentinel.** `clientIp()` returns the literal string `"direct"` when no `X-Real-IP`/`X-Forwarded-For` is present. Hashing that produces **one constant hash shared by every such request** — a trial-claim group that looks like a 50-account farm. Any request path that bypasses nginx (internal calls, local cron, a misconfigured proxy) lands there.
2. **CGNAT and shared egress.** Russian mobile carriers put many subscribers behind one public IP; offices, dorms and families share one too. A "≥3 accounts per ipHash" rule flags a family, not fraud.
3. **Dynamic IPs.** The actual abuser rotates IPs per signup, so ipHash clustering sees nothing — the rule is simultaneously too sensitive and too blind.

Then the false-positive damage compounds if the signal is *actionable*: blocking a trial, banning an account, or excluding a partner from ROI. A paying customer blocked as "trial farm" is a refund-and-apology event; a partner wrongly labelled "self-cycles" is a business relationship event.

On the other side, `emailCanonical` is `@unique` on `User`, so a second alias registration already 409s — the "email farm" signal is mostly historical, and treating `emailCanonical` collisions as *current* fraud evidence overstates risk.

**Why it happens:**
`ipHash` is the only cheap cross-account identifier in the schema (`TrialClaim.ipHash`, `ReferralClick.ipHash`), so it becomes the whole heuristic. Fraud features are usually specced as "show signals", then quietly harden into enforcement.

**How to avoid:**
- **Never hash the `"direct"` sentinel into the clustering population** — exclude it (and log the count) at write or read time. Add a startup/test assertion that `ipHash !== sha256('direct')`.
- Score, don't accuse: output a `fraudSignals` list per user/source with `{ signal, weight, evidence[] }`, and require **multiple independent signals** (ipHash cluster ≥ N *and* same-day registration *and* trial-only history *and* no paid order) before showing a high-confidence flag.
- Require N ≥ 5 (not 2–3), a time window (24h/7d), and a minimum cluster size relative to total signups; show the cluster size and the raw evidence so an admin can judge.
- **No automated enforcement in this milestone** — labels and lists only, with a manual "пометить как проверено/ложное срабатывание" that persists (a whitelist table) and suppresses re-flagging. Re-evaluate the rule against the whitelist before claiming precision.
- Separate "trial→no-pay ratio by source" (a *quality* metric, expected to be high for broad channels) from "fraud" (an *identity* signal). Mixing them makes every cheap channel look criminal.
- Cap the influence: fraud signals must never silently remove rows from ROI/revenue aggregates. Show "revenue excluding flagged" as a secondary line, clearly labelled.

**Warning signs:**
- A cluster whose members all share one `createdAt` minute and identical user agents (that is the `"direct"` sentinel, not fraud).
- Support tickets "почему мне не дали триал".
- A partner dashboard showing 0 registrations because they were all flagged.
- The rules file has thresholds but no "why this threshold" comment.

**Phase to address:**
Phase 14.

---

### Pitfall 11: Attribution and ROI arithmetic that double-counts or retroactively rewrites history

**What goes wrong:**
Four distinct math errors, all easy to make and all invisible until someone checks against the wallet:

- **Conversion > 100%.** Clicks are counted in period P, registrations in period P+1, payments in P+2. If numerator and denominator are each filtered by "period" independently, `register/click` can exceed 100%. The funnel must be **cohort-anchored** (clicks in P → how many registered → how many paid, ever, with an "as-of" cutoff), or explicitly labelled "period activity ratio" — not a conversion.
- **Retroactive discount cost.** `PromoCode.discount` is a *current* config row. Computing "стоимость скидки" from the promo row means editing a code from 20% to 10% silently rewrites last month's ROI. Real cost must come from the order snapshot (`originalAmount - finalAmount` per paid order), and the snapshot must actually exist on `Order` — if it does not, Phase 14 needs a migration/backfill decision, not a guess.
- **Withdrawal double-count.** Partner economics has `WalletTx` (`referral_bonus` credits, `withdrawal_hold` debits) and `Withdrawal` rows. Treating *both* "accrued bonuses" and "withdrawals" as cost counts the same money twice: a withdrawal is a payout of already-accrued bonus, not an additional cost. Correct net cost = accrued bonuses (+ any platform-paid amounts) with withdrawals used only for cash-out liability/coverage — and refunds (`order_spend_refund`, `withdrawal_refund`) must reduce the totals.
- **ROI on a zero/negative denominator.** Partner ROI = (attributed revenue − payouts) / payouts. With payouts = 0 (or only refunds), the ratio is `∞`/negative and must degrade to an absolute margin figure, not a percentage.

**Why it happens:**
The schema was shaped by the *wallet* (signed ledger, "balance is always SUM(amount)") and the *funnel* (click rows) for different purposes; ROI is the first consumer to need them joined. Promo orders store the final amount, and the "original" amount is easy to recompute from today's config — which is where the drift starts.

**How to avoid:**
- Write the formulas down **before** implementing (Phase 14 kickoff), as formulas over named tables, and reuse them verbatim in the metric dictionary (Phase 16). Definition-first, code-second.
- Funnel: pick cohort anchoring and an explicit `asOf` instant; display "клики 01–07 окт → регистрации 3 (из них оплатили 1)" so the window semantics are visible.
- Promo cost: derive per-order from stored amounts; if `Order` lacks `originalAmount`/`discountRub`, add the column with a backfill and mark pre-v1.2 orders as "unknown cost" rather than recomputing from today's promo.
- Partner ROI: define `revenue_attributed`, `bonus_accrued`, `bonus_withdrawn`, `refunded`, and state explicitly which one is the cost. Add a unit test with one bonus + one full withdrawal asserting the cost is counted **once**.
- Round money in whole RUB at the boundary and keep intermediate sums as integers (the codebase already stores whole RUB); never sum floats and divide late.

**Warning signs:**
- Conversion rates above 100% or negative ROI on active partners.
- A promo code's ROI changing after an edit that touched no orders.
- Partner "revenue" that never reconciles with `WalletTx` sums.

**Phase to address:**
Phase 14 (formulas + tests), re-stated in Phase 16 (dictionary).

---

### Pitfall 12: CSV export — formula injection, Excel encoding, locale and filter drift

**What goes wrong:**
- **Formula injection.** Any exported cell starting with `=`, `+`, `-`, `@`, tab, CR or LF is a live formula in Excel/LibreOffice/Sheets (CWE-1236). This is reachable here: ticket subjects, promo codes, user display names, partner contacts, and — subtly — any field an admin can rename. The classic "prefix with `'`" mitigation is **not reliable after Excel saves and reopens the file** (OWASP explicitly warns about this); the Excel-resistant mitigation is a leading **tab** inside the quoted field, which in turn pollutes the value for programmatic consumers.
- **Leading `-` on legitimate numbers.** Blindly prefixing every cell starting with `-` mangles negative deltas, and `+7 900 …` phone contacts. The sanitizer must distinguish typed numeric columns from free-text columns, not apply one regex to the whole row.
- **Encoding.** Without a UTF-8 BOM (`EF BB BF`), Excel on a Russian Windows locale opens Cyrillic as mojibake (кракозябры) — the top support ticket for every admin export. With BOM, programmatic parsers see a stray `\uFEFF` in the first header cell.
- **Delimiter.** Excel uses the *locale* list separator; in a Russian locale that is `;`, not `,`. A correct comma CSV lands entirely in column A. The `sep=;` pseudo-header fixes Excel but is not part of CSV and will appear as a data row to any other parser.
- **Value mangling.** `2026-10-01` may be re-interpreted as a date (fine here, but the MSK label must survive as text); long IDs/`telegramId` and 10+ digit numbers become scientific notation or lose precision; leading zeros in promo codes vanish.
- **Filter drift.** Export built from a *second* query instead of the screen's loader → different rows/columns, filters silently dropped (period, segment, search), or new columns added to the screen and forgotten in the export. Exports also tempt unbounded `findMany` (the existing loaders are already unbounded over paid orders) → memory blow-up on "all orders, all time".

**Why it happens:**
CSV looks like `rows.map(r => r.join(',')).join('\n')`. Nobody writes the threat model or the Excel matrix, and the export is added last in the phase, under time pressure.

**How to avoid:**
- One shared `lib/csv.ts` with: RFC-4180 quoting (quote if the field contains delimiter, quote, CR or LF; double interior quotes), explicit per-column `type: 'text'|'int'|'money'|'date'|'pct'`, and sanitization applied **only to text columns** for `= + - @ \t \r \n` (plus full-width variants `＝ ＋ － ＠` if you want to be thorough).
- Emit BOM by default; document the file as `UTF-8 with BOM, comma-separated`. If a `sep=;` Excel-RU variant is offered, make it an explicit second option ("Excel (RU)") and never the default.
- Neutralize rather than corrupt: for a text field starting with a risky character, prefix a tab or a zero-width-safe marker **and** keep the raw value available via a second "raw" column or a re-export flag. Do not silently alter promo codes admins need to copy.
- Dates: always emit MSK labels as ISO `YYYY-MM-DD` text and include a `period_from`/`period_to` pair in a footer or extra column so the file is self-describing.
- Generate from the **same loader** the page uses, passing through the parsed+validated filter object (zod enum for `period`, segment, search). Add a contract test asserting header set == screen column set.
- Enforce a row cap or streaming for unbounded reports; log `rows`, `filters`, `role`, `duration`.
- Set `Content-Type: text/csv; charset=utf-8`, `Content-Disposition` with an ASCII fallback filename (RFC 5987 `filename*=UTF-8''…` for Cyrillic), and `Cache-Control: no-store`.

**Warning signs:**
- A cell with `=HYPERLINK(` visible in a downloaded file.
- Cyrillic mojibake in Excel but correct in LibreOffice (= missing BOM).
- Everything in column A on a Russian Windows machine (= delimiter).
- Export row count ≠ screen row count for the same filter.
- A 200 MB response, or a Next route timing out.

**Phase to address:**
Phase 16 (shared module + contract test), with the column/filter contract inherited from Phases 12–15.

---

### Pitfall 13: Metric dictionary drifting from the code (and from what the dashboard shows)

**What goes wrong:**
A dictionary page written as prose ("ARPU = выручка / пользователи") diverges from `computeArpu` (which uses a *windowed* cash sum over the last N MSK days and `user.count()`), from the exclusion rules (`withoutTrialOrders`, degraded rows), and from the period semantics. Three months later the dictionary is the document people trust and it is wrong — worse than having no dictionary, because it launders a bug into policy.

The page also rots structurally: metrics get renamed, added (Phase 12 adds deltas to *every* metric), or split, and nobody remembers the page exists because it isn't linked from the card that shows the number.

**Why it happens:**
Documentation is written once, at the end of the milestone, from memory and from the UI. The formulas live in pure modules (`mrr.ts`, `economics.ts`, `funnel.ts`) that are pleasant to re-derive but are not machine-readable as documentation.

**How to avoid:**
- Make the dictionary a **typed registry** in code — `lib/analytics/dictionary.ts` — keyed by a `MetricId` union that the derivation modules export and the UI cards must use (`<MetricCard id="arpu" />`). `Record<MetricId, { title, formula, source, exclusions, limitations, phase }>` means a missing entry is a **TypeScript error**, not a stale page.
- Render the page from the registry; add anchor ids so each card links to `#arpu` ("как считается").
- Contract test: every metric id rendered on `/admin/analytics` (and cohorts/funnel/RFM/promo/save-list/upsell) has a registry entry, and every registry entry is referenced by at least one card — a two-way completeness check, in the same spirit as the existing `admin-analytics-phase*-contract.test.ts` files.
- Include the *known limitations* field explicitly (trial exclusion, degraded-data exclusion, whole-RUB rounding, MSK windows, partial-period policy) — those are precisely the facts that get forgotten.

**Warning signs:**
- A formula in the dictionary that cannot be found verbatim in a `.ts` file.
- A new metric card shipped in Phase 12–15 with no dictionary entry (should fail CI).
- The dictionary mentioning a period selector behaviour that the page no longer has.

**Phase to address:**
Phase 16, but the `MetricId` union must be introduced in Phase 12 so later phases inherit the constraint (retrofitting a union across 5 phases of cards is the expensive path).

---

### Pitfall 14: Upsell radar built on stale traffic and plans where "heavy" is undefined

**What goes wrong:**
`KeyCache.trafficUsedBytes` and `trafficLimitBytes` are provider snapshots refreshed by a sync (`lastSyncedAt`); `trafficLimitBytes` is `null`/`0` for the project's default **unlimited** plan. So "тяжёлый пользователь на низком тарифе" has three failure shapes: (a) recommendations computed on traffic data that is hours/days stale, (b) `limit = 0` treated as "100% used" (division by zero → every unlimited user is "heavy"), (c) `devices` count from the cache disagreeing with the live provider after the user added/removed devices. Upsell suggestions are then sent to users already on the top plan, or to users whose usage was a one-off download.

**Why it happens:**
`0 = unlimited` is a documented project decision (`trafficLimitGb=0`), but `0` is also the natural "no data" value; and the radar is specced as a filter over cached columns.

**How to avoid:**
- Freshness gate: exclude (or flag "устарело") rows with `lastSyncedAt` older than N hours; show the timestamp.
- Explicit unlimited handling: `trafficLimitBytes === null || 0` → bucket as "unlimited" and **exclude from the low-tariff heavy-user rule**; if you still want a signal there, use absolute usage (GB/month) with a separate label.
- Use a trailing *window* of usage, not a single snapshot, and require sustained usage (e.g. 3 of the last 7 days above threshold) before calling someone heavy.
- Exclude users already on the top device/tier combination, and exclude trial keys (cannot upgrade).
- Show "оценка потенциального апгрейда" as an *estimate* with the assumption written next to it (delta devices × price), never as expected revenue in a KPI.

**Warning signs:**
- 80% of users in the radar.
- Recommendations for users already on 10 devices.
- Radar row count swinging wildly hour to hour.

**Phase to address:**
Phase 15.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Computing deltas in the React component instead of a pure module | No loader changes | Zero-baseline/partial-period rules diverge per card; untestable | Never — Phase 12 owns a pure `comparePeriods` with tests |
| Reusing `Notification` with alert data encoded in `dedupeKey` | No migration | Value-in-key breaks dedupe; no history; message cannot match the trigger snapshot | Never |
| Prefixing every CSV cell with `'` to stop formulas | One-line fix | Corrupts numbers/phones; unreliable after Excel re-save; breaks programmatic import | Never — typed columns + tab/text handling |
| Treating degraded provider responses as `null → 0` | Cards never break | Silent metric zeroing → false alerts → lost trust in the whole dashboard | Never for anything that feeds an alert |
| `Number(setting.value)` for thresholds | No loader | `NaN` comparisons fail open (alert never fires) | Never — one zod-validated settings loader |
| Skipping the `Alert` table, deriving history from `notifications` | Less schema work | No firing/resolved state, no values, no enable/disable without deleting rows | Only if alerts stay purely informational (they don't — ALR requires history + toggles) |
| Fraud rules acting directly (block trial / exclude partner) | Feels decisive | One false positive = refund + apology; unrecoverable trust damage | Never in v1.2 — labels only, manual review |
| Unbounded `findMany` for exports | Simple | OOM/timeouts; already the pattern in `loadPaidOrders` | Acceptable ≤ ~50k rows with a hard cap + stream; add cap before enabling "all time" |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ARTEMIDA (`getBalance`, key/traffic lists) | Calling it per metric/per alert evaluation; a timeout becomes `0` | One call per run, cached within the request; `{value, degraded}` provenance; never alert on a degraded input |
| ARTEMIDA 429/502/503 | Alert cron retries amplify load and trigger more degradation | Backoff honoring `Retry-After` (`p-retry` already the chosen tool); alert evaluator is idempotent so retries are free |
| Telegram bot delivery | Assuming `sendMessage` succeeded; treating 403 (blocked) as retryable forever | Distinguish terminal (403/blocked, chat not found) from retryable (429, 5xx); record outcome; never count "sent" as "delivered" in reporting |
| `/api/cron/*` routes | New routes that authenticate loosely, or run when `CRON_SECRET` is unset | Copy the existing shape verbatim: `timingSafeEqual` + length guard + `503 disabled` when the secret is unset + no secrets in the response |
| Postgres `@db.Date` | Passing `mskDayStartInstant` into a date column (stores the previous day) | `mskDateKey()` for date params, `mskDayStartInstant()` for timestamp windows — the distinction is documented in `lib/analytics/time.ts` |
| `Notification` queue | Enqueueing an alert with no recipient (`userId: null`) and no dispatcher that knows how to resolve one | Admin alerts need explicit recipient ids baked into the dedupe key (existing `balance:*` precedent) and a per-admin dispatch loop |
| Next.js App Router | Caching an export or an analytics read | `export const dynamic = 'force-dynamic'` (existing convention) + `Cache-Control: no-store` on downloads |
| Prisma migrations | Adding `Alert.payload jsonb` / `Order.originalAmount` mid-milestone with `migrate dev` on prod | `prisma migrate deploy` in the container entrypoint; backfill script separate from the migration |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Each metric block recomputing its own comparison (2× the work, plus N+1 queries) | Analytics page load creeping from 0.8s → 4s | Compute the current+previous series **once** per request and pass it down; `Promise.all` across blocks is already the pattern | ~5k orders / 12 blocks |
| `loadPaidOrders()` (unbounded) called again for each comparison | Memory + latency doubling; Postgres seq scan per block | One shared read of paid orders per request; add a `paidAt >=` bound for comparison windows | ~20k–50k orders |
| Alert cron re-reading all history per type per run | Cron duration minutes; host cron overlapping the next run | Single window read per run, all alert types evaluated from the same snapshot; record `runId` | 4 alert types × daily is fine; per-metric unbatched queries are not |
| Fraud grouping over all trial claims/clicks | `/admin` slow or DB CPU spike | Group-by on `ipHash` needs an index (`trial_claims.ip_hash`, `referral_clicks.ip_hash`); restrict to the analysis window | ~10k trial claims |
| CSV export of all orders in one `findMany` + string concat | Route timeouts, 100+ MB strings, worker OOM | Stream rows, cap the window, use `ReadableStream`/chunked writing | ~50k rows |
| RFM/segment join added to save-list queries | Save-list page timeouts after Phase 14 tables land | Precompute segment membership (already `user_rfm`), join by `userId` with an index | ~50k users |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unsanitized CSV cells (`=`, `+`, `-`, `@`, tab, CR, LF) | Formula/DDE injection → data exfiltration or code exec on the admin's machine (CWE-1236) | Typed columns in `lib/csv.ts`; strip/neutralize only free-text; test with `=cmd\|' /C calc'!A0` fixtures |
| Export route guarded only by the page layout, not the route | A direct `GET /api/admin/export?...` bypasses `requireRole` (the codebase already notes RSC payloads skip layouts) | Re-run `requireRole` in every export handler; per-section role matrix (partner must not export finance) |
| Alert content leaking revenue/PII into the wrong chat | Revenue numbers or a user's contact DM'd to a group if a chat id is misconfigured | Alert template carries aggregates only; explicit admin recipient list from env (`parseAdminTelegramIds` pattern); no user PII in alert bodies |
| Fraud lists exposing raw-ish identifiers | `ipHash` + email canonical + telegram id in an export = re-identification set | Export only pseudonymous counts; keep raw `ipHash` in the UI behind admin role; never include raw IPs (they aren't stored — keep it that way) |
| New cron route with ad-hoc auth | Open endpoint that recomputes/enqueues mass notifications | Copy `safeEq` + 503-when-unset; one shared helper to avoid five divergent copies |
| Export filename/headers reflecting user input | Header injection via `Content-Disposition` | Fixed filename + ISO date; RFC 5987 encoding; no user-supplied text in headers |
| Logging full CSV rows or alert payloads | Secrets/PII in logs | Log counts and filter summary only (existing logger discipline: typed codes, never provider text) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Delta shown without the compared dates | "−18%" against what? Admin cannot trust or verify | Always show the bucket ("к 24–30 окт"), plus a tooltip with coverage/exclusions |
| `—`, `0%`, `∞%` used interchangeably | Admin reads "no change" when data is missing | Distinct states: `нет базы`, `недостаточно данных`, `несопоставимо (degraded)`, `—` |
| Delta subtitle on *every* metric including point-in-time MRR/ARR | MRR "delta WoW" implies a flow metric; it is a stock | Apply comparisons to windowed metrics; for stock metrics compare snapshots (1st of month vs 1st of previous) and label it |
| Alerts with no runbook | Admin sees the alert, doesn't know what to do, mutes the bot | Each alert carries: what happened, the value/threshold, the compared windows, and 2–3 concrete next steps + a link to the relevant dashboard block |
| Alert with no "resolved" message | Admin cannot tell whether it is still firing | Firing/resolved pair; history page with state badges and mute toggles |
| Save-list nudge for trial users saying "продлите" | Users click, hit the trial-renew block, lose trust | Trial-specific copy ("trial нельзя продлить — оформите подписку"), separate list section |
| Bulk send with a stale preview count | Admin sends to more/fewer people than promised | Server-side recipient recompute + "обновлено" label; idempotency token per send |
| Dictionary page disconnected from the numbers | Nobody reads it; when they do, it is stale | "как считается" deep link on every card, two-way contract test |
| CSV opened in Excel as one column / mojibake | Immediate "экспорт сломан" verdict | BOM + comma default, documented Excel-RU variant, and a one-line note in the UI ("для Excel: UTF-8 с BOM") |
| Upsell radar without assumptions | Admin sends "вам нужен апгрейд" to someone at 2% usage | Show the evidence (usage window, devices, plan) next to each recommendation |

## "Looks Done But Isn't" Checklist

- [ ] **Period comparison:** Often missing the `partial` flag — verify a mid-day reload does not change yesterday's delta and that today's window is either excluded or labelled.
- [ ] **Period comparison:** Often missing zero/missing-baseline branching — verify prev=0, prev=1, no-rollup-row and degraded-row cases all render distinct states (no `NaN`/`∞`).
- [ ] **Data-quality flags:** Often missing the *write* guard — verify a degraded rollup run cannot overwrite previously healthy `daily_metrics` values (test with a degraded fixture, then re-read the row).
- [ ] **Data-quality flags:** Often missing asymmetry handling — verify a degraded current window vs clean baseline yields `incomparable`, not a number, and that no alert fires.
- [ ] **Alerts:** Often missing business-identity dedupe — verify two consecutive cron runs (and a manual trigger) produce one alert row per `(type, window)` and one Telegram message per admin.
- [ ] **Alerts:** Often missing the message payload — verify the Telegram text contains the value/threshold that triggered it, and that it does not change when metrics move before dispatch.
- [ ] **Alerts:** Often missing fail-closed config validation — verify an invalid/empty `Setting` value produces a visible config error, not silence.
- [ ] **Alerts:** Often missing the enable/disable + history read path — verify toggling a type off in `Setting` stops new rows and messages without a deploy.
- [ ] **Save-list:** Often missing trial/autoRenew/freshness exclusions — verify a renewed key, an `autoRenew` key, a trial key and a stale `lastSyncedAt` key each land in the correct bucket/copy.
- [ ] **Reminders:** Often missing namespace coordination with `remind:{keyId}:{day}` — verify one key expiring in 6 days yields exactly one message that day, and zero after a second manual scan.
- [ ] **Bulk send:** Often missing idempotency — verify double-clicking "Отправить" produces one broadcast and one message per user.
- [ ] **Fraud:** Often missing the `"direct"` sentinel exclusion — verify `sha256('direct')` is not in the clustering population and that a header-less request path cannot create a fake cluster.
- [ ] **Fraud:** Often missing "labels only" enforcement — verify no code path blocks a trial, deletes a user, or removes rows from revenue aggregates based on a signal.
- [ ] **Promo/partner ROI:** Often missing per-order discount snapshots — verify editing `PromoCode.discount` does not change last month's ROI.
- [ ] **Partner ROI:** Often missing withdrawal/bonus reconciliation — verify one accrual + one withdrawal yields cost counted once, and refunds reduce it.
- [ ] **CSV:** Often missing the injection test — verify a ticket subject of `=HYPERLINK("http://x","y")` is neutralized, while a numeric `-1500` delta stays a number.
- [ ] **CSV:** Often missing BOM + minimal quoting rules — verify Cyrillic renders in Excel and a field containing `,`/`"`/newline round-trips.
- [ ] **CSV:** Often missing filter parity — verify export row count == screen row count for `period=7`, `period=90`, a segment filter, and a search term.
- [ ] **Dictionary:** Often missing two-way coverage — verify every rendered metric has an entry and every entry is reachable; CI test, not a manual check.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Alert storm after deploy | LOW | Kill switch: disable alert types in `Setting`/env; `UPDATE notifications SET status='done'` for pending alert rows; fix dedupe key; replay only the last sealed window |
| Duplicate expiry reminders already sent | MEDIUM | Can't unsend: send one short correction ("напоминание продублировалось"), fix the key namespace, add a per-user daily cap and a scan-in-progress lock |
| Degraded rollup overwrote healthy days | MEDIUM | Re-run `/api/cron/analytics` backfill for the affected MSK days (absolute upsert is self-healing); mark those days `dq`-dirty in the meantime so alerts exclude them |
| False "payment drop" alert shipped to the owner | MEDIUM | Mark the alert `resolved` with a note; add the missing coverage/partial guard; publish the rule in the alert runbook so trust is restored explicitly |
| Fraud false positive labelled a paying customer | MEDIUM–HIGH | Whitelist the user, remove the label from any exported list, check whether any automated exclusion ran (should not exist), and lower the rule's confidence tier |
| Promo ROI retroactively wrong | MEDIUM | Backfill per-order discount snapshots where possible; mark orders without snapshots as `cost_unknown` and show ROI with an explicit "неполные данные" caveat rather than a silent recompute |
| CSV with mojibake / one-column Excel already circulated | LOW | Ship the BOM + delimiter fix, add an "Excel (RU)" variant, and re-export; no data was corrupted, only presentation |
| CSV formula delivered to an admin's machine | HIGH | Treat as a security incident: rotate any secret reachable from that machine, audit which export fields are free text, add the injection fixture test before re-enabling |
| Metric dictionary found to be wrong | LOW | Registry + contract test converts prose into code; publish a "definitions v2" note so historical screenshots are interpretable |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Partial vs complete period comparison | Phase 12 | Test: delta unchanged between 09:00 and 23:00 MSK; `partial` badge rendered; alert evaluator rejects partial windows |
| Zero/missing/tiny baseline | Phase 12 | Unit tests for prev ∈ {0,1,2, no-row, degraded}; no `NaN`/`Infinity` in rendered HTML |
| Month-length / month-label arithmetic | Phase 12 | Tests: Jan→Feb, Mar→Feb (clamp), 31-day vs 30-day labelling; no `setMonth` in the diff |
| Degraded data zeroing metrics / overwriting rollups | Phase 12 | Degraded fixture: rollup row not overwritten, `excluded` count shown, v1.1 numbers byte-identical on healthy fixture |
| Asymmetric exclusion → false drop | Phase 12 (+ gate in 13) | Fixture with degraded current + clean previous returns `incomparable`; no alert row created |
| Alert dedupe on wrong identity + no payload | Phase 13 | Run the cron twice + manual trigger: one `Alert` row, one DM per admin, message value == trigger snapshot |
| Incomplete data / fail-open thresholds | Phase 13 | Stale-rollup guard test; invalid `Setting` produces a visible config error; `lastEvaluatedAt` visible in UI |
| Reminder duplication / save-list collision | Phase 15 (contract decided in 13) | One key across 7/3/1-day steps yields exactly 3 messages total, each once; double-click bulk send → one broadcast |
| Rolling ms horizon / UTC-vs-MSK day / stale KeyCache | Phase 15 | Boundary tests at 23:50/00:10 MSK; renewed/autoRenew/trial/stale keys land in the right bucket |
| Fraud false positives (`"direct"`, CGNAT, dynamic IP) | Phase 14 | Test that `"direct"` is excluded; cluster rules require N≥5 + multi-signal; no enforcement path exists in the diff |
| Attribution/ROI double counting | Phase 14 | Conversion ≤ 100% on cohort fixture; promo edit does not change historical ROI; accrual+withdrawal counts cost once |
| CSV formula injection / encoding / locale | Phase 16 | Injection fixtures neutralized; numeric negatives intact; Excel opens Cyrillic correctly; delimiter documented |
| CSV filter drift / unbounded export | Phase 16 | Export vs screen row-count parity per filter; row cap/streaming active |
| Metric dictionary drift | Phase 16 (union introduced in 12) | CI contract test: two-way `MetricId` ↔ rendered cards coverage |
| Upsell radar on stale/unlimited data | Phase 15 | Unlimited and stale rows excluded/flagged; radar size sane vs total users |

## Sources

- Codebase (HIGH — read directly, 2026-10-31): `lib/analytics/time.ts` (`addMonths` first-of-month-only contract; `mskDateKey` vs `mskDayStartInstant` one-day trap), `lib/analytics/series.ts` (`emptyAggregate` for every day in range), `lib/analytics/service.ts` (`windowStartDay` includes today; `catch(() => null)` for balance; `coverageKnown/coverageTotal`), `lib/analytics/rollup.ts` (absolute-value upsert; balance snapshot `DO NOTHING`), `lib/outbox.ts` (`enqueueNotification` upsert `update: {}`; dedupeKey semantics; `broadcast:{id}:{user}`), `lib/balance-alert.ts` (message reconstructed from `dedupeKey.split(':')`), `lib/reminders-service.ts` (3-day `WINDOW_DAYS`, `remind:{keyId}:{UTC-day}`), `lib/keys-service.ts` (`EXPIRING_WINDOW_MS = 3 days`), `lib/client-ip.ts` (`"direct"` sentinel), `lib/email-canonical.ts`, `prisma/schema.prisma` (`Notification` has no payload; `KeyCache` cached + `autoRenew`; `PromoCode.discount`; `WalletTx`/`Withdrawal`; `Setting` string values; `DailyMetric` date-key comment), `app/api/cron/*/route.ts` (CRON_SECRET shape), `app/admin/analytics/page.tsx` (force-dynamic, per-block try/catch).
- OWASP — *CSV Injection* (https://owasp.org/www-community/attacks/CSV_Injection): `= + - @`, tab/CR/LF and full-width variants; apostrophe mitigation unreliable after Excel re-save; tab-prefix as Excel-resistant mitigation. MEDIUM-HIGH.
- CWE-1236 — *Improper Neutralization of Formula Elements in a CSV File* (https://cwe.mitre.org/data/definitions/1236.html): mitigation options and their "moderate" effectiveness. MEDIUM.
- *Comma Separated Vulnerabilities: Detecting Formula Injection in the Wild* (USENIX WOOT '25, 2025-07): real-world prevalence of formula injection in user exports; apostrophe behavior differs across Excel/LibreOffice/Sheets/Numbers. MEDIUM.
- Excel UTF-8-BOM and locale-delimiter behavior (`sep=;` pseudo-header, `;` list separator in European/RU locales) — community/tooling write-ups, consistent across sources. MEDIUM.
- Project sources: `.planning/PROJECT.md` (trial cannot renew/upgrade; single server; RU/RUB; secrets in env), `.planning/REQUIREMENTS.md` (ALR/PRM/EXT), `.planning/ROADMAP.md` Phase 12–16 goals and success criteria.

---
*Pitfalls research for: v1.2 stabilization & quality features on an existing analytics stack*
*Researched: 2026-10-31*
