# Phase 19 / Plan 19-01 — Deferred & Out-of-Scope Items

## Out-of-scope pre-existing suite failures (NOT caused by 19-01)

Full-suite `npx vitest run tests/unit` → 860 passed / 8 failed in 5 unrelated files.
All failures are pre-existing and outside this plan's files; per the scope-boundary
rule they were **not** fixed. Focused verification for this plan is green:
`npx tsc --noEmit` exit 0; `npx vitest run tests/unit/server-pool.test.ts
tests/unit/mobile-servers-route.test.ts tests/unit/servers-source.test.ts` → 41/41 passed;
`npx prisma validate` exit 0.

| File | Failing test | Why out of scope |
|------|--------------|------------------|
| `tests/unit/env.test.ts` | defaults WHITELABEL_HOST to `sub.my.3set.online` | `lib/env.ts:60` default is `our.3set.online`; unrelated to servers route |
| `tests/unit/whitelabel.test.ts` | reads WL host from env | same env default mismatch |
| `tests/unit/artemida-client.test.ts` (2) | subscriptionUrl / createKey normalization | same WHITELABEL_HOST rewrite mismatch |
| `tests/unit/i18n.test.ts` | dictionary has no unused keys | 3 unused `bot.guidesApp*` keys from unrelated work |
| `tests/unit/analytics-phase11-loaders.test.ts` (3) | recomputeAllRfm / loadSegments / thresholds | phase-11 analytics DB loaders, unrelated |

## Deferred by locked decisions (not implemented here)

- **REQ-POOL-04 `load` bar** — deferred per CONTEXT D-04; no `load` field served, no simulation.
- **ARTEMIDA `/pricing`** — superseded for `/servers` by CONTEXT D-01; source is subscription-links.
- **`getKeyWithLinks`** — does not exist; `getSubscriptionForUserId` is the canonical read.
- **`[ASSUMED]` real ARTEMIDA `links[]` payload** — re-verify on a live paid key in staging (only a `vless://placeholder` probe was observable here). Parser is tolerant with a scheme allowlist.
