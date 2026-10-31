# Feature Research — milestone v1.2 (stabilization & quality)

**Domain:** Subscription VPN shop — Telegram bot + Next.js PWA cabinet + admin analytics; RU/RUB, single operator, single VPS
**Researched:** 2026-10-31
**Confidence:** MEDIUM (web sources cross-verified across 8 product families — Stripe/Recurly/Chargebee, Baremetrics/ChartMogul, Rewardful/PartnerStack/Tapfiliate, Voucherify, PostHog, dbt MetricFlow — plus HIGH confidence on what already exists in this codebase, read directly from `prisma/schema.prisma`, `lib/analytics/*`, `lib/referral-stats.ts`, `lib/reminders-service.ts`, `lib/worker.ts`)

**Scope note:** this file covers **only the new v1.2 features** (period deltas, anomaly alerts, promo/referral quality + fraud, expiry save-list, upsell radar, data-quality flags, CSV export, metric dictionary). The shipped v1.0/v1.1 landscapes (trial, payments, tickets, base analytics, RFM) are validated and live in `PROJECT.md` and the milestone archives — do not re-plan them.

**Single-operator filter applied throughout:** every recommendation below assumes one person reading alerts on a phone, ~10² orders/week, no on-call rotation, no data team, no warehouse. Anything that needs tuning by a specialist, or that can page you at 3 a.m. for noise, is demoted to an anti-feature.

---

## Feature Landscape

### Table Stakes (Users Expect These)

An admin who has seen Stripe/Baremetrics/PostHog expects these; missing them makes the v1.1 dashboard feel like a static report rather than a monitoring tool.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Delta (abs + %) on **every** KPI, at the period selector's length | Every commercial dashboard ships "vs previous period" by default; a number without a trend is unreadable | LOW | One shared `comparePeriods(current, previous)` helper + delta pill component. Must cover all v1.1 sections (revenue, LTV, churn, funnel, cohorts, RFM counts), not just the top row |
| Explicit handling of zero/absent baselines | `0 → 40` shown as "+100%" is the classic wrong number people act on | LOW | Render `—`("новая метрика") for `prev = 0 && cur > 0`, `0%` for `0 → 0`, `—` when the previous window predates data. Never divide by zero, never print ∞ |
| Direction-aware colouring (good/bad), not just up/down | Failed-rate, churn, refunds, runway — "up" is bad | LOW | Store `goodDirection: "up" \| "down"` on the metric registry (same registry the dictionary uses) |
| Same-length, immediately-preceding comparison window on MSK boundaries | Comparing 7 days to 30 days, or a UTC week to an MSK week, invalidates every delta | LOW | Reuse `lib/analytics/time.ts` (`mskDayStartInstant` for timestamps, `mskDateKey` for `@db.Date`). WoW = trailing 7 days vs previous 7; MoM = trailing 30 vs previous 30 (or calendar month, but pick one and document it) |
| "Partial period" honesty | Yesterday's delta at 09:00 is meaningless if today is half-loaded | LOW | Label the current window `неполный` when it ends today; suppress *alerting* on incomplete days (deltas may still render) |
| Data-quality badge per metric with exclusion counts | Phase 12's whole point: a number derived from degraded ARTEMIDA responses must be visibly qualified | MEDIUM | "N из M записей исключены (таймаут ARTEMIDA, 03:12 MSK)" + last successful sync timestamp. Never silently zero-fill a failed fetch |
| Alert on the four business rules (payments drop, failed-rate spike, ticket spike, low runway) | "I find out from the dashboard" defeats the purpose of analytics | MEDIUM | 4 rules, not 20. See the alert contract below |
| Alert dedupe + cooldown + history | Cron re-runs, webhook retries and persistent conditions otherwise produce 30 identical DMs for one incident | MEDIUM | Reuse `Notification.dedupeKey UNIQUE`; add an `alert_events` history table (fired/suppressed/acked) |
| Per-rule enable/disable + threshold via `Setting`, no deploy | A rule that fires wrongly must be shut off from the phone | LOW | `alert.payments_drop.enabled`, `alert.payments_drop.thresholdPct`, … read at cron time |
| Per-code and per-partner funnel: click → register → pay | The v1.1 partner page already does this for partners; the admin expects the same for promo codes | MEDIUM (partner: LOW — exists) | `lib/referral-stats.ts#funnelStats` already returns clicks/registrations/purchases/revenue. **Extend, don't rebuild.** Generic (ownerless) promo codes have no click capture today — see Dependencies |
| Discount cost, revenue, ROI per promo code | "Did this code make money?" is the only question an owner asks about a code | MEDIUM | Cost must be `Σ(gross − final)`, not `Σ(discount%)`; show `—` when cost = 0 (100% free codes) |
| Partner economics including withdrawals | Accrued commission ≠ money paid out; a partner can accrue forever and never withdraw | LOW | Show both accrual and cash views (`pending`/`approved`/`rejected` statuses exist on `Withdrawal`) |
| Fraud **signals** (not verdicts): trial clusters, self-cycles, trial→pay ratio by source | Owners suspect trial farming; they need evidence to look at, not a score | MEDIUM | Observe-only. Every flag must show *why* it fired and link to the accounts involved |
| Expiry save-list (≤7 days, not renewed) with contacts | Cheapest retention lever; every subscription product has a "renewals due" worklist | LOW | `KeyCache.expiresAt` + `status` already there; exclude trial keys (ARTEMIDA forbids renew/upgrade) |
| Idempotent reminder per key per stage | Duplicate "your key expires" DMs are the fastest way to lose trust | LOW | Existing `remind:{keyId}:{date}` pattern; extend to stage-aware keys |
| Upsell radar on real usage signals | Heavy user on a 2-device plan is money left on the table; all competitors' panels show device/traffic usage | MEDIUM | Needs `KeyCache.trafficUsedBytes`/`devices` freshness; show `lastSyncedAt` and hide stale rows |
| CSV export that equals the screen | Copy-paste from a dashboard into Excel is the actual workflow of a one-person business | LOW per report (MEDIUM overall) | Same rows/columns as the rendered table, current period + filters, UTF-8 BOM, CRLF, formula-injection neutralization |
| Metric dictionary with formula + source + caveats | The v1.1 formulas are non-obvious (net LTV, RFM thresholds, expired-by-age); without a dictionary every number is arguable | LOW–MEDIUM | Generate it from a code-level registry so tooltips and docs cannot drift |

---

### Expected Behavior Specs (the details the roadmap must encode)

These are the parts that are usually got wrong. They are table stakes but each needs an explicit decision in the phase plan.

#### A. Period-over-period delta contract

1. **Window:** equal length, immediately preceding, MSK-aligned. `WoW` = `[D-6 … D]` vs `[D-13 … D-7]`; `MoM` = trailing 30 vs previous 30. Document the choice in the dictionary; do not mix calendar-month and trailing-30 in the same view.
2. **Formulas:** `deltaAbs = cur − prev`; `deltaPct = (cur − prev) / |prev| × 100`. Keep the sign of `prev` visible for margin/runway (negative-baseline cases need the absolute value in the denominator, per finance convention).
3. **Display:** absolute delta always; percentage only when `|prev| ≥ 1` unit and `prev ≠ 0`. Pill shows `▲ 12,4%` / `▼ 8,1%` / `— новый` / `0%`. Do not colour a change inside a per-metric "noise band" (default ±3%, configurable per metric) — this kills the "Christmas tree" wall of red/green on a dashboard where everything always moves a little.
4. **Small-number guard:** for the UI show both, but flag `малая база` when `prev < 5` (orders/tickets/users) so the owner doesn't treat `2 → 3` as +50% growth.
5. **Aggregate ratios are recomputed, not averaged.** ARPU, ARPPU, margin %, conversion, failed-rate must be recalculated from both periods' numerators/denominators; never average two percentages.
6. **Deltas are display-only in Phase 12.** They must not feed alert thresholds until Phase 13 has its own baseline logic (see B) — a noisy single-day percent change is a bad alert trigger.
7. **Missing comparison data is `—`, not zero.** A dashboard that started 10 days ago has no MoM baseline; say so.
8. **Chart, not just pills:** render the previous period as a dashed/ghost series behind the current sparkline (standard in Zenovay/GA4/Lightdash). Cheap once `loadSparkline` exists.

#### B. Anomaly alert contract

Four rules. Each is a *rate or level with an absolute floor*, evaluated once per daily cron, never per payment.

| Rule | Signal | Baseline | Fires when (all conditions) | Noise floors | Cooldown / dedupe |
|------|--------|----------|-----------------------------|--------------|-------------------|
| `payments_drop` | Paid orders **and** captured cash for the evaluated day (3-day rolling mean) | Trailing 28-day mean, same weekday if enough history | drop ≥ `paymentsDropPct` (default 35%) vs baseline | baseline ≥ 3 paid orders/day **and** absolute loss ≥ 500 ₽ | 1 per 24h; key `alert:payments_drop:{date}` |
| `failed_spike` | Failed share = failed / (paid + failed) on payment attempts | Trailing 14-day mean rate | rate ≥ `1.5 ×` baseline **and** rate ≥ 15% | failed attempts ≥ 5 in the day | 1 per 24h; key `alert:failed_spike:{date}` |
| `tickets_spike` | New tickets created per day | Trailing 14-day median | ≥ `2 ×` median | ≥ 3 new tickets **and** median ≥ 1 | 1 per 12h; key `alert:tickets_spike:{date}` |
| `runway_low` | `runwayDays` from v1.1 burn-rate (ARTEMIDA balance) | absolute threshold in `Setting` | `runwayDays < alert.runwayDays` (default 14) | balance known (not `unknown`) | re-alert only on band change (14 → 7 → 3) or every 7 days; key `alert:runway:{band}` |

Cross-cutting requirements:

- **Warm-up without delay:** evaluate a 3-day rolling mean rather than a single day for the three flow rules. This is the equivalent of AppSignal's warm-up window and avoids a one-bad-Sunday page, while still alerting within one cron run. Runway is instantaneous by nature.
- **Rate over count** wherever traffic volume can grow (failed share, not failed count) — otherwise every busy day alerts.
- **Dedupe at the queue:** unique `Notification.dedupeKey`; an alert already `pending`/`done` for the same key is not re-enqueued. Cron double-fire and container restart are the normal case, not the exception.
- **Quiet hours (MSK):** 22:00–09:00. Non-critical alerts are enqueued with `nextAttemptAt` = 09:00 (the queue already supports deferred dispatch) and sent as one digest. Critical bypass: runway ≤ 3 days, or paid orders = 0 for two consecutive evaluated days. Never silent-drop an alert — defer it.
- **Global cap:** max 3 admin alert DMs per day per recipient; the 4th is collapsed into the evening digest. One operator cannot process more.
- **Severity routing is irrelevant here** (one recipient set) — resist building channels. Severity only decides quiet-hours bypass and DM prefix (`⚠️` vs `🔴`).
- **History + controls:** `/admin/analytics/alerts` lists fired alerts (rule, observed value, threshold, baseline, status sent/suppressed/acked, ack timestamp), per-rule toggles, threshold inputs, and a "отправить тест" button. Test sends must not pollute the dedupe history.
- **Every alert body must be actionable:** metric, observed vs baseline, window, top contributor if cheap (e.g., top `errorCode`), and a deep link to the relevant dashboard section. "Оплаты упали на 42%" alone is not an alert.
- **`unknown` data never alerts.** If ARTEMIDA degraded the source, emit a *data-quality* notice, not a business alarm (Phase 12 rule).

#### C. ROI definitions (promo and partner)

**Promo code ROI (per code, per MSK period):**

```
gross        = Σ Order.amount      for paid orders with promoCode = P
net          = Σ Order.finalAmount for the same orders
discountCost = gross − net                       // the money given away
revenue      = net                               // booked order value after discount
providerCost = Σ Order.providerCost (known only)  // null-safe, coverage counted
contribution = revenue × grossMarginPct − providerCost − discountCost
ROI          = contribution / discountCost        // undefined when discountCost = 0
```

- Label it **«ROI по атрибуции»**, not "ROI". Without a holdout you cannot separate incremental from cannibalized orders; every production tool that claims otherwise is overstating (Voucherify, Clinch, Blufire all say this explicitly).
- Ship two honesty aids next to it: **new vs returning payer split** and **break-even new-order share** ≈ `discountCost / (discountCost + marginPerOrder)`. If most redeemers are returning payers, the code is a margin leak, and the dashboard should say so in one sentence.
- `balanceUsed` is not a discount — exclude it from `discountCost`; show cash collected (`net − balanceUsed`) as a separate column.
- Refunded/canceled orders are excluded from both numerator and denominator. Do not net a refund against a different period.

**Partner ROI (per partner, per MSK period):**

```
attributedRevenue = Σ finalAmount of paid orders by users with referredById = partner
commissions       = Σ positive WalletTx(referral_bonus) for partner in period
payoutsApproved   = Σ Withdrawal(status = approved).amount  in period
payoutsPending    = Σ Withdrawal(status = pending).amount   at period end
providerCost      = Σ providerCost on attributed orders (known only)
contribution      = attributedRevenue − providerCost − commissions
ROI               = contribution / commissions            // accrual view
cashPosition      = commissions − payoutsApproved − payoutsPending
```

- **Two views, both required:** accrual ROI (did the partner's buyers pay for their commission?) and cash position (how much is still owed / already withdrawn). A single "ROI" number that ignores withdrawals answers the wrong question — the milestone requirement PRM-03 exists precisely for this.
- **Do not double-count:** commissions are an accrual expense; withdrawals are the settlement of that expense. Never subtract both from revenue in one P&L-style number; present them as the two views above.
- Day-based rewards (`bonusDays`, non-partner inviters) are not money; either exclude them from partner ROI or value them at the tariff's daily rate and label the assumption. For v1.2: exclude and note it in the dictionary.
- Partner codes with zero attributed revenue must show `ROI = —` and `0 ₽`, not divide-by-zero.
- Attribution is first-wins (`User.referredById` pinned once) — state it in the dictionary; it favours the first touch and cannot be changed retroactively.

#### D. Fraud heuristics and their false-positive profile

Rule for this product: **signals are for a human to look at, never for automatic enforcement.** A VPN shop's customers are privacy-sensitive, often behind CGNAT, mobile carriers, or their own VPN — IP evidence is weaker here than in ordinary SaaS. Treat `ipHash` as a *weak* signal, `emailCanonical` collisions as *strong but already blocked*, and money-flow signals as the strongest.

| Signal | Definition | Surface when | False-positive profile | Recommended action |
|--------|-----------|--------------|------------------------|--------------------|
| **Trial farm by `ipHash`** | ≥3 accounts that claimed a trial sharing one `ipHash` | within any 30-day window; sort clusters by account count | HIGH — carrier NAT, family/office, shared Wi-Fi, users on hosting/VPN IPs (endemic in this audience), IPv6 rotation | Show cluster + accounts; weight LOW in any score. Never block |
| **Trial farm by `emailCanonical`** | Multiple accounts resolving to one canonical mailbox | `emailCanonical` is UNIQUE, so clusters cannot exist — the real signal is **blocked registration/trial attempts** | LOW (constraint already prevents the abuse) but requires an attempt counter to be visible at all | Log attempts in a small counter/table; report "N попыток сведены к одному ящику". Do not build account clustering on this |
| **Self-dealing promo** | `PromoCode.ownerUserId = Order.userId` (partner buys with own code) | any occurrence | VERY LOW — definitionally self-dealing; could be a legitimate test order | Highest-priority flag; exclude test/admin accounts via allowlist |
| **Referral self-cycle** | `A.referredById = B` **and** `B.referredById = A`; also A→B plus shared `ipHash`/`emailCanonical` | any mutual pair; or ≥2 linked buyers sharing an IP with the inviter | LOW for the mutual pair (structurally impossible for normal onboarding, possible because `referredById` binds only once and late); MEDIUM for IP linkage | Show the pair and the wallet entries; manual review. Add a bind-time guard that rejects a code whose owner is already downstream of the binder |
| **Trial → no-pay ratio by source** | Trials per `/start` source or referral/promo source vs paid within 30 days | source has ≥20 trials **and** pay-rate ≤ 50% of the overall rate | MEDIUM–HIGH at low n — a new channel looks terrible for its first 2 weeks; small samples swing wildly | Show the Wilson 95% interval and n; require n ≥ 20 before flagging; never compare sources with n < 10 |
| **Payout concentration** | Partner's approved+pending withdrawals vs commissions, with buyers clustering on the partner's `ipHash` | payouts > 70% of commissions accrued **and** ≥2 buyer accounts share an IP with the partner | MEDIUM — real partners do withdraw everything | Show as "проверить перед выплатой" on the withdrawal review screen, not as an accusation |
| **Refund/chargeback after commission** | Order later `refunded`/`CHARGEBACKED` while `referral_bonus` remained credited | any occurrence | LOW (arithmetic fact) | Flag for manual clawback; do not auto-debit the wallet in v1.2 |

Requirements common to all signals:

- **Evidence, not verdict:** each row expands to the accounts, the shared attribute (hashed), and the specific orders/wallet entries.
- **Confidence, not boolean:** three levels (`наблюдение` / `проверить` / `высокий риск`) derived from how many independent signals agree. Stripe's own guidance: combine signals; one signal alone is ambiguous.
- **Dismiss with reason:** persisted (`fraud_dismissals`: signal, subject, reason, admin, timestamp) so the same cluster does not resurface weekly. This is what makes a heuristic usable at all.
- **Allowlist:** owner/test accounts and known family accounts never appear.
- **No new PII:** hashes only (`ipHash` = sha256), consistent with the existing `ReferralClick`/`TelegramLoginToken` discipline. Never store raw IPs to "improve fraud detection".
- **Coverage honesty:** if `ipHash` was not captured for older accounts, show "IP доступен для N из M аккаунтов" — otherwise the absence looks like innocence.

#### E. Expiry save-list cadence

- **List definition:** non-trial `KeyCache` rows with `expiresAt ∈ [now, now + 7d]`, `status` active, and **no** paid renewal order created after the last expiry extension. Exclude keys with `autoRenew = true` and a wallet balance sufficient for the next term (they are already saved — showing them creates pointless outreach).
- **Columns:** user (name/@username/telegram link), key name, expiry date + days left, current plan (days × devices), last paid amount, lifetime paid, RFM segment, renewal history (renewed N of last M terms), autoRenew flag, last reminder stage/date, "value at risk" = last paid amount (or ARPU-weighted).
- **Sort:** value at risk desc, then days-left asc. Default filter: 7 days.
- **Cadence:** `T-7`, `T-3` (already exists), `T-1`. Optional `T-0` ("ключ истёк") only if it converts — measure before shipping. **Frequency cap: 3 reminders per key term**; a renewed key resets the term and the counter.
- **Idempotency key:** `remind:{keyId}:{stage}:{expiryDateIso}`. The current `remind:{keyId}:{date}` shape is date-based; stage must be in the key so a manual "send now" on the same day cannot double-send.
- **Suppression:** key renewed or deleted since list load; user blocked the bot (`403`); autoRenew now funded; an open ticket about this exact key (avoid two parallel threads); quiet hours for user pushes (21:00–10:00 MSK, defer to 10:00).
- **Manual + bulk:** a per-row "напомнить" button and a bulk "напомнить выбранным" that uses the existing broadcast path with a **preview of recipient count and the exact message** before send. Cap bulk at the list size; log the broadcast.
- **Measure the feature:** save-list conversion = renewed within 3 days of a reminder / reminded, shown on the same screen. Without it you cannot tell whether the 7-day stage earns its noise.
- **Copy is not a discount.** The reminder says what expires and links to renew; it does not offer a code. Auto-discounting lapsing users is an anti-feature below.

#### F. Upsell radar

- **Candidate:** active non-trial key, `daysLeft ≥ 7`, and at least one of: devices used ≥ 80% of `deviceLimit`, or 30-day traffic ≥ p75 of the active cohort, or `deviceLimit ≤ 3` with heavy usage.
- **Expected uplift per user:** `price(daysLeft prorated, devices + 2) − price(daysLeft prorated, devices)` from `TariffPrice`; show provider cost delta and margin so the operator sees net, not gross.
- **Why "radar", not "campaign":** the deliverable is a ranked worklist with a suggested action, not an automatic upsell message. Sending is manual/bulk with preview.
- **Exclusions:** trial keys (API forbids upgrade), churned/at-risk RFM users (upselling someone about to leave is worse than silence), users with an open ticket, users already offered an upgrade in the last 30 days.
- **Freshness:** `trafficUsedBytes` is a snapshot. If `lastSyncedAt` is older than 48h, show `данные устарели` and drop the row from the "top opportunities" ordering rather than presenting stale usage as fact.
- **Frequency:** one suggestion per user per 30 days, persisted, so the same 20 people are not targeted weekly.

#### G. Metric dictionary content model

A dictionary entry that only says "ARPU = revenue / users" is useless six weeks later. Each metric needs:

| Field | Purpose |
|-------|---------|
| `id` (stable slug, e.g. `mrr`, `ltv_net`, `failed_rate`) | Referenced by UI tooltips, CSV column headers, alert rules, tests. **Define in Phase 12** — retrofitting IDs later touches every report |
| RU display name + one-line plain definition | What it answers, in the owner's language |
| Formula (symbolic) + numerator/denominator | Reproducible by hand |
| Grain and window (MSK day/month; trailing vs calendar) | Removes the "which month?" ambiguity |
| Source tables/columns | `orders.final_amount`, `keys_cache.expires_at`, `wallet_tx` … |
| Filters and exclusions | Trial keys, refunded orders, degraded rows, `providerCost IS NULL` coverage |
| Good direction | Drives delta colouring and alert semantics |
| Null / zero semantics | "`—` means unknown, `0` means measured zero" |
| Refresh cadence | Daily 03:00 MSK rollup vs live query |
| Known limitations | e.g. "net LTV only over costed orders (coverage N/M)", "promo ROI is attributed, not incremental", "RFM thresholds configurable" |
| Worked example | One real period's numbers — the fastest way to end a disagreement |
| Version + last changed | Formula changes are auditable |
| Deep links to dashboard sections | Dictionary → metric and metric → dictionary |

**Architectural recommendation:** one TypeScript registry (`lib/analytics/metric-registry.ts`) exporting `{id, label, formula, direction, source, caveats, section}`. The dictionary page, the delta pills' direction, the alert rule labels and the CSV headers all read it. Documentation that lives beside the code cannot drift; a hand-written MDX page will.

#### H. CSV export contract

- **Fidelity:** identical rows and columns to what is on screen, after active filters and the selected period. Exporting only the current page is a real, common defect — always re-query unpaginated.
- **Encoding:** UTF-8 **with BOM** (Excel on Windows otherwise mangles Cyrillic), CRLF line endings, RFC 4180 quoting, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<report>_<from>_<to>.csv"`.
- **Numbers:** plain machine-readable values (`1234.56`, not `1 234,56 ₽`); put the unit in the header ("Выручка, ₽"). Excel-localized formatting breaks every downstream pivot.
- **Dates:** `YYYY-MM-DD` MSK labels; datetimes `YYYY-MM-DD HH:mm` MSK with the timezone stated in the header.
- **Formula injection:** any cell whose first non-space character is `=`, `+`, `-`, `@`, TAB, CR or LF gets a leading `'` inside the quoted field (OWASP CSV Injection / CWE-1236). Free-text columns (`username`, ticket subject, promo code, error message) are untrusted user input and will reach an admin's Excel.
- **No secrets, no sub-links:** exports carry ids, names, amounts, dates; never `subscriptionUrl`, API keys, or hashed IPs unless the report is explicitly the fraud report.
- **Large exports:** row cap (e.g. 50 000) with an explicit `обрезка: N из M` notice in the UI — silently truncating is worse than refusing.
- **Audit:** log who exported which report, period, filters, row count (one `logger.info` line; no new table needed in v1.2).
- **Metadata belongs in the filename and the UI, not in comment rows.** A `# period: …` line breaks every `pandas`/`csv` reader.

---

### Differentiators (Competitive Advantage)

Not expected, but they are what makes this dashboard better than the pile of bot-only shops in this market (which have no analytics beyond `/stats`).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Delta against **both** previous period and a stable baseline (28-day mean) | Previous-period-only deltas are noisy at low volume; a second reference line separates "trend" from "last week was weird" | LOW (once B exists) | Show a subtle secondary line in the delta tooltip: "к среднему за 28 дней: +4%" |
| "Meaningful change" bands instead of colouring every movement | Kills the Christmas-tree effect; the owner only sees red when it matters | LOW | Per-metric default band (±3% for money, ±1 pp for rates), registry-driven |
| Alert **digest** + quiet hours as a first-class feature | One evening summary beats four pushes during dinner; this is what lets a solo operator keep alerts on | MEDIUM | Reuses deferred `Notification.nextAttemptAt`; digest groups by rule |
| Alert history with acknowledgement and "why it fired" evidence | Turns alerts into an audit trail ("we saw it, we checked, it was a Platega outage") | LOW–MEDIUM | `alert_events` with observed/baseline/threshold + optional note on ack |
| Data-quality **trust banner** with per-source exclusion counts and last-sync age | Unique at this price point; makes degraded upstream behaviour visible instead of silently wrong | MEDIUM | Driven by Phase 12 flags; shown on `/admin/analytics` and inside CSV exports as `data_quality` column |
| Per-metric data-quality column in exports | Whoever audits the CSV later can see which rows were excluded and why | LOW (once H exists) | `excluded_rows`, `degraded_at` columns |
| Fraud **cluster view** (accounts + shared attribute + money trail) with dismiss/allowlist | Turns heuristics into a reviewable case file instead of a scary score | MEDIUM | Reuses user/key/order cards; no new UI paradigm |
| Save-list ranked by **value at risk** with conversion measurement | Retention worklist that shows whether outreach works, not just who is expiring | LOW–MEDIUM | Value = last paid amount; conversion = renewed ≤3 days after reminder |
| Save-list / upsell **bulk send with recipient-count preview** | One action instead of copy-pasting 40 DMs; keeps the existing broadcast safety rail | LOW | Reuses `Broadcast` + preview; cap + confirm |
| Promo **honesty panel**: new vs returning split + break-even share + "ROI по атрибуции" label | Most promo dashboards stop at revenue and flatter every campaign; this one tells the owner when a code is a margin leak | LOW–MEDIUM | Pure computation over existing orders |
| Partner **cash position** (accrued − pending − paid) beside ROI | Prevents "profitable on paper, no cash" surprises and informs payout approval | LOW | Uses `WalletTx` + `Withdrawal` statuses already present |
| Upsell radar showing **net uplift after provider cost** | Gross "upgrade worth 400 ₽" is misleading; net margin is the decision number | LOW | Uses `TariffPrice` + `providerCost` coverage |
| Metric registry driving dictionary **and** tooltips **and** CSV headers | One source of truth; impossible for docs and UI to disagree | MEDIUM | The reusable asset that outlives v1.2 |
| Dictionary "worked example" with this shop's real numbers | Ends the recurring "почему MRR такой?" conversation | LOW | Static example per metric, refreshed manually |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full alerting stack (PagerDuty/Opsgenie, on-call rotations, escalation policies, 20+ rules) | "Real companies have this" | One operator, one phone, no rotation. Escalation policies with nobody to escalate to are theatre; 20 rules on 10² orders/week guarantees fatigue within a month | 4 rules + thresholds in `Setting` + quiet hours + daily cap. Revisit only if a second person joins |
| ML / z-score / seasonal anomaly detection | Sounds smarter than thresholds | At this volume (single-digit orders/day) the baseline has huge variance; z-scores fire on normal weekday/weekend swings. Production systems that do this require 3+ seasonal cycles and volume floors | Explicit rate thresholds with absolute floors and a 3-day rolling mean. Deterministic, explainable in an alert body |
| Real-time / per-payment alerting | "I want to know instantly" | Per-event alerts on a business with a few orders an hour are pure noise; a genuine outage is visible in the daily failed-rate and in Platega's own dashboard | Daily cron (and the existing balance-alert tick for runway) |
| Auto-ban / auto-block on fraud signals | "Stop the farmers automatically" | IP signals are unreliable for VPN customers (CGNAT, carriers, shared hosting); one false ban costs a paying customer and a support thread. Stripe's own guidance is to gate high-value actions, not block identities | Observe-only flags + manual review + dismiss-with-reason. Enforcement stays a human decision |
| Device fingerprinting / anti-detect libraries / third-party fraud SDK | "Better fraud detection" | Heavy client JS in a PWA, privacy-policy exposure, monthly cost, and the abusers here are casual trial farmers, not organized fraud rings. `emailCanonical` UNIQUE + one-trial-per-account already blocks the cheap path | Keep the existing canonical-email + `trialUsed` guards; add reporting, not new tracking |
| Blocking an IP range after one abuser | Cheap and satisfying | Shared carrier NAT and campus/office ranges — you will lock out real users and never hear from them | Cluster reporting with confidence levels; never block on `ipHash` alone |
| Auto-discount / auto-coupon for expiring users | "Save them with 20% off" | Trains the whole base to lapse and wait for a code; directly erodes the margin the analytics exist to protect; needs holdout measurement to know if it even works | Reminder with a renew link; if discounts are tested later, issue a **targeted, time-boxed** code and measure against a holdout |
| Automatic upsell DMs to every heavy user | "Free money" | Nagging power users is the fastest way to lose the best customers; upgrades on ARTEMIDA are prorated and non-trivial to explain | Ranked radar + manual/bulk send with preview + 30-day per-user cap |
| Arbitrary segment builder / SQL console for admins | "I want any cut" | Becomes an unaudited query surface over PII and money tables; the existing RFM segments + period/source filters cover the real questions | Fixed filters on existing reports; new cuts go through a code change with tests |
| Warehouse / BI export (BigQuery sync, scheduled email reports, Metabase embed) | "Grow into it" | A second system to operate, credential-sprawl, and the operator will still look at the same 8 numbers | CSV export + one admin page. Revisit only when a second analyst exists |
| XLSX with formulas, merged headers, multi-sheet "beautiful report" | "Excel users want it" | Formula cells are an injection surface; merged headers break parsing; openpyxl-class dependencies for cosmetics | Flat CSV, one table per file, units in headers, BOM for Excel |
| Chart-only / image-based export (PNG dashboards) | "For reports" | Nobody can recompute from a PNG; the point of export is verification | CSV of the underlying rows |
| Auto-resolving alerts by muting the metric | "Stop the noise" | Silently hides a real incident; the owner forgets the mute exists | Explicit per-rule toggle with a visible "выключено" state on the alerts page |
| Alerting on every metric with % thresholds | "Complete coverage" | Guarantees the Christmas tree and trains the owner to ignore all of them | Alert only on money, payments failure, support load, and runway — the four things that require action today |

---

## Feature Dependencies

```
[Phase 12 — metric registry + MSK period helpers]  (exists partially: lib/analytics/time.ts)
    ├──requires──> [v1.1 loaders return numerators/denominators, not just formatted values]
    ├──enables──> [WoW/MoM deltas on every metric]
    ├──enables──> [Metric dictionary entries (same ids)]
    └──enables──> [CSV headers + tooltips]

[Data-quality flags (EXT-05)]
    ├──requires──> [ARTEMIDA client classifies degraded responses (timeout/5xx/partial)]
    ├──requires──> [Rollup stores exclusion counts per day/metric]
    ├──requires──> [Alert rules ignore degraded days]
    └──enables──> [Trust banner, per-metric badge, CSV data_quality column]

[Anomaly alerts (ALR-02/03/04)]
    ├──requires──> [Phase 12 deltas/baselines]
    ├──requires──> [Notification queue (dedupeKey) + admin target resolution — EXISTS]
    ├──requires──> [Setting read at cron time — EXISTS]
    ├──enhances──> [Runway alert extends lib/balance-alert.ts — EXISTS]
    └──enables──> [Saved-list/upsell bulk sends reusing the same admin notify path]

[Promo funnel (PRM-01)]
    ├──requires──> [ReferralClick for partner codes — EXISTS]
    ├──BLOCKED FOR GENERIC CODES──> [no click capture: ReferralClick.ownerUserId is NOT NULL]
    ├──requires──> [PromoCode.ownerUserId attribution + Order.promoCode — EXISTS]
    └──enables──> [Promo ROI (PRM-02)]

[Promo ROI (PRM-02)]
    ├──requires──> [Order.amount / finalAmount / providerCost / balanceUsed — EXISTS]
    └──requires──> [gross margin % from v1.1 economics.ts — EXISTS]

[Partner ROI incl. withdrawals (PRM-03)]
    ├──requires──> [WalletTx referral_bonus — EXISTS]
    ├──requires──> [Withdrawal statuses pending/approved/rejected — EXISTS]
    └──enables──> [Partner cash-position view]

[Fraud signals (PRM-04)]
    ├──requires──> [emailCanonical UNIQUE — EXISTS]
    ├──requires──> [trialUsed one-per-account — EXISTS]
    ├──requires──> [self-referral guard at bind time — EXISTS (partial: direct self only)]
    ├──GAP──> [User.signupIpHash / trial-claim ipHash — DOES NOT EXIST]
    ├──GAP──> [blocked-attempt counter for canonical-email collisions — DOES NOT EXIST]
    └──requires──> [order/key/user cards for evidence views — EXISTS]

[Save-list (EXT-01)]
    ├──requires──> [KeyCache.expiresAt/status/isTrial — EXISTS]
    ├──requires──> [remind-expiry notification pipeline + dedupe — EXISTS]
    ├──requires──> [Setting for cadence/caps — EXISTS]
    ├──requires──> [Broadcast for bulk send — EXISTS]
    └──enables──> [save-list conversion metric]

[Upsell radar (EXT-02)]
    ├──requires──> [KeyCache.trafficUsedBytes/devices/lastSyncedAt — EXISTS]
    ├──requires──> [TariffPrice grid + provider cost — EXISTS]
    ├──conflicts──> [upsell messaging to at-risk/churned RFM segments]
    └──requires──> [trial exclusion (API forbids upgrade)]

[CSV export (EXT-06)]
    ├──requires──> [every report loader returns rows + column metadata]
    ├──requires──> [shared CSV serializer (BOM, CRLF, quoting, injection guard)]
    └──enhances──> [metric dictionary / data-quality auditability]

[Metric dictionary (EXT-07)]
    ├──requires──> [metric registry ids frozen in Phase 12]
    └──enables──> [delta direction, alert labels, CSV headers]
```

### Dependency Notes

- **Freeze metric IDs in Phase 12, not Phase 16.** The dictionary is the last phase, but every earlier phase needs the same ids for tooltips, alert labels and CSV headers. A `lib/analytics/metric-registry.ts` created in Phase 12 makes Phase 16 a page, not a refactor.
- **Generic promo codes have no funnel top today.** `ReferralClick.ownerUserId` is non-null, so clicks are only recorded for partner-owned codes and subdomains. PRM-01's `click → register → pay` is therefore only truthful for partner codes unless Phase 14 either (a) generalises click capture to a nullable owner + `promoCodeId`, or (b) explicitly scopes the promo funnel to partner codes and shows `—` for click on generic codes. Decide this in the phase plan; do not ship a fabricated click count.
- **`ipHash` is not stored on `User`.** It exists on `ReferralClick` and `TelegramLoginToken` only. PRM-04's "trial farms by `ipHash`" requires capturing a hashed IP at registration and/or trial claim (new nullable column or a small `trial_claims` table). This is a schema migration and a privacy review — plan it explicitly, and backfill is impossible (existing accounts will show "IP недоступен").
- **`emailCanonical` clustering is a non-signal by construction.** The UNIQUE constraint already collapses aliases, so there is nothing to cluster. The useful artefact is a counter of *rejected/merged attempts*, which must be recorded at the register/trial path. Without that, the fraud page will show an empty chart and look broken.
- **Self-cycles are possible but narrow.** Direct self-referral is blocked (`bindReferral` never self, first-wins), but `referredById` binds *once and only while NULL*, so a user who registered without a code can later bind to someone who was referred by them → a mutual pair. Detection is cheap (join on the pair); prevention is cheaper (reject a code whose owner is downstream of the binder). Do both; the guard belongs in `lib/referrals.ts`, not in the analytics layer.
- **Runway alert should extend `lib/balance-alert.ts`, not duplicate it.** It already classifies `ok/low/critical/unknown` and enqueues per-admin notifications with a dedupe key. ALR-03 adds a runway-days band and a `Setting` threshold; rewriting the notification path would create two competing alert systems.
- **Reminders already exist at T-3** (`workers`/`lib/worker.ts` `runReminderScan`, dedupe `remind:{keyId}:{date}`). EXT-01 is an extension (T-7/T-3/T-1, stage-aware key, list UI, suppression rules), not a new pipeline.
- **Bulk save-list/upsell sends must reuse `Broadcast`**, including its preview and status fields (`total/sent/failed`). A second ad-hoc sender would bypass the one safeguard the operator has against a 400-message mistake.
- **Upsell radar conflicts with retention outreach for the same user.** At-risk/churned RFM users must not receive upsell suggestions; enforce this in the query, not in the UI, so CSV/bulk paths cannot leak them.
- **CSV depends on loaders, not on pages.** The current reporting functions return view models; Phase 16 either adds a `rows` shape to each loader or re-queries in the export route. Prefer the former — one code path means the CSV can never disagree with the screen.

---

## MVP Definition

The milestone is already scoped to phases 12–16; this is what "minimum" means *inside* each, so the planner does not gold-plate.

### Launch With (v1.2 = the milestone)

- [ ] **Phase 12 — delta contract + data-quality flags** — one `comparePeriods` helper, registry ids, zero-baseline labels, `—` for missing baselines, degraded flags with exclusion counts. Nothing else.
- [ ] **Phase 13 — four alert rules** — payments drop, failed-rate spike, ticket spike, runway threshold; dedupe keys, 3-day rolling mean, quiet hours, daily cap, history + toggles + test send.
- [ ] **Phase 14 — promo/partner quality + fraud** — partner funnel (exists) extended to admin view; generic promo click decision; attributed-ROI honesty panel; partner cash position; four fraud signals (self-dealing promo, mutual referral pair, IP clusters with coverage caveat, trial→pay ratio with n≥20).
- [ ] **Phase 15 — save-list + upsell radar** — 7-day list with value at risk and contacts; T-7/T-3/T-1 stage-aware idempotent reminders; per-row and bulk send with preview; radar ranked by net uplift with freshness guard.
- [ ] **Phase 16 — CSV + dictionary** — shared serializer (BOM/CRLF/quote/injection), export on every report with filters and row cap; registry-driven dictionary page linked both ways.

### Add After Validation (v1.2.x)

- [ ] Alert digest tuning / per-rule quiet-hours override — trigger: the owner mutes a rule because it fires at a bad time.
- [ ] Save-list T-0 reminder — trigger: T-7/T-3/T-1 conversion is healthy and post-expiry win-back is requested.
- [ ] Deeper fraud graph (buyer↔inviter linkage across time windows) — trigger: a real trial farm is found and the current cluster view is insufficient.
- [ ] Promo holdout experiment support (flag a share of users as control) — trigger: promo spend becomes material and the owner asks "did this really work?".

### Future Consideration (v2+)

- [ ] Web-push to the PWA for admin alerts — why defer: no push infrastructure; Telegram already reaches the phone.
- [ ] Warehouse/BI sync and scheduled report emails — why defer: a second system to operate for one reader.
- [ ] Automatic fraud enforcement / payout holds — why defer: false-positive cost outweighs losses at this scale; needs a track record of signals first.
- [ ] Incremental-lift modelling for promos/referrals — why defer: requires volume and holdouts; attributed ROI with honest labelling is enough now.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| WoW/MoM deltas with correct zero-baseline handling | HIGH | LOW | P1 |
| Metric registry (ids, direction, formula) | HIGH (unblocks 4 features) | LOW | P1 |
| Data-quality flags + exclusion counts | HIGH | MEDIUM | P1 |
| Four anomaly alerts + dedupe + quiet hours | HIGH | MEDIUM | P1 |
| Alert history + per-rule toggles | MEDIUM | LOW | P1 |
| Partner funnel (extend existing) | HIGH | LOW | P1 |
| Promo discount cost / revenue / attributed ROI | HIGH | MEDIUM | P1 |
| Partner ROI + cash position (withdrawals) | HIGH | LOW | P1 |
| Fraud: self-dealing promo, mutual referral pair | HIGH | LOW | P1 |
| Expiry save-list + T-7/T-3/T-1 idempotent reminders | HIGH | MEDIUM | P1 |
| CSV export per report (shared serializer) | HIGH | LOW per report | P1 |
| Metric dictionary page (registry-driven) | MEDIUM | LOW | P1 |
| Upsell radar (ranked, net uplift, freshness) | MEDIUM | MEDIUM | P2 |
| Fraud: ipHash trial clusters (needs schema) | MEDIUM | MEDIUM | P2 |
| Fraud: trial→pay ratio by source with CI | MEDIUM | LOW–MEDIUM | P2 |
| New vs returning promo split / break-even share | MEDIUM | LOW | P2 |
| Alert digest + baseline second reference | MEDIUM | LOW | P2 |
| Save-list conversion measurement | MEDIUM | LOW | P2 |
| Fraud dismiss/allowlist workflow | MEDIUM | LOW | P2 |
| Fraud payout-concentration signal | LOW–MEDIUM | LOW | P3 |
| Refund-after-commission clawback flag | LOW | LOW | P3 |
| Data-quality column inside CSV | LOW | LOW | P3 |

**Priority key:** P1 = required for the milestone to be credible; P2 = include if the phase has room; P3 = note in the backlog.

---

## Competitor Feature Analysis

| Feature | Stripe / Recurly / Chargebee | Baremetrics / ChartMogul | Rewardful / PartnerStack / Tapfiliate | Our approach |
|---------|------------------------------|--------------------------|----------------------------------------|--------------|
| Period comparison | Default "vs previous period" on every metric, zero-baseline suppressed | MRR movement + prior-period comparisons built in | Traffic/conversion vs prior period | Every KPI gets abs+% with `—` for no baseline, recalculated ratios, MSK windows |
| Anomaly alerting | Threshold alerts on payment/error rates, routed to email/Slack; heavy config | Limited; mostly digests and forecasts | Almost none (manual review) | 4 rules, absolute floors, 3-day rolling mean, quiet hours, dedupe, history. Deliberately smaller than Stripe |
| Pre-dunning / save campaigns | Sophisticated retry + card-expiry cadence (30/7 days) across many emails | Retention playbooks, churn scores | n/a | Telegram-native cadence T-7/T-3/T-1, 3-per-term cap, idempotent, with conversion measurement. No card expiry concept — the analogue is key expiry |
| Promo measurement | Coupon redemption + revenue; incrementality not measured | n/a | Coupon/affiliate reporting, commission tracking | Attributed ROI + explicit caveat, new-vs-returning split, break-even share, discount cost from actual order deltas |
| Partner economics | n/a | n/a | Commission accrual, payouts, EPC, activation rate | Accrual ROI **and** cash position (pending/approved/rejected withdrawals), plus revenue-quality checks |
| Fraud signals | Stripe Radar / Sift-style scoring, device fingerprints | n/a | Affiliate fraud screening, payout holds | Human-review signals only: self-dealing code, mutual referral pair, IP clusters (weak, coverage-labelled), trial→pay ratio with n≥20 and CI |
| Metric dictionary | Extensive public definitions; in-product tooltips limited | Public metric glossary | Limited | Registry-driven in-product dictionary with formula, source, exclusions, caveats, worked example, deep links |
| Export | CSV on most tables; API | CSV/API, warehouse sync | CSV of clicks/conversions/commissions | Flat CSV per report, screen-parity, BOM, injection-safe, row cap with explicit notice |
| Fit for a one-person VPN shop | Over-configured; needs a team to tune | Right size for revenue metrics, but no Telegram/keys context | Built for affiliate programs with managers | Four alerts, Telegram delivery, no new infra, everything reachable from the phone |

---

## Sources

- **Codebase (HIGH):** `prisma/schema.prisma` (User.emailCanonical/referredById/trialUsed, PromoCode.ownerUserId, ReferralClick.ipHash/ownerUserId NOT NULL, Withdrawal statuses, WalletTx reasons, KeyCache traffic/devices/expiresAt, DailyMetric, Setting, Notification.dedupeKey, Outbox), `lib/analytics/*` (time.ts MSK rules, economics.ts runway/margin, loaders), `lib/referral-stats.ts` (existing click→register→pay funnel), `lib/balance-alert.ts` + `lib/worker.ts` (existing low-balance and T-3 reminder pipelines), `lib/referrals.ts` (bind-once, self-referral guard, partner/upline credit), `lib/promo.ts`, `.planning/PROJECT.md`, `.planning/ROADMAP.md` (phases 12–16), `.planning/REQUIREMENTS.md`.
- **Period comparison (MEDIUM):** Zenovay "Comparing Date Periods" (delta pills, zero previous, equal-length mirroring); Practical Reporting "vs previous period worse than useless" (false alarms, Christmas tree); CSV-to-dashboard variance guide (absolute + percent, "New/No baseline" labels); dbsyntax rolling metrics (`NULLIF` guard, date spine, don't act on a single noisy day); Rukon "Comparison Baselines" (N/A not zero, exclude the judged day from its own baseline); Lightdash period-over-period docs.
- **Alert tuning (MEDIUM):** AppSignal alert tuning (threshold/warm-up/cooldown, rates over counts, routing by urgency); tripl anomaly docs (median/MAD baselines need ≥3 seasonal cycles, cooldown, min expected count); ZopNight (7-day cooldown, dedupe by anomaly key, absolute floors); detectkit cooldown patterns; Netdata alert-fatigue (static thresholds vs rolling baselines).
- **Promo ROI (MEDIUM):** Voucherify coupon ROI (incremental profit, not revenue); Clinch incrementality (attributed vs incremental, holdout); Uniqodo promotional effectiveness (baseline/forward-buying/cannibalization/incremental split, unique codes per channel); revenexx promotion cost (redemptions and discount given are facts; incrementality is an estimate); Blufire discount-code analysis (break-even new-order share); Cozl Labs four levels of promo measurement.
- **Partner/affiliate ROI (MEDIUM):** Track360 true affiliate ROI (commissions + platform + ops + fraud costs); TrackRev five affiliate metrics (affiliate CAC, LTV ratio, overhead rate, activation efficiency, net margin); Rewardful/EasyAffiliate ROI formulas (revenue − commissions − costs, actual payouts only); automateed KPI set (EPC, ROAS, refund-adjusted revenue).
- **Trial abuse / fraud (MEDIUM):** Stripe "How to detect fake users and multiaccount abuse" (no single conclusive signal, link analysis, confidence scoring, gate high-value actions); Stripe identity risk scoring (false-positive rates must be measured, explain which signals fired); Stytch trial-abuse guidance (visitor ID vs fingerprint, shadow-ban/log strategies); AntiTrial signal table (IP velocity, disposable domains, VPN-IP false positives); Layercall/DEV (normalise aliases first, IP blocking hits shared networks, "linkage is a reason to verify, not to accuse"); FingerPrint Checker (one trial per normalised email/device, per-network caps).
- **Save-list cadence / pre-dunning (MEDIUM):** Recurly dunning cadence (3–4 messages per 28 days, countdown to consequence); Chargebee retry/sequence guidance; Churn.io pre-dunning (30-day and 7-day pre-expiry sends, in-app nudge, suppress when already resolved); Revenudge (30/14/7 cadence, prevention beats recovery); ChurnBot (21–30d, 7d, 1–2d; fewer sharper touches); Subscription Index timing framework.
- **Metric dictionary (MEDIUM):** dbt metrics/semantic layer docs (name/description/label/type/filter, grain); DataDost metric dictionary contract (definition, formula, grain, source, owner, cadence, acceptable variance, caveats); markdown Metric Definition template (grain/dimensions, source tables + SQL sketch, filters, caveats, ownership, version, worked example, validation); Andrew Madson on metric portability needing ownership/lineage/policy context.
- **CSV export (HIGH for security, MEDIUM for ergonomics):** OWASP CSV Injection + WSTG (formula triggers `= + - @`, TAB/CR/LF, full-width variants, quoting/prefix mitigations and Excel save-reopen caveat); CWE-1236; MUI X `utf8WithBom`; DevExpress `encodeExecutableContent`; CoreUI CSV export options (scope filtered/all, BOM, sanitize); Apex Dashboard export notes (BOM, CRLF, server-paged `getAllRows` defect, non-scalar JSON encoding).
- **Market context (LOW–MEDIUM):** prior v1.0 feature research in this repo (RU Telegram VPN bots ship `/stats` and `/sendall` only; admin analytics beyond counts is a differentiator at this price point).

---

*Feature research for: 3set-white v1.2 — stabilization & quality features (period deltas, anomaly alerts, promo/referral quality + fraud, save-list, upsell radar, data quality, CSV, metric dictionary)*
*Researched: 2026-10-31*
