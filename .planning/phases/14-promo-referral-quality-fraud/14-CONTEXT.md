# Phase 14: Promo & Referral Quality + Fraud — Context

**Phase:** 14  
**Milestone:** v1.2 Стабилизация и качество  
**Requirements:** PRM-01, PRM-02, PRM-03, PRM-04  
**Status:** Discussion complete, ready for planning

---

## Overview

Phase 14 delivers visibility into promo code and partner performance (funnel, ROI) plus fraud signals (self-dealing, mutual pairs, trial farms). All metrics use MSK windows and exclude degraded data from Phase 12.

---

## Key Decisions (Locked)

### DEC-14-01: Promo Click Capture — Nullable Owner

**Decision:** Extend `promo_clicks` table with nullable `ownerUserId` to capture clicks for **all** promo codes (generic + partner-owned).

**Rationale:** PRM-01 requires `click → register → pay` funnel "по каждому промокоду". Generic codes have no owner, so `ownerUserId` must be nullable.

**Schema:**
```prisma
model PromoClick {
  id          String   @id @default(cuid())
  promoCode   String   @map("promo_code")
  ownerUserId Int?     @map("owner_user_id") // nullable for generic codes
  userId      Int?     @map("user_id")       // resolved on register
  ipHash      String   @map("ip_hash")       // sha256
  source      String   // UTMs, referrer, direct
  createdAt   DateTime @default(now())
  
  @@index([promoCode, createdAt])
  @@index([ownerUserId, createdAt])
  @@map("promo_clicks")
}
```

**Impact:**
- `/api/promo/click` beacon writes for all codes (owner = null for generic)
- Funnel shows clicks for generic codes (not just partner codes)
- PRM-01 success criterion met: funnel "по каждому промокоду"

**Downstream:** Planner must include schema migration + beacon route.

---

### DEC-14-02: Account-Level IP Hash for Fraud

**Decision:** Add `User.signupIpHash String?` column, collected at registration and trial claim.

**Rationale:** PRM-04 requires trial farm detection by `ipHash`. Current `ReferralClick.ipHash` only covers referred users (~50% of trials). Organic trials need IP capture too.

**Schema:**
```prisma
model User {
  // ... existing fields ...
  signupIpHash String? @map("signup_ip_hash") // sha256, "direct" excluded
}
```

**Implementation:**
- Hash IP at `/api/auth/register` and `/api/trial/claim`
- Exclude `"direct"` sentinel (no hash for direct traffic)
- Store as sha256 hex (64 chars), never raw IP
- History is forward-only: "IP доступен для N из M аккаунтов" in UI

**Privacy:**
- No raw IP stored
- Retention period stated in privacy policy
- Used for fraud signals only (observation, never auto-block)

**Impact:**
- PRM-04 success criterion met: IP-cluster fraud signals
- UI must show coverage: "IP доступен для 123 из 456 аккаунтов"
- Old accounts remain without IP (backfill impossible)

**Downstream:** Planner must include schema migration + registration/trial path updates.

---

### DEC-14-03: Partner ROI — Two Views

**Decision:** Show **both** accrual ROI and cash position on partner dashboard.

**Formulas:**
```
attributedRevenue = Σ finalAmount of paid orders by users with referredById = partner
commissions       = Σ positive WalletTx(referral_bonus) for partner in period
providerCost      = Σ providerCost on attributed orders (known only)
contribution      = attributedRevenue − providerCost − commissions

Accrual ROI  = contribution / commissions           // did buyers pay for commission?
Cash Position = commissions − payoutsApproved − payoutsPending  // how much still owed
```

**UI:**
- Both metrics shown on `/admin/partner/[id]` dashboard
- Accrual ROI: percentage (e.g., `+145%`)
- Cash Position: rubles (e.g., `12 500 ₽ к выплате`)
- `ROI = —` when commissions = 0 (no divide-by-zero)

**Rationale:** PRM-03 explicitly requires "Partner ROI с учётом выплат". Single ROI number without withdrawals answers wrong question.

**Downstream:** Planner must include both calculations in partner dashboard.

---

### DEC-14-04: Fraud Thresholds — Approved Defaults

**Decision:** Approve the following fraud detection thresholds:

| Signal | Threshold | Action |
|--------|-----------|--------|
| **Trial farm (ipHash)** | ≥3 accounts with same `ipHash` in 30 days | Show cluster, LOW confidence |
| **Self-dealing promo** | `PromoCode.ownerUserId == Order.userId` (any occurrence) | HIGH confidence flag |
| **Mutual referral pair** | `A.referredById = B` AND `B.referredById = A` | Show pair, MEDIUM confidence |
| **Trial→no-pay ratio** | Source with ≥20 trials AND pay-rate ≤50% of overall rate | Wilson 95% interval, show n |
| **Payout concentration** | Payouts >70% of commissions AND ≥2 buyers share partner's `ipHash` | Flag for manual review |

**Confidence Levels:**
- **Наблюдение (LOW):** Single signal, high false-positive rate (e.g., IP cluster)
- **Проверить (MEDIUM):** 2+ signals agree (e.g., mutual pair + shared IP)
- **Высокий риск (HIGH):** Money-flow signals (self-dealing, chargeback after commission)

**Implementation:**
- All signals are **observation only** — no auto-bans
- Evidence view: expand to accounts, shared attribute, specific orders/wallet entries
- Allowlist: owner/test accounts excluded
- Dismissals: `fraud_dismissals` table (signal, subject, reason, admin, timestamp)

**Downstream:** Planner must include fraud detection service + admin UI with confidence levels.

---

## Dependencies

**Phase 12 (required):**
- MSK window functions (`mskDayLabel`, `comparisonWindows`)
- Data-quality flags (degraded ARTEMIDA responses excluded)
- `promo_clicks` table schema (extended by DEC-14-01)
- `User.signupIpHash` column (added by DEC-14-02)

**Phase 13 (reuse):**
- Outbox/Telegram delivery (`Notification` table, `drainNotificationType`)
- Quiet hours logic (22:00–09:00 MSK)
- Daily DM limit (≤3/admin/day)

**Existing infrastructure:**
- `ReferralClick` table (partner code clicks)
- `WalletTx` table (referral bonuses)
- `Withdrawal` table (partner payouts)
- `PromoCode` table (codes + ownerUserId)
- `User.referredById` (attribution, first-wins)

---

## Out of Scope (v1.2)

- **IP-based auto-blocking:** Fraud signals are observation-only
- **Incremental ROI:** Attribution-based only (not A/B tested incrementality)
- **Generic promo code discounts:** Valuation of day-based rewards excluded
- **Historical IP backfill:** `signupIpHash` is forward-only
- **English localization:** RU/RUB only

---

## Success Criteria (from ROADMAP.md)

1. ✅ По каждому промокоду (generic + партнёрскому) и партнёру видна воронка `click → register → pay` с конверсиями
2. ✅ По каждому промокоду видна стоимость скидки, выручка и ROI за период (ROI по атрибуции, new/returning split)
3. ✅ Partner ROI считается с учётом выплат (`Withdrawal`): accrual ROI + cash position
4. ✅ Fraud-сигналы P1: self-dealing, mutual pairs, trial→no-pay ratio, IP-кластеры (наблюдение, без авто-банов)
5. ✅ Все показатели считаются на MSK-периодах и исключают degraded-данные из Phase 12

---

## Deferred Ideas (Backlog)

| Idea | Reason for Deferral | Potential Phase |
|------|---------------------|-----------------|
| IP-cluster auto-blocking | Privacy review needed, high false-positive rate | v1.3+ |
| Incremental ROI measurement | Requires A/B testing infrastructure | v1.3+ |
| Generic promo code valuation | Complex attribution, day-based rewards out of scope | v1.3+ |
| Fraud scoring (composite) | Needs historical data to tune weights | v1.3+ |

---

## Implementation Notes

### Schema Changes Required

1. **`promo_clicks` table:**
   - `ownerUserId Int?` (nullable for generic codes)
   - Migration: ALTER COLUMN DROP NOT NULL

2. **`User` table:**
   - `signupIpHash String?` (new column)
   - Migration: ADD COLUMN

### Routes Required

1. **`/api/promo/click`** — Beacon for generic promo code clicks
2. **`/api/admin/promos/quality`** — Promo quality dashboard data
3. **`/api/admin/referrals/quality`** — Partner quality dashboard data
4. **`/api/admin/fraud/signals`** — Fraud signals list
5. **`/api/admin/fraud/dismiss`** — Dismiss fraud signal

### Pages Required

1. **`/admin/promos/quality`** — Promo code funnel + ROI
2. **`/admin/referrals/quality`** — Partner quality + fraud signals
3. **`/admin/fraud`** — Fraud signals dashboard (all types)

### Pure Functions Required

1. **`lib/analytics/promo-funnel.ts`** — Funnel calculation (click→register→pay)
2. **`lib/analytics/promo-roi.ts`** — ROI calculation (discount cost, revenue, attribution)
3. **`lib/analytics/partner-roi.ts`** — Partner ROI (accrual + cash)
4. **`lib/analytics/fraud.ts`** — Fraud signals (ipHash clusters, mutual pairs, self-dealing, trial→no-pay)

### Services Required

1. **`lib/analytics/growth-service.ts`** — DB access for funnel/ROI/fraud loaders
2. **`lib/fraud-service.ts`** — Fraud signal aggregation + dismissal management

---

## Next Steps

1. **Run `/gsd-plan-phase 14`** — Create detailed PLAN.md with task breakdown
2. **Schema migration** — Add `promo_clicks.ownerUserId?` + `User.signupIpHash`
3. **Beacon route** — `/api/promo/click` for generic code clicks
4. **Pure functions** — promo-funnel, promo-roi, partner-roi, fraud detectors
5. **Service layer** — DB loaders for all metrics
6. **Admin pages** — Promo quality, Partner quality, Fraud dashboard
7. **Tests** — Unit tests for pure functions, integration tests for loaders

---

**Discussion complete.** Ready for `/gsd-plan-phase 14`.
