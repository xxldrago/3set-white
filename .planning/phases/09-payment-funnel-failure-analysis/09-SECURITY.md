---
phase: "9"
slug: "payment-funnel-failure-analysis"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-29"
---

# Phase 9 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| DB layer → pure module (`funnel.ts`) | Loaders feed `FunnelRow` aggregates into a dependency-free module; `funnel.ts` has zero imports (verified: no `prisma`, no env, no network) | Order lifecycle fields (status, timestamps, `errorCode`, `finalAmount`) — no secrets |
| DB (`orders`) → loaders (`service.ts`) | Only input is the whitelisted `?period` integer; all queries are Prisma-parameterized | Aggregated counts, exact-rational rates, grouped error codes |
| RSC payload → components | Five server components receive aggregate payloads only; pinned by the phase-9 contract no-leak scan | No per-order rows, no `userId`, no `providerCost`, no API key |
| Browser → page (`?period`) | Single external input in the phase; normalized `7 \| 90 else 30` before any loader runs | Integer only |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-09-01-01 | Tampering | funnel stage criteria | high | mitigate | Stage predicates pinned against the verified `OrderStatus` state machine by Test-1 membership fixtures; `failed`-implies-`provisioning` and keyless-refunded exclusion declared as documented approximations in the module header (`lib/analytics/funnel.ts:111-134`) | closed |
| T-09-01-02 | Information Disclosure | `funnel.ts` imports | low | mitigate | Module imports nothing at all — no prisma, no env, no `lib/artemida`; the API key and raw provider payloads cannot enter this layer | closed |
| T-09-01-03 | Tampering | expired window bound | medium | mitigate | Strict `<` comparison against `PAYMENT_WINDOW_MS` (`funnel.ts:55`, `:141-148`), pinned by a ±1 ms fixture pair | closed |
| T-09-01-04 | Tampering | timing `updatedAt` proxy | medium | mitigate | `status = 'provisioned'` filter excludes chargeback/refund touches; proxy documented in the module header and pinned by a hand-computed fixture. Residual measurement risk logged as AR-09-01 | closed |
| T-09-01-SC | Tampering | package installs | high | mitigate | Zero package installs — no dependency diff across the phase (`git diff package.json package-lock.json` empty) | closed |
| T-09-02-01 | Elevation of Privilege | loaders' consumer page | high | mitigate | Page-level `requireRole('administrator', 'manager')` re-check at `app/admin/analytics/page.tsx:79`; no new route or handler exists to bypass it | closed |
| T-09-02-02 | Information Disclosure | loader payloads | high | mitigate | Payload shapes are aggregates only — `FunnelData` (step/count/conversion/dropOff), `ExpiredData` (count/windowHours), `ErrorBreakdownData` (code/count/total), `TimingData` (medianMs/meanMs/orders) — no `userId`, no order rows, no provider text | closed |
| T-09-02-03 | Denial of Service | windowed order scans | medium | mitigate | Every scan bounded by the 7/30/90 MSK-day window; expired is one point-in-time count; all streamed behind per-block Suspense | closed |
| T-09-02-04 | Tampering | `?period` / window bounds | low | mitigate | Whitelisted normalization `rawPeriod === 7 \|\| rawPeriod === 90 ? rawPeriod : 30` (`page.tsx:89-90`) + Prisma-parameterized queries + `mskDayStartInstant` | closed |
| T-09-02-SC | Tampering | package installs | high | mitigate | Zero package installs — see T-09-01-SC | closed |
| T-09-03-01 | Information Disclosure | RSC payloads of five components | high | mitigate | Contract test `admin-analytics-phase9-contract.test.ts:209-213` asserts `providerCost` / `provider_cost` / `userId` absent from the page and all five new component sources | closed |
| T-09-03-02 | Elevation of Privilege | direct RSC fetch of new blocks | high | mitigate | Same page-level `requireRole` guard runs for direct RSC fetches; no new handler added | closed |
| T-09-03-03 | Denial of Service | five new loader calls per render | medium | mitigate | Each bounded by the period window and independently streamed; same scale class as the Phase 8 page | closed |
| T-09-03-04 | Tampering | i18n keys / dynamic lookup | low | mitigate | Literal `t('…')` calls only (45 call sites across the five components); no Cyrillic literal in component code (comments only); label switch is exhaustive over `FunnelStep` | closed |
| T-09-03-05 | Tampering | `OrderStatus` enum integrity | high | mitigate | `admin-analytics-phase9-contract.test.ts:225-228` pins that `enum OrderStatus` contains no `expired` member; no schema file touched by the phase | closed |
| T-09-03-SC | Tampering | package installs | high | mitigate | Zero package installs — see T-09-01-SC | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (`high`) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Register provenance:** `register_authored_at_plan_time: true` — all three plans carry a `<threat_model>` block with a STRIDE register.
**Audit depth:** ASVS level 1 (grep-depth verification), consistent with `workflow.security_asvs_level: 1`. Per the short-circuit rule (threats_open: 0 + plan-time register + L1) no auditor dispatch was required.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-09-01 | T-09-01-04 (residual) | `paidAt → provisioned` is derived from `Order.updatedAt`, which is `@updatedAt`. An account merge (`lib/accounts.ts:164`) re-points historical provisioned orders and moves `updatedAt`, so the *mean* provisioning time can be inflated on merged accounts. This is a measurement-accuracy residual, not an access-control or disclosure risk; it is below the `high` security threshold and tracked as MD-01 in `09-REVIEW.md`. Proper fix is a `provisionedAt` column (schema migration), deliberately deferred out of the review-fix pass. | project owner (via deferred-decision record, MD-01) | 2026-10-29 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-29 | 16 | 16 | 0 | orchestrator (grep-depth, ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-29
