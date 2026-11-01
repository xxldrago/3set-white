---
phase: 14
plan: '14'
type: execute
wave: 1
depends_on: [12]
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/20261102000000_phase14_promo_clicks_nullable_signup_ip_hash/migration.sql
  - app/api/promo/click/route.ts
  - app/api/auth/register/route.ts
  - app/api/trial/claim/route.ts
  - lib/analytics/promo-funnel.ts
  - lib/analytics/promo-roi.ts
  - lib/analytics/partner-roi.ts
  - lib/analytics/fraud.ts
  - lib/analytics/growth-service.ts
  - lib/fraud-service.ts
  - app/admin/promos/quality/page.tsx
  - app/admin/referrals/quality/page.tsx
  - app/admin/fraud/page.tsx
  - components/admin/PromoFunnelCard.tsx
  - components/admin/PartnerRoiCard.tsx
  - components/admin/FraudSignalsTable.tsx
  - app/api/admin/promos/quality/route.ts
  - app/api/admin/referrals/quality/route.ts
  - app/api/admin/fraud/signals/route.ts
  - app/api/admin/fraud/dismiss/route.ts
  - lib/i18n/messages/ru.ts
  - tests/unit/promo-funnel.test.ts
  - tests/unit/promo-roi.test.ts
  - tests/unit/partner-roi.test.ts
  - tests/unit/fraud.test.ts
  - tests/integration/growth-service.test.ts
autonomous: true
requirements: [PRM-01, PRM-02, PRM-03, PRM-04]

must_haves:
  truths:
    - "promo_clicks.ownerUserId is nullable for generic promo codes"
    - "Click beacon /api/promo/click captures clicks for all promo codes (generic + partner)"
    - "User.signupIpHash collected at register and trial claim, sha256 of IP, 'direct' excluded (null)"
    - "Promo funnel shows click→register→pay for every promo code and partner"
    - "Promo ROI shows discount cost vs revenue with new/returning split (attributed, not incremental)"
    - "Partner ROI shows both accrual ROI and cash position (commissions - payoutsApproved - payoutsPending)"
    - "Fraud signals: self-dealing, mutual referral pairs, trial farms by ipHash, trial→no-pay ratio by source - observation only, no auto-blocks"
    - "Fraud UI shows confidence levels (наблюдение/проверить/высокий риск), evidence, dismissals"
    - "All metrics use MSK windows and exclude degraded data from Phase 12"
  artifacts:
    - prisma/schema.prisma — PromoClick.ownerUserId nullable, User.signupIpHash
    - app/api/promo/click/route.ts — beacon for all codes
    - lib/analytics/promo-funnel.ts — pure funnel calculations
    - lib/analytics/promo-roi.ts — pure ROI calculations
    - lib/analytics/partner-roi.ts — pure partner ROI (accrual + cash)
    - lib/analytics/fraud.ts — pure fraud detectors
    - lib/analytics/growth-service.ts — DB loaders
    - app/admin/promos/quality/page.tsx — promo quality dashboard
    - app/admin/referrals/quality/page.tsx — partner quality dashboard
    - app/admin/fraud/page.tsx — fraud signals dashboard
  key_links:
    - "promo click beacon writes to promo_clicks for generic codes (ownerUserId null)"
    - "register/trial paths write User.signupIpHash (sha256, skip 'direct')"
    - "funnel joins promo_clicks by promoCode, users by referredById"
    - "partner ROI uses WalletTx(referral_bonus) and Withdrawal"
    - "fraud detection uses User.signupIpHash with forward-only coverage"

---

# Phase 14: Promo & Referral Quality + Fraud

**Goal:** As an admin, I want to see which promo codes and partners actually drive revenue (with ROI) and spot fraud signals, so I can optimize partnerships and catch abuse without blocking users automatically.

## Objective

Deliver promo/referral quality dashboards (funnel, ROI for both codes and partners) and fraud detection (self-dealing, mutual pairs, IP clusters, trial→no-pay) with observation-only signals.

## Context

@.planning/phases/14-promo-referral-quality-fraud/14-CONTEXT.md
@.planning/REQUIREMENTS.md
@prisma/schema.prisma
@lib/analytics/windows.ts
@lib/analytics/compare.ts

## Tasks

<task type="auto" tdd="true">
  <name>Task 1: Schema changes (promo_clicks nullable owner, User.signupIpHash)</name>
  <files>prisma/schema.prisma, prisma/migrations/20261102000000_phase14_promo_clicks_nullable_signup_ip_hash/migration.sql</files>
  <action>
    1. Update prisma/schema.prisma:
       - PromoClick: make ownerUserId Int? @map("owner_user_id") (nullable for generic codes)
       - User: add signupIpHash String? @map("signup_ip_hash")
    
    2. Create migration to:
       - ALTER TABLE promo_clicks ALTER COLUMN owner_user_id DROP NOT NULL
       - ALTER TABLE users ADD COLUMN signup_ip_hash TEXT
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npx prisma generate && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - PromoClick.ownerUserId nullable
    - User.signupIpHash added
    - Migration created
    - Prisma client regenerated
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Promo click beacon + IP capture at registration/trial</name>
  <files>app/api/promo/click/route.ts, app/api/auth/register/route.ts, app/api/trial/claim/route.ts, lib/client-ip.ts</files>
  <action>
    1. Create/extend app/api/promo/click/route.ts to capture clicks for all promo codes:
       - Accept { code } or { promoCode }
       - Find PromoCode by code
       - Write to promo_clicks with ownerUserId = promoCode.ownerUserId (null if generic)
       - Get IP via clientIp(), hash if not "direct", store in ipHash
       - Return 200 ok
    
    2. Update app/api/auth/register/route.ts to capture signupIpHash:
       - Get client IP, if !== "direct" hash with sha256 and store in User.signupIpHash
    
    3. Update app/api/trial/claim/route.ts similarly for trial claims
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - /api/promo/click works for generic codes (ownerUserId null)
    - Register captures signupIpHash for non-direct IPs
    - Trial claim captures signupIpHash
    - "direct" excluded (null)
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Pure analytics functions (funnel, ROI, fraud)</name>
  <files>lib/analytics/promo-funnel.ts, lib/analytics/promo-roi.ts, lib/analytics/partner-roi.ts, lib/analytics/fraud.ts, tests/unit/promo-funnel.test.ts, tests/unit/promo-roi.test.ts, tests/unit/partner-roi.test.ts, tests/unit/fraud.test.ts</files>
  <action>
    Create pure functions with unit tests:
    
    1. promo-funnel.ts:
       - computeFunnel(clicks, registers, pays) -> {clicks, registers, pays, cvr1, cvr2}
    
    2. promo-roi.ts:
       - computePromoRoi(revenue, discountCost, commissions) -> {roi, breakEven}
       - Split by new/returning
    
    3. partner-roi.ts:
       - computePartnerRoi(attributedRevenue, commissions, payoutsApproved, payoutsPending, providerCost) -> {accrualRoi, cashPosition, contribution}
    
    4. fraud.ts:
       - detectSelfDealing(promoCodes, orders) -> signals
       - detectMutualReferrals(users) -> signals
       - detectIpClusters(users) -> signals (>=3 same ipHash in 30d)
       - detectTrialNoPayRatio(trialsBySource, paysBySource, overallRate) -> signals (>=20 trials, <=50% of overall)
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npx vitest run tests/unit/promo-funnel.test.ts tests/unit/promo-roi.test.ts tests/unit/partner-roi.test.ts tests/unit/fraud.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - All pure functions implemented
    - Unit tests pass
    - Correct formulas per CONTEXT
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 4: Growth service + API routes</name>
  <files>lib/analytics/growth-service.ts, lib/fraud-service.ts, app/api/admin/promos/quality/route.ts, app/api/admin/referrals/quality/route.ts, app/api/admin/fraud/signals/route.ts, app/api/admin/fraud/dismiss/route.ts</files>
  <action>
    1. growth-service.ts - DB loaders:
       - loadPromoQuality(period) - funnel + ROI per promo code
       - loadPartnerQuality(period) - partner list with ROI
       - loadFraudSignals() - all fraud signals
    
    2. fraud-service.ts - fraud management
       - dismissSignal(signalId, reason, adminId)
       - getDismissedSignals()
    
    3. API routes with requireRole('administrator')
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - Services load data correctly
    - API routes protected by admin auth
    - Exclude degraded data from Phase 12
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 5: Admin UI (promos, partners, fraud)</name>
  <files>app/admin/promos/quality/page.tsx, app/admin/referrals/quality/page.tsx, app/admin/fraud/page.tsx, components/admin/PromoFunnelCard.tsx, components/admin/PartnerRoiCard.tsx, components/admin/FraudSignalsTable.tsx, lib/i18n/messages/ru.ts</files>
  <action>
    1. Create pages:
       - /admin/promos/quality - table of promo codes with funnel + ROI
       - /admin/referrals/quality - partners with accrual ROI + cash position
       - /admin/fraud - fraud signals with confidence, evidence, dismiss
    
    2. Create components for cards/tables
    
    3. Add i18n keys for all UI text
    
    4. Add routes to admin nav if needed
  </action>
  <verify>
    <automated>cd /Users/alekseimikhalkin/Documents/bot-artemida && npm run build</automated>
  </verify>
  <acceptance_criteria>
    - All pages render correctly
    - Both ROI views shown for partners
    - Fraud signals show confidence levels
    - Build succeeds
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `npx vitest run tests/unit/promo-funnel.test.ts tests/unit/promo-roi.test.ts tests/unit/partner-roi.test.ts tests/unit/fraud.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- Manual: test /api/promo/click for generic code, check promo_clicks has ownerUserId null
- Manual: register with non-direct IP, check User.signupIpHash set
- Manual: /admin/promos/quality shows funnel for all codes
- Manual: /admin/referrals/quality shows both ROI views
- Manual: /admin/fraud shows signals with confidence
</verification>

<success_criteria>
- PRM-01: Funnel click→register→pay for every code and partner ✓
- PRM-02: Discount cost vs revenue and ROI per promo code (attributed) ✓
- PRM-03: Partner ROI with withdrawals - both accrual ROI and cash position ✓
- PRM-04: Fraud signals (self-dealing, mutual pairs, IP clusters, trial→no-pay) - observation only ✓
- MSK windows, exclude degraded data ✓
- Zero new npm dependencies ✓
</success_criteria>
