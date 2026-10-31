# Project Research Summary — v1.2 «Стабилизация и качество»

**Project:** 3set-white — сервис продажи VPN (Telegram bot + Next.js PWA cabinet + admin analytics)
**Domain:** Adding monitoring/quality features (period deltas, anomaly alerts, promo/referral ROI + fraud, retention worklists, CSV export, metric dictionary) to an **already-shipped** production app
**Researched:** 2026-10-31
**Confidence:** HIGH on stack and architecture (ground-truthed against this repo's `package.json`, `prisma/schema.prisma`, `lib/*`); MEDIUM on feature expectations and fraud/alert heuristics (cross-verified across 8 product families); HIGH on pitfalls (each traced to a specific line in this codebase)

> **Roadmap status:** `.planning/ROADMAP.md` for v1.2 (Phases 12–16) **already exists and is approved**. This document does **not** restructure it — the 12→13→14→15→16 order is confirmed correct by all four research streams. It does flag **six scope additions/adjustments** (S1–S6) and **six owner decisions** (D1–D6) that need an answer before planning Phase 12 (see §"Scoping changes to ROADMAP.md" and §"Open Product Decisions").

---

## Executive Summary

This milestone is not greenfield: v1.1 already ships `lib/analytics/*` (pure derivation modules + `*-service.ts` loaders + RSC pages), a `Notification` outbox with a worker drain, a `CRON_SECRET`-gated cron family, an expiry-reminder scan, a broadcast path, and a `Setting` KV for no-deploy config. Every v1.2 feature fits the existing three-layer discipline — **pure module → service loader → RSC page / cron route** — and the research conclusion is unusually strong on the stack dimension: **zero new runtime dependencies, zero new dev dependencies, no new services.** The only genuinely new things are three pieces of persisted state (`alert_events`/`Alert`, `data_quality_events`, `promo_clicks`), one nullable `User` column (`signupIpHash`), a handful of `Setting` keys, and ~six pure modules. CSV export is ~60–120 lines of owned RFC 4180 code (`lib/csv.ts`), not a library.

The dominant risk is **not** code volume; it is **trust in the numbers**. Six of the fourteen pitfalls are the same failure in different clothes: a value that looks real but isn't. A comparison window that includes a partially-elapsed today produces a systematic morning "payments dropped 40%" that resolves itself by evening. A degraded ARTEMIDA response coerced to `0` zeroes `activeKeys`/`marginPct`. A degraded rollup run **overwrites** previously healthy `daily_metrics` rows because `upsertDailyMetrics` writes absolute values. Asymmetric row-exclusion between the current and previous window manufactures a drop that no raw query can reproduce. An alert whose dedupe key encodes the observed value mints a new alert per tick, or — worse — a `Notification` row with no payload forces the message to be reconstructed from live data at dispatch time, so the DM disagrees with the dashboard it links to. Mitigation is consistent across all streams: pure modules with discriminated-union results (`{kind:'pct'|'no-baseline'|'incomparable'…}` — never `NaN`/`∞`), provenance carried as `QualityStamp`, a rollup write-guard, and alert dedupe on **business identity** with the trigger snapshot persisted in a table, not in a string key.

The third theme is **forward-only data capture**. Two facts needed by Phase 14 do not exist today and cannot be backfilled: generic (ownerless) promo-code clicks (`referral_clicks.owner_user_id` is `NOT NULL` and only partner codes are resolved by `/api/referrals/click`) and an account-level IP hash (`ipHash` exists only on `referral_clicks` / `telegram_login_tokens`). Both must ship in **Phase 12**, roughly half a plan each, or Phase 14's success criteria ("воронка click → register → pay по каждому коду", "trial-фермы по ipHash") will be demonstrably hollow for weeks. Symmetrically, the **metric registry** (`MetricKey` union + ids) must be frozen in Phase 12 — otherwise Phase 16's dictionary becomes a five-phase retrofit and a stale prose page nobody trusts.

---

## Key Findings

### Recommended Stack

**Nothing to install.** `npm install` adds no packages for v1.2. Every capability is served by what is already in the repo or by a Node 24 built-in: Prisma 7.10 `groupBy`/`$queryRaw` (`percentile_cont` for baselines), `zod@4.6.5`, pino, `Notification`+`dedupeKey`, `Setting`, `Intl.NumberFormat('ru-RU')`, `ReadableStream`/`TextEncoder`, and the existing cron routes plus `lib/worker.ts` tick. Nine candidate libraries were evaluated and rejected with reasons (`papaparse`, `csv-stringify`, `bullmq`, `croner`, `simple-statistics`, `next-mdx-remote`, `recharts`, `date-fns`, `web-push`).

**Core technologies (all already installed, used as-is):**
- **Next.js 16.3.7 Route Handlers** — CSV download endpoints + alert-config mutations; streaming `Response` is native in the Node runtime where Prisma lives
- **Prisma 7.10.0** — `groupBy` covers ~90% of new aggregates; `$queryRaw` only for `percentile_cont` medians; migrations for the 3 new tables + 1 column
- **Postgres 17** — window aggregates, unique dedupe indexes; **no** time-series DB (`daily_metrics` already holds one row per MSK day)
- **`lib/analytics/time.ts`** — the only calendar authority; `mskDateKey` for `@db.Date`, `mskDayStartInstant` for timestamps. **Never** `CURRENT_DATE`/`date_trunc` in SQL (repo rule D-15)
- **`Notification` + `enqueueNotification` + `drainNotificationType`** — the entire delivery layer; dedupe is a DB unique constraint, not app logic
- **`Setting` + a new `lib/settings.ts`** — thresholds/toggles without deploy (the 4th ad-hoc Setting parser would be the smell; consolidate first)
- **`lib/csv.ts` (hand-rolled)** — RFC 4180 writer, BOM, CRLF; own the escaping and the injection guard

**Verified baseline corrections to older docs (do not re-litigate, just note):**
- `react` is **19.2.8**, not 19.3.0 as the v1.0 stack doc assumed. Pin as-is; no bump needed.
- **`@serwist/next` is NOT installed.** The PWA is manifest-only (`app/manifest.ts`, no `public/sw.js`). Consequence: there is **no service-worker push channel**, which is why Web Push for admin alerts is rejected on architectural grounds (it would drag in Serwist, VAPID secrets, a `PushSubscription` table, three permission-prompt surfaces and iOS-Safari caveats). Telegram already reaches the phone.

**`lib/csv.ts` — the STACK.md sketch is necessary but not sufficient.** STACK's ~20-line `toCsv` handles BOM/CRLF/quoting; it does **not** handle the two things PITFALLS and FEATURES both insist on:
1. **Typed columns** — `text | int | money | date | pct`. Sanitization must apply to *text only*; otherwise a legitimate `-1500` delta or a `+7 900 …` phone is mangled.
2. **Formula-injection neutralization** (OWASP / CWE-1236) — any **text** cell whose first non-space char is `= + - @ \t \r \n` gets neutralized inside the quoted field. The classic `'` prefix is unreliable after Excel re-saves; the Excel-resistant mitigation is a leading tab, which pollutes the value for programmatic readers — hence "neutralize *and* keep a raw column / re-export flag".
3. **Row cap** (~50 000) with an explicit `обрезка: N из M` notice; silent truncation is worse than refusal.

**Delimiter:** default `,` per RFC 4180 with BOM (BOM is mandatory — without `\uFEFF` Excel-RU renders Cyrillic headers as mojibake). Do **not** emit a `sep=;` pseudo-header by default; if RU-locale Excel complaints appear, expose an explicit `?delimiter=;` (zod-validated to `/[,;]/`) labelled "Excel (RU)" — never a silent default. Route must be `runtime = 'nodejs'` (Prisma is Node-only) and `dynamic = 'force-dynamic'`.

→ Full detail: `STACK.md`

### Expected Features

The single-operator filter dominates every recommendation: one person reading alerts on a phone, ~10² orders/week, no on-call rotation, no data team. Anything that needs a specialist to tune, or can page at 3 a.m. for noise, is demoted to an anti-feature.

**Must have (table stakes):**
- Delta (abs + %) on **every** KPI at the period selector's length — one shared `comparePeriods` helper + delta pill; must cover revenue, LTV, churn, funnel, cohorts, RFM, not just the top row
- Explicit zero/absent/`incomparable` baseline states — `—` for `prev = 0`, `0%` for `0 → 0`, `—` when the window predates data; never `∞`/`NaN`
- Direction-aware colouring (`goodDirection: 'up'|'down'` on the registry) — "up" is bad for failed-rate, churn, refunds, runway
- Equal-length, immediately-preceding, MSK-aligned windows; **partial-period honesty** (`неполный` badge; alerts suppressed on partial windows)
- Per-metric data-quality badge with exclusion counts + last successful sync
- **4** alert rules (payments drop, failed-share spike, ticket spike, runway low) — with dedupe, cooldown, history, per-rule toggle/threshold in `Setting`
- Per-code and per-partner funnel click → register → pay (`lib/referral-stats.ts#funnelStats` already exists for partners — extend, don't rebuild)
- Discount cost / revenue / attributed ROI per promo code; partner economics **including withdrawals**
- Fraud **signals, not verdicts**; expiry save-list (≤7 days, non-trial, not renewed) with contacts; idempotent stage-aware reminders
- Upsell radar on real usage signals with freshness guard; CSV export that equals the screen; metric dictionary with formula + source + caveats

**Should have (differentiators):**
- Delta vs a **second** reference (28-day mean) beside the previous period — separates "trend" from "last week was weird"
- "Meaningful change" bands (±3% money / ±1 pp rates, registry-driven) to kill the Christmas-tree dashboard
- Alert **digest** + quiet hours as first-class features; alert history with acknowledgement and "why it fired" evidence
- Data-quality **trust banner** + per-metric `data_quality` column inside exports
- Promo **honesty panel**: new-vs-returning payer split + break-even new-order share + "ROI по атрибуции" label
- Fraud **cluster view** (accounts + shared attribute + money trail) with dismiss/allowlist
- Save-list ranked by **value at risk** with conversion measurement; bulk send with recipient-count preview; upsell showing **net uplift after provider cost**

**Defer (v1.2.x / v2+):**
- Alert digest tuning / per-rule quiet-hour override; save-list `T-0` reminder; deeper fraud graph; promo holdout experiments
- Web push to PWA (no SW exists); warehouse/BI sync + scheduled email reports; automatic fraud enforcement / payout holds; incremental-lift modelling

**Anti-features (explicitly rejected, with reasons):** full alerting stack (PagerDuty/on-call/20 rules), ML/z-score/seasonal detection at single-digit orders/day, real-time per-payment alerts, auto-ban on fraud signals, device fingerprinting / third-party fraud SDK, IP-range blocking, auto-discount for lapsing users, automatic upsell DMs, arbitrary segment builder / SQL console, warehouse export, XLSX with formulas/merged headers, PNG dashboard export, auto-resolving alerts by muting, alerting on every metric.

→ Full detail: `FEATURES.md` (includes per-feature behaviour contracts A–H: delta contract, alert contract with exact thresholds/floors/cooldowns, ROI formulas, fraud false-positive profiles, save-list cadence, upsell criteria, dictionary content model, CSV contract)

### Architecture Approach

No new architectural concept is required. The two hard constraints that shape everything: (1) `lib/analytics/*.ts` except `service.ts`/`rfm-service.ts` are **pure** — no prisma, no `next/*`, no React; every new derivation is a pure module with unit tests, every new DB read lives in a `*-service.ts`. (2) Money/analytics numbers are **never re-derived in components, never SQL-side bucketed, never MSK-shifted inline** — `time.ts` is the only calendar authority, `series.ts#cashOf` the only cash authority.

**Major components (delta only):**
1. **`lib/analytics/windows.ts` + `compare.ts`** (pure) — `windowBounds`/`previousWindow` policy, `deltaOf(current, previous): {abs, pct, base}`. Separate from `time.ts` so the locked calendar primitives and their one-day-trap tests stay untouched.
2. **`lib/analytics/compare-service.ts`** — a *sibling* of the 804-line `service.ts`, not more of it; makes the 2× read cost visible and keeps the v1.1 regression surface small.
3. **`lib/analytics/quality.ts` + `quality-service.ts`** — `QualityStamp {status, sources[], excluded, staleDays}`, `mergeStamps`, `classifyArtemidaReason`; `recordDegraded(source, reason)` upsert on `UNIQUE(source, day, reason)`.
4. **`lib/analytics/alerts.ts` + `alerts-service.ts` + `alert-notify.ts`** — pure rule table → snapshot evaluate → persist `Alert` → enqueue `Notification` → worker drain. Config in `Setting`, state in a table.
5. **`lib/analytics/{promo-roi,fraud,growth-service}.ts`** — attribution precedence, discount cost, partner accrual-vs-cash, four fraud heuristics.
6. **`lib/analytics/{save-list,upsell,actions-service}.ts`** — reuse `buildKeyTermEvents`/`classifyTerm` and the `keys_cache` mirror; **never** per-key ARTEMIDA fan-out from a page render (429/502 storms).
7. **`lib/csv.ts` + `lib/analytics/export-specs.ts` + `app/api/admin/export/[report]/route.ts`** — one spec per report; the route holds zero SQL and reads the **same loader** the page reads.
8. **`lib/analytics/dictionary.ts` / `metric-registry.ts`** — typed registry keyed by `MetricKey`; dictionary page, delta direction, alert labels and CSV headers all read it.
9. **`components/admin/MetricCard.tsx`** — optional `delta` + `quality` props. **The highest-leverage change in the milestone**: every existing card inherits deltas from one file.

**Recurring 4-file touchpoint** when adding an admin section (`retention`, `dictionary`): `lib/admin-auth.ts` (`AdminSection` union + `MATRIX`) → `app/admin/layout.tsx` (`NAV_SECTIONS`) → `components/admin/AdminNav.tsx` (`ITEMS` + label switch) → `lib/i18n/messages/ru.ts`. Miss one and the page silently disappears from the nav.

**Six anti-patterns to forbid in plans:** delta computed in the component; a third cash formula (`finalAmount - balanceUsed` re-written — two private copies already exist in `referral-stats.ts` and `revenue.ts`); alert delivery via fire-and-forget `admin-notify.pushAll`; invisible row exclusion (`.filter(r => r.valid)` returning a smaller number); export recomputed from formatted screen strings; ARTEMIDA fan-out from a page.

→ Full detail: `ARCHITECTURE.md` (includes project-structure delta, build order per phase, dependency graph, scaling notes — first bottleneck is the unbounded `loadPaidOrders()` read 2× per card set)

### Critical Pitfalls

1. **Partial current period vs complete previous period** — `windowStartDay(period)` includes today, so at 09:00 MSK the delta is systematically negative and self-heals by evening; once it drives alerts, the owner gets a false "оплаты упали" every morning. *Avoid:* comparison contract returning `{current, previous, partial}`, default to the last **7/30 complete** MSK days, render `неполный` and **suppress alerting** when `partial === true`; put the actual date ranges in the UI ("к 24–30 окт").
2. **Degraded data silently zeroing a metric — and degrading runs overwriting healthy rollups** — `catch(() => null)` → `0` makes `activeKeys`/`marginPct`/`runwayDays` collapse; `upsertDailyMetrics` writes **absolute values**, so a rollup run that happened while ARTEMIDA was slow writes *lower* `provider_cost_rub`/`active_keys` over correct numbers and nothing marks the row as suspect. *Avoid:* explicit provenance `{value} | {value:null, degraded, reason}`; persist a `data_quality_events` row per degraded observation; **refuse to write / skip the affected columns** when the input was degraded (write-guard); exclude degraded rows from **both** aggregate sides with the count shown; regression test that healthy input yields byte-identical v1.1 numbers.
3. **Asymmetric exclusion → manufactured drop** — a degraded current window vs a clean baseline creates a drop that is an artifact of exclusion. This is the most likely way alerting loses credibility in week 1. *Avoid:* every aggregate carries `{included, excluded, coverage}`; compute deltas only when `min(coverage) >= 0.95` (configurable), otherwise return `{kind:'incomparable', reason:'degraded'}`; the alert evaluator treats `incomparable` as **suppress + log**, never "no change" and never a drop.
4. **Alert dedupe keyed on the wrong thing, and a queue that cannot carry alert content** — `enqueueNotification` is an upsert with `update: {}`, so **the first key wins forever**; a key containing the run timestamp duplicates, a key containing the observed value mints a new alert per tick, a date-only key swallows the second real incident of the day. And `notifications` has **no payload column** — `dispatchBalanceAlert` reconstructs its message via `dedupeKey.split(':')`, which cannot carry value/threshold/period/band. *Avoid:* a first-class `Alert` table with `payload Json`, dedupe on **business identity** (`UNIQUE(type, windowLabel, band)`), retries update `lastSeenAt`/value on the same row, `Notification.dedupeKey = alert:{alertId}:{telegramId}`, and the dispatcher **loads the Alert row** to render the trigger snapshot — never re-read live metrics at dispatch.
5. **Fraud heuristics that flag legitimate users** — `clientIp()` returns the literal string **`"direct"`** when no `X-Real-IP`/`X-Forwarded-For` is present, so hashing it produces **one constant hash shared by every header-less request** — a 50-account "farm" that is pure artifact. Plus CGNAT, shared office/family Wi-Fi, and abusers who rotate IPs (too sensitive *and* too blind simultaneously). *Avoid:* exclude `"direct"` from the clustering population (assert `ipHash !== sha256('direct')`); require N ≥ 5 **and** multiple independent signals; labels only, **no enforcement path in the diff**; "trial→no-pay ratio by source" is a *quality* metric, not a *fraud* identity signal.

**Also critical, phase-specific:** month-length arithmetic on non-month-start labels (`addMonths` is first-of-month string math — `addMonths("2026-03-31", -1)` → `"2026-02-01"`); reminder duplication/namespace collision across 7/3/1-day steps; rolling-ms horizon + UTC-vs-MSK day key on a *cached* `KeyCache`; attribution double-counting (conversion > 100%, withdrawal counted as cost on top of accrual); CSV formula injection / BOM / locale / filter drift; dictionary drifting into prose.

→ Full detail: `PITFALLS.md` (14 pitfalls, "Looks Done But Isn't" checklist, recovery strategies, pitfall→phase→verification map)

---

## The Three Data-Capture Gaps (must land in Phase 12)

These are the scheduling constraint of the whole milestone. All three are **forward-only** — no backfill is possible — so shipping them in Phase 14 makes Phase 14's own success criteria unfalsifiable for weeks.

| # | Gap | Ground truth | Why it blocks | Phase 12 deliverable |
|---|-----|--------------|---------------|----------------------|
| **G1** | **Ownerless (generic) promo-code clicks are not recorded anywhere** | `referral_clicks.owner_user_id` is `Int` **NOT NULL**; `/api/referrals/click` resolves `User.referralCode`, so only partner-owned codes/subdomains produce rows | PRM-01 / ROADMAP SC 14.1 ("click → register → pay **по каждому промокоду**") has no top-of-funnel for generic codes. Shipping a fabricated click count is the alternative — unacceptable | `promo_clicks` table (`id, promoCode, ownerUserId?, userId?, ipHash, source, createdAt`, index `(promoCode, createdAt)`) + public beacon `app/api/promo/click/route.ts` mirroring the existing referral beacon + `recordPromoClick()` |
| **G2** | **No account-level IP hash** | `ipHash` exists only on `referral_clicks` and `telegram_login_tokens`; `User` has no such column | PRM-04 / ROADMAP SC 14.4 ("trial-фермы по `ipHash`") is unbuildable on organic trials — which is most farm accounts. Inferring from `referral_clicks` misses them | `User.signupIpHash String?` (sha256) written at register **and** trial-claim paths; **exclude the `"direct"` sentinel** from hashing/clustering and log the count; UI must show "IP доступен для N из M аккаунтов" |
| **G3** | **Alert state has nowhere to live** | `notifications` has no payload column; `Setting.value` is a bare string with no room for (type, period, current, baseline, threshold-in-effect, notifiedAt, ack) and no unique key | ALR-04 (history + per-type toggle) and the "no spam on re-run" criterion cannot be met by `Setting` alone; encoding values into `dedupeKey` breaks dedupe | `alert_events`/`Alert` table — see schema below. **The table decision must land in Phase 12/13 planning, before the evaluator is written.** |

**Recommendation on G1's shape:** create a **separate `promo_clicks` table** rather than relaxing `referral_clicks.owner_user_id` to nullable. Relaxing a `NOT NULL` on a live public funnel regresses `referral-stats.ts` semantics (its queries assume an owner) for zero gain, and mixes two attribution models in one table. If the owner instead chooses to **scope the promo funnel to partner codes only**, that is a legitimate cheaper option — but then ROADMAP SC 14.1 must be amended to show `—` for click on generic codes, and the UI must not imply a zero.

**Recommendation on G2's privacy:** storing a *hash* is consistent with existing discipline (never store raw IPs). Remaining decision is retention/erasure policy and whether the hash is salted per-install — see Open Decisions.

### Schema delta (the only new persisted state)

| Change | Kind | Necessity | Rejected alternative |
|--------|------|-----------|----------------------|
| `alert_events` / `Alert` — `id, type, severity, windowLabel, metric, value, baseline, threshold, band, state ('firing'\|'resolved'), dedupeKey/UNIQUE(type,windowLabel,band), payload Json, firstSeenAt, lastSeenAt, resolvedAt, notifiedAt` | NEW table | History + dedupe + "threshold in effect" audit + the trigger snapshot the DM must show | `Setting` = no history; `Notification.dedupeKey` alone = no record of *what* fired at *what* level, and no payload → DM cannot quote the number |
| `data_quality_events` — `id, source, day DATE, reason, count, firstSeenAt, lastSeenAt`, `UNIQUE(source, day, reason)` | NEW table | "Сколько записей исключено" per metric/window (SC 12.3/12.4) and the rollup write-guard's input | JSON column on `daily_metrics` — cannot express non-day sources (a live balance check); couples ops metadata into a pure value rollup |
| `promo_clicks` — see G1 | NEW table | PRM-01 top of funnel | nullable `referral_clicks.owner_user_id` (see above) |
| `User.signupIpHash String?` | NEW column | PRM-04 trial farms | inferring from `referral_clicks` — misses organic trials |
| `Setting`: `alerts.*`, `remind.windowDays`, comparison coverage threshold, meaningful-change bands | CONFIG | No-deploy thresholds/toggles (SC 13.3/13.5) | env vars (need restart) |
| `Notification` — **no schema change** | REUSE | `type` is a free `String`; `dedupeKey` already `@unique`; `nextAttemptAt` already supports deferral (quiet hours) | — |
| `orders`, `keys_cache`, `daily_metrics`, `artemida_balance_snapshots`, `Outbox` | **NO CHANGE** | Money path untouched. Alerts must **not** enter `Outbox` — its `(orderId, type)` uniqueness cannot carry non-order deliveries; that is exactly why `Notification` exists | — |

**Convention to follow** (established in this schema): `String @id @default(cuid())`, `@map`ed snake_case columns, `@@map` plural table names, no PG enums (TEXT + TS unions — deliberate, to keep `migrate deploy` safe). Migrations via `prisma migrate deploy` in the container entrypoint; backfills as separate scripts, never `migrate dev` on prod.

### Two feared migrations that are NOT needed (verified against the schema)

These are the highest-value corrections to the research streams — they remove work and a class of risk:

1. **Promo discount cost needs no new `originalAmount` column.** `Order.amount` is the whole-RUB price **quoted by ARTEMIDA at order creation and stored** (it is a snapshot, not a re-derivation); `orders-service.ts` sets `finalAmount = amount` then applies the promo → `finalAmount = amount − discount`. So `discountCost = Σ(amount − finalAmount)` is *already* historically accurate, and editing `PromoCode.discount` cannot rewrite last month's ROI. **Caveat to plan for:** `finalAmount` is `@default(0)`, so orders created before that column existed read as `amount>0, finalAmount=0` → a phantom 100% discount. Phase 14 must exclude/flag `finalAmount = 0` rows as `cost_unknown` and never treat them as full discount.
2. **`balanceUsed` is not a discount** and cash is not `finalAmount`. `series.ts#cashOf` = `finalAmount − balanceUsed` is the single cash authority; two private copies already exist in `referral-stats.ts` and `revenue.ts`. New code must import `cashOf` — a third definition will diverge on the first refund/balance edge case.

### Coordination hazard found during synthesis (not in any single research file)

**Three** modules hardcode a 3-day window, not two:

| File | Constant | Semantics | Safe to widen to 7? |
|------|----------|-----------|---------------------|
| `lib/reminders-service.ts` | `WINDOW_DAYS = 3` | reminder scan window; dedupe `remind:{keyId}:{UTC-day}` | **Yes** (parameterize via `Setting remind.windowDays`) |
| `lib/keys-service.ts` | `EXPIRING_WINDOW_MS = 3 * DAY_MS` | cabinet badge "expiring" state | **Yes** — and it *must* move with the reminder window or the badge and the push disagree |
| `lib/autorenew.ts` | `WINDOW_DAYS = 3` | horizon for **auto-renew scans that charge the wallet** | **NO — do not touch.** Widening this changes money behaviour. Phase 15 plans must state explicitly that `autorenew.ts` is out of scope for `remind.windowDays` |

A single `lib/expiry-policy.ts` (`REMINDER_STEPS = [7,3,1]`, `reminderDedupeKey(keyId, step, dayLabel)`, "which step is due today") read by the reminder scan **and** the save-list is the only way to prevent the three-way DM collision. Keep `autorenew.ts` on its own constant with a comment saying why.

---

## Implications for Roadmap

**The existing 12→13→14→15→16 order is confirmed.** All four streams independently agree on the dependency chain: `12 (compare, quality) → 13 (alerts) → 15 (save-list/upsell)`; `12 → 14 (promo/referral/fraud) → 15`; `16 (CSV + dictionary) ← all`. Phase 14 correctly does *not* depend on 13. Nothing below asks the roadmapper to restructure phases — it specifies **what each phase must absorb** and flags the four items that change the roadmap's scope text.

### Phase 12 — Period Comparison & Data-Quality Foundation (ALR-01, EXT-05)
**Rationale:** comparisons are additive (no schema) so they de-risk first; quality needs a migration so it lands last within the phase, gated by the v1.1 regression test.
**Delivers (intra-phase order):**
1. `windows.ts` + `compare.ts` + `metric-registry.ts` (frozen `MetricKey` ids, `goodDirection`, noise bands) + unit tests — pure, zero risk, unblocks every UI delta *and* Phase 16
2. `MetricCard` `delta`/`quality` slots + `DeltaBadge`; wire KPI → unit economics → retention → funnel, **one block per commit** so a regression is trivially bisectable
3. **G1 `promo_clicks` + beacon; G2 `User.signupIpHash`** (pulled forward from 14 — ~half a plan: one route, one migration, one function)
4. `data_quality_events` migration + `quality-service` + `recordDegraded` at the two analytics call sites (`.catch()` in `loadBurnRunway`, balance capture in `rollup`) + **rollup write-guard** + `QualityStamp` on affected loaders
5. `DataQualityBanner` + `QualityBadge`; regression test "healthy-data values byte-identical to v1.1"
**Absorbs (scope additions vs current roadmap text):** G1, G2, the metric registry, the rollup write-guard, `partial`/`incomparable` states.
**Must avoid:** Pitfall 1 (partial period), 2 (zero/tiny/missing baselines), 3 (`addMonths` month-label math), 4a/4b (zeroing + rollup overwrite), 5 (asymmetric exclusion).
**Research flag:** the delta/quality *mechanics* are fully specified — **no research-phase needed**. The only unknown is the owner's choice on G1/G2 (see Open Decisions), which is a decision, not research.

### Phase 13 — Anomaly Alerts (ALR-02..04)
**Rationale:** depends on 12 for two concrete reasons — baselines *are* `previousWindow` values, and the runway rule must not fire on a degraded balance read.
**Delivers:**
1. `lib/settings.ts` + `Setting` key namespace + **zod-validated** readers (fail-**closed**: invalid config raises a visible config error, never silently evaluates; `Number('')→0` and `Number('%')→NaN` are how alerts stop firing and look like health)
2. `alerts.ts` pure rule table + `evaluateAlerts` boundary tests (exactly-at-threshold, zero baseline, missing metric, `incomparable`)
3. `alert_events`/`Alert` migration (business-identity unique + `payload Json`) + `alerts-service.runAlertScan` (upsert; retries update, never duplicate)
4. `ALERT` const + `enqueueAlertNotifications` + `alert-notify.ts` + **one** `drainNotificationType(ALERT, …)` line — prove delivery before any UI reads it. Add `alert-notify.ts` as a *typed sibling* of `balance-alert.ts` (same `NotifyDispatchResult` contract); **do not refactor the existing four dispatchers** — that touches money-adjacent delivery for no milestone requirement
5. `app/api/cron/alerts/route.ts` — copy the `CRON_SECRET` gate verbatim (`timingSafeEqual` + length guard + 503 when unset); schedule **after** a successful rollup, and return `{skipped:'stale_rollup'}` rather than evaluating stale data
6. Alert history block + `AlertSettingsForm` + `/api/admin/alerts/settings` + **"отправить тест"** that does not pollute dedupe history
**Absorbs (scope additions):** **quiet hours 22:00–09:00 MSK**, **max 3 admin alert DMs/day per recipient**, digest collapse of the 4th+, `firing → resolved` message pair, `lastEvaluatedAt`/`lastOutcome` visibility. None of these are in the current SC list; if the owner wants them binding, SC 13.4 should say so.
**Delivery rules (opinionated):** quiet hours **defer, never drop** — enqueue with `nextAttemptAt = 09:00 MSK` (the column already exists). Critical bypass: runway ≤ 3 days, or zero paid orders on two consecutive evaluated days. Use `⚠️`/`🔴` prefixes rather than building channels — there is one recipient set. Every body must carry metric, observed vs baseline, window, deep link, and 2–3 next steps; "Оплаты упали на 42%" alone is not an alert.
**Must avoid:** Pitfall 6 (dedupe identity + no payload), 7 (stale rollup race, retry storm, fail-open config), 8's namespace decision (fix it here), and `admin-notify.pushAll` fire-and-forget.
**Research flag:** the alert *thresholds* are specified; what needs a **decision** is the recipient set (see R6/Open Decisions). No external research needed.

### Phase 14 — Promo & Referral Quality + Fraud (PRM-01..04)
**Rationale:** depends on 12 (MSK windows, quality exclusion, the click beacon). Independent of 13 — correct as written.
**Delivers:**
1. `promo-roi.ts` (discount cost from per-order snapshots, attribution precedence, new-vs-returning split, break-even share, label **«ROI по атрибуции»**) + `fraud.ts` (ip clusters, mutual referral pairs, self-dealing, trial→pay ratio by source) — pure + tests, formulas written down **before** implementation and reused verbatim by Phase 16
2. `growth-service.ts` loaders: funnel **cohort-anchored** with an explicit `asOf` (see Pitfall 11 — period-filtering numerator and denominator independently yields >100% conversion), partner accrual vs approved `Withdrawal`, fraud aggregates
3. `/admin/promos` + `/admin/referrals` quality sections, drilling into existing user/key/order cards
4. Wire `quality` stamps; add the `clicks` column that degrades gracefully when the beacon has no history yet ("клики доступны с DD.MM")
**Absorbs:** the `finalAmount = 0` guard for pre-column orders; the `"direct"` hash exclusion; "labels only — no enforcement path" as an explicit review gate.
**Must avoid:** Pitfall 10 (fraud false positives), 11 (attribution/ROI double counting), Anti-Pattern 2 (a third cash formula), and never excluding flagged rows from ROI/revenue aggregates — show "revenue excluding flagged" as a clearly-labelled secondary line at most.
**Research flag:** **this phase carries the most residual ambiguity.** The fraud *thresholds* (N≥5, 24h/7d windows, Wilson intervals, n≥20) are proposals from comparable products, not measured against this shop's data. Worth `--research-phase 14` only if the owner wants a deeper pass on fraud scoring; otherwise plan from `PITFALLS.md` §10 and `FEATURES.md` §D.

### Phase 15 — Expiry Save-List & Upsell Radar (EXT-01, EXT-02)
**Rationale:** depends on 13 (Notification dispatch, bulk send) and 14 (source/segment filters) — both genuinely used.
**Delivers:**
1. `lib/expiry-policy.ts` — **one** cadence policy (`REMINDER_STEPS=[7,3,1]`, `reminderDedupeKey(keyId, step, dayLabel)`, due-step predicate) read by both the reminder scan and the save-list; `autorenew.ts` deliberately excluded
2. `reminders-service.windowDays` parameterization + `Setting remind.windowDays` + **`keys-service.EXPIRING_WINDOW_MS` alignment** + test updates planned explicitly (existing reminder tests assume 3)
3. `save-list.ts` pure (reuse `buildKeyTermEvents`/`classifyTerm`) + `actions-service` loader; columns include value-at-risk, RFM segment, renewal history, stage/date of last reminder; sort value-at-risk desc
4. `upsell.ts` pure scoring — freshness gate on `lastSyncedAt` (>48 h → `данные устарели`, drop from top ordering), **unlimited handling** (`trafficLimitBytes === null || 0` → bucket "unlimited", exclude from the low-tariff heavy rule), sustained-usage window not a single snapshot, trial exclusion, top-tier exclusion, 30-day per-user cap
5. `/admin/retention` page + the 4-file registration checklist; bulk send via existing `Broadcast` with **server-recomputed** recipient count, `N получателей (обновлено)`, server-side idempotency token
**Absorbs (behavioural changes that must be stated in the plan):**
- **Reminder window 3 → 7 days** — reconciliation across `reminders-service.ts`, `keys-service.ts`, `Setting`, and the existing tests
- **Dedupe key gains a stage + a day convention** (`remind:{keyId}:{stage}:{mskDay}`) while keeping "идемпотентно по ключу и дате" true (SC 15.2). Decide **UTC vs MSK day key** explicitly: today's key is a **UTC** day while the UI/analytics are **MSK**, so a 00:30 MSK run and a 03:05 MSK run can be different UTC days and double-send for one MSK day. Migrating the format costs one duplicate day during rollout — accept it and say so, don't discover it.
- Trial keys need **buy** copy, not "продлите" (ARTEMIDA forbids renew/upgrade on trials) — separate list section
- Exclusions: `autoRenew` with sufficient balance, stale `lastSyncedAt`, open ticket on the same key, bot-blocked users (403), quiet hours for user pushes **21:00–10:00 MSK — defer to 10:00**

**Must avoid:** Pitfall 8 (namespace collision, broadcast double-click, drifting preview), 9 (rolling-ms horizon, UTC/MKS day, stale `KeyCache` as source of truth), 14 (unlimited-as-100%, stale traffic).
**Research flag:** mechanisms specified; the *cadence* choice (T-7/T-3/T-1, cap 3/term) is a product decision. No external research needed.

### Phase 16 — CSV Export & Metric Dictionary (EXT-06, EXT-07)
**Rationale:** depends on 12–15 because exports cover every report. Correct as written.
**Delivers:**
1. `lib/csv.ts` — typed columns + RFC 4180 quoting + BOM + CRLF + text-only formula neutralization + `BigInt`→string + row cap; unit tests for `=cmd|' /C calc'!A0`, embedded `,`/`"`/newline, negative deltas staying numeric, Cyrillic headers
2. `export-specs.ts` + `app/api/admin/export/[report]/route.ts` — `runtime='nodejs'`, `dynamic='force-dynamic'`, **`requireRole` re-run inside the handler** (a direct `GET` bypasses the page layout — RSC payloads skip layouts), zod-validated query params, `Cache-Control: no-store`, RFC 5987 `filename*=UTF-8''…` for Cyrillic
3. `ExportCsvLink` on all eight reports — a server-rendered `<a download>` that flows `searchParams` (period/filters) into the href; no client JS, works in the installed PWA
4. `dictionary.ts` page + nav + deep links **both ways**; two-way coverage CI test (`MetricKey` ↔ rendered cards) that fails the build on a gap
**Absorbs:** the sanitizer requirements STACK.md's sketch omits; the `data_quality` column (`excluded_rows`, `degraded_at`) as a P3 nice-to-have.
**Must avoid:** Pitfall 12 (injection/BOM/locale/filter drift/unbounded), 13 (dictionary drift — prevented by the Phase 12 union), Anti-Pattern 5 (export recomputed from formatted screen strings).
**Research flag:** **no research-phase needed** — RFC 4180, OWASP CSV injection and `Content-Disposition` are settled, and both streams already specify the contract.

### Phase Ordering Rationale (why this survives contact with reality)
- **Correctness before alerting.** Alert thresholds are meaningless on partial or degraded numbers. Phase 12 exists precisely to make 13's inputs trustworthy; the reverse order produces the false-drop alert that costs alerting its credibility in week 1.
- **Forward-only capture beats forward-only reporting.** Nothing else in the milestone is time-sensitive; G1/G2 are. Phase 12 is the last cheap moment.
- **One registry, five consumers.** `MetricKey` frozen in 12 makes delta direction, alert labels, CSV headers and the Phase 16 dictionary all compiler-checked. Retrofit cost grows per phase.
- **Reuse the proven durable-delivery shape.** `balance-alert.ts` → `Notification` → `drainNotificationType` already carries per-admin dedupe and retry. Copying it (rather than inventing a router or calling `pushAll`) satisfies four success criteria at once.

### Research Flags (for `/gsd-plan-phase --research-phase N`)

| Phase | Needs research? | Why |
|-------|-----------------|-----|
| **12** | **No** — standard patterns | Delta/quality contracts, schema shape and migration order fully specified; pure-TS work with unit tests |
| **13** | **No** — standard patterns | Outbox/dedupe/cron-gate patterns exist in-repo and are referenced line-by-line. Only a *decision* is open (recipients) |
| **14** | **Maybe** — judgment call | ROI formulas resolved; fraud scoring thresholds and cohort-anchored funnel semantics are the least ground-truthed. A research pass is defensible if fraud becomes a headline feature |
| **15** | **No** — standard patterns | Save-list/upsell mechanics specified; the 3-day-window reconciliation is in-code, not in the literature. Fraud-adjacent *copy* rules live in 14 |
| **16** | **No** — standard patterns | RFC 4180 + OWASP CSV injection are settled standards; Serwist/web-push explicitly rejected |

---

## Scoping Changes to ROADMAP.md (owner approval needed before Phase 12)

The roadmap is approved and is not being rewritten. Four items change **scope text** rather than phase order:

| # | Roadmap location | Current text | Needed change | Why |
|---|------------------|--------------|---------------|-----|
| **S1** | Phase 12 — `Requirements` | `ALR-01, EXT-05` | Add a note that Phase 12 also ships **capture-only** enabling work for `PRM-01` (promo click beacon) and `PRM-04` (`User.signupIpHash`) — requirement *delivery* still lands in 14 | Both are append-only; shipping them in 14 makes SC 14.1/14.4 hollow for weeks |
| **S2** | Phase 14 SC 1 | "По каждому промокоду и партнёру видна воронка click → register → pay" | Either keep (and S1 ships the beacon) **or** amend to "…для партнёрских кодов; для generic-кодов `—` с пояснением" | `referral_clicks.owner_user_id` is NOT NULL; generic codes have no click source. Choose the option, don't ship a fabricated 0 |
| **S3** | Phase 14 SC 4 | "trial-фермы по `ipHash`/`emailCanonical`" | Reword the `emailCanonical` half to "попытки, сведённые к одному ящику" (a counter of blocked registrations) and keep `ipHash` cluster detection | `emailCanonical` is `@unique` on `User` — clusters cannot exist, so "clustering" is a non-signal by construction and the page would look broken |
| **S4** | Phase 12 SC (5 bullets) | — | **Add:** "degraded-прогон rollup не может перезаписать здоровые значения `daily_metrics`" and "сравнение при несопоставимом покрытии даёт `incomparable`, а не число" | `upsertDailyMetrics` writes absolute values; without a write-guard a slow ARTEMIDA silently destroys history. Currently only implied by SC 12.5 |
| **S5** | Phase 13 SC (5 bullets) | SC 13.4 covers dedupe/no-spam | **Add if binding:** quiet hours 22:00–09:00 MSK, ≤3 DMs/day, deferral (not drop), `firing→resolved` pair | Required by FEATURES §B and the single-operator constraint; currently absent from the SC list |
| **S6** | Phase 15 SC 2 | "идемпотентно по ключу и дате" | **Add:** "…и по стадии (`T-7`/`T-3`/`T-1`), с единым MSK-ключом дня" | `reminders-service` currently uses a **UTC** day key while the UI is MSK — a 00:30 vs 03:05 MSK run can double-send for one MSK day |

*(S1–S4 are recommended as-is; S5–S6 make already-researched requirements explicit. None of them change phase order or dependencies.)*

---

## Open Product Decisions (must be answered by the owner, not by research)

These block or reshape a phase plan. Each is a decision — additional research will not settle it.

| # | Decision | Options | Research recommendation | Blocks |
|---|----------|---------|-------------------------|--------|
| **D1** | **Promo click scope** — who/what gets a funnel top? | (a) generic + partner clicks via new `promo_clicks` table + public beacon; (b) partner codes only, `—` for generic | **(a)** — it is ~half a plan in Phase 12 and it is the only way SC 14.1 is truthful for every code. If (b), amend SC 14.1 now (S2) | Phase 12 scope, SC 14.1 |
| **D2** | **`ipHash` privacy** — collect an account-level IP hash at all? | (a) collect at register + trial claim, sha256, exclude `"direct"`; (b) skip and drop PRM-04's IP signal | **(a)**, with retention period stated in the privacy policy and no raw IP ever stored. Note the honest consequence: history is forward-only, so the fraud page reads "IP доступен для N из M" for months | Phase 12 column, SC 14.4 |
| **D3** | **Alert recipients** — who receives alert DMs? | (a) `administrator` only (matches `balance-alert`); (b) administrators + managers | **(a)** — `manager` sees `/admin/analytics` but not broadcast/roles, so an alert DM could expose what they cannot open (R6). If (b), resolve the permission gap first | Phase 13 dispatch + dedupe key shape |
| **D4** | **Fraud priority split** — is fraud P1 or P2? | (a) all four signals in Phase 14 (needs G1+G2); (b) cheap signals P1 (self-dealing, mutual pair, trial→pay ratio) and IP-cluster/farm detection P2 | **(b)-leaning**: self-dealing and mutual pairs are LOW cost, LOW false-positive and definitional; IP clusters need the schema, a false-positive profile and a coverage caveat. FEATURES' own matrix already ranks ipHash clusters **P2** and trial→pay **P2** | Phase 14 plan size |
| **D5** | **Reminder cadence + day key** | (a) T-7/T-3/T-1, cap 3/term, MSK day key; (b) keep 3-day single reminder; (c) add T-0 | **(a)**. Migrating the key from UTC to MSK costs one duplicate day at rollout — decide and document, don't discover | Phase 15 |
| **D6** | **Alert tuning scope** | (a) 4 rules, fixed defaults in `Setting`, no per-rule quiet-hour override; (b) add digest tuning / overrides now | **(a)** — 4 rules + quiet hours + cap is the anti-fatigue budget for one operator. Tuning is a v1.2.x trigger ("the owner mutes a rule because it fires at a bad time") | Phase 13 |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | **HIGH** | "Add nothing" verified against this repo's actual `package.json`, `Dockerfile`, `prisma/schema.prisma` and `lib/*` — not against blog posts. Rejected-alternative versions are MEDIUM (npm `dist-tag` only, never installed, nothing pinned). Two corrections to older docs found and noted (React 19.2.8; no Serwist). |
| **Features** | **MEDIUM** | Cross-verified across 8 product families (Stripe/Recurly/Chargebee, Baremetrics/ChartMogul, Rewardful/PartnerStack/Tapfiliate, Voucherify, PostHog, dbt MetricFlow) plus HIGH-confidence reads of this codebase. The *shape* of each feature is solid; the specific numeric thresholds (35% drop, N≥5 clusters, ±3% bands, 3 DMs/day) are industry-typical proposals, not tuned to ~10² orders/week. |
| **Architecture** | **HIGH** (integration) / **MEDIUM** (new-table shape) / **LOW** (G1 resolution) | Layering, seams, file-level delta and build order read directly from the code. The three new tables are design judgement aligned with existing conventions, not yet migrated. G1 is a product decision, not an architectural unknown — hence LOW as *research* confidence even though the recommendation is firm. |
| **Pitfalls** | **HIGH** | Every critical pitfall traced to a specific line: `windowStartDay` includes today; `upsertDailyMetrics` absolute-value upsert; `enqueueNotification` `update: {}`; `notifications` has no payload; `clientIp()` returns `"direct"`; `addMonths` is first-of-month only; `WINDOW_DAYS = 3` in three modules; `EXPIRING_WINDOW_MS = 3 days`. CSV/Excel specifics are MEDIUM (cross-tool behaviour, OWASP/CWE-1236 grounded). |

**Overall confidence: HIGH** for "this milestone can ship with zero new dependencies and the existing architecture", and **HIGH** for "these are the failure modes that will cost trust if skipped". MEDIUM for the tuning constants and the fraud thresholds — they need a real week of data, not more research.

### Gaps to Address

- **Fraud thresholds are unvalidated against this shop's data.** N≥5 / 24h / Wilson-n≥20 are borrowed. Plan them as `Setting`-tunable from day one and re-evaluate after two weeks of real clusters; ship with "наблюдение" as the default confidence tier.
- **Alert thresholds are guesses.** 35% payments drop, 1.5× failed share, 2× ticket median, 14-day runway — all plausible, none measured. Same mitigation: `Setting` + a visible current value in the admin UI so a typo is obvious, plus a "отправить тест" button that proves the pipeline.
- **`daily_metrics` has no quality dimension and cannot be retro-flagged.** Accepted: quality flags are forward-only too; the banner only claims what it knows. Do not promise historical explainability.
- **Comparison doubles loader reads per block** (`loadPaidOrders()` is deliberately unbounded below). Acceptable at a few thousand rows; measure before adding caching. First bottleneck to watch: `/admin/analytics` load time, then add a `paidAt >=` bound.
- **`promo_clicks` will be empty at launch.** Phase 14's UI must degrade gracefully ("клики доступны с DD.MM") rather than render a 0% conversion as fact.
- **Phase 13 has no runbook yet.** Each alert needs what happened / value vs threshold / windows / 2–3 next steps / deep link — write the copy as part of the phase, not after the first false positive.
- **Existing reminder tests assume a 3-day window.** Phase 15 must plan test updates as an explicit task, not a surprise.
- **PDF/mobile rendering of the dictionary and history tables is untested** — low risk, no research done; check in Phase 16 UAT.

---

## Sources

### Primary (HIGH confidence — this repository, read 2026-10-31)
- `package.json`, `Dockerfile` (`node:24-bookworm-slim`) — installed versions: next 16.3.7, react 19.2.8, prisma 7.10.0, zod 4.6.5, vitest 5.0.3, telegraf 4.16.3, pino 10.3.1; `@serwist/next` **absent**
- `prisma/schema.prisma` — `Order.amount` (server-quoted snapshot) / `finalAmount` (`@default(0)`) / `balanceUsed` / `providerCost` (nullable, never defaulted); `ReferralClick.ownerUserId` **NOT NULL** + `ipHash`; `Notification` (no payload, `dedupeKey @unique`, `nextAttemptAt`); `KeyCache` (`lastSyncedAt`, `autoRenew`, `isTrial`, BigInt traffic); `User.emailCanonical @unique`, `referredById`, `trialUsed`; `PromoCode.ownerUserId`; `Withdrawal` statuses; `WalletTx`; `Setting`; `DailyMetric`
- `lib/analytics/{time,series,service,rollup,economics,funnel}.ts` — MSK rules, `windowStartDay` includes today, `cashOf` authority, absolute-value upsert, `emptyAggregate` gap-filling
- `lib/{outbox,worker,balance-alert,reminders-service,keys-service,autorenew,referral-stats,referrals,promo,orders-service,client-ip,admin-auth,artemida}.ts` — dedupe-key precedents, `drainNotificationType`, `WINDOW_DAYS = 3` ×3, `"direct"` sentinel, `ArtemidaError.code` taxonomy, promo discount application
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md` (ALR/PRM/EXT), `.planning/ROADMAP.md` (Phases 12–16) — scope, success criteria, approved order

### Secondary (MEDIUM confidence — standards and product families)
- **Period comparison:** Zenovay "Comparing Date Periods"; Practical Reporting "vs previous period"; Lightdash period-over-period docs; dbsyntax rolling metrics (`NULLIF` guard, date spine)
- **Alert tuning:** AppSignal alert tuning (warm-up/cooldown, rates over counts); tripl anomaly docs (median/MAD needs ≥3 seasonal cycles); Netdata alert-fatigue; detectkit cooldown patterns
- **Promo/partner ROI:** Voucherify (incremental profit ≠ revenue), Clinch (attribution vs incrementality), Uniqodo (cannibalisation), Blufire (break-even new-order share); Rewardful/EasyAffiliate/Track360 (revenue − commissions − costs; actual payouts)
- **Fraud:** Stripe "detecting fake users and multiaccount abuse" (no single conclusive signal, link analysis, confidence scoring, gate not block); Stytch trial-abuse; AntiTrial signal table (VPN-IP false positives); Layercall ("linkage is a reason to verify, not to accuse")
- **Pre-dunning cadence:** Recurly (3–4 messages/28 days), Chargebee retry sequences, Churn.io (30/7-day pre-expiry), Revenudge/ChurnBot (fewer, sharper touches)
- **CSV/Excel:** RFC 4180; RFC 6266/5987 (`filename*`); OWASP CSV Injection + CWE-1236; USENIX WOOT '25 formula-injection prevalence; Excel UTF-8-BOM and RU-locale delimiter behaviour
- **Metric dictionary:** dbt semantic layer docs; DataDost metric-dictionary contract (definition, formula, grain, source, cadence, caveats); markdown metric-definition template
- npm registry `latest` on 2026-10-31 for **rejected** alternatives: `papaparse@5.7.0`, `csv-stringify@6.9.0`, `web-push@3.6.7`, `date-fns@4.4.0`, `recharts@3.10.1`, `simple-statistics@8.0.0`, `next-mdx-remote@6.0.0`, `bullmq@6.5.3`, `croner@11.0.0`

### Tertiary (LOW confidence — needs validation during implementation)
- Numeric alert thresholds, fraud thresholds and meaningful-change bands — industry-typical, not measured on this shop's volume
- Market context from prior v1.0 research (RU Telegram VPN bots ship `/stats` and `/sendall` only) — directionally useful, dated

---

*Research synthesized: 2026-10-31*
*Roadmap impact: **no phase-order change**; 6 scope-text items (S1–S6) and 6 owner decisions (D1–D6) to confirm before Phase 12 planning*
*Ready for planning: yes*
