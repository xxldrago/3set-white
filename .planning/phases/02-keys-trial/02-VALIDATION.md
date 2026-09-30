---
phase: "2"
slug: "keys-trial"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-01"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.3 |
| **Config file** | `vitest.config.ts` (include `tests/**/*.test.ts`, environment node) |
| **Quick run command** | `npx vitest run tests/unit` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit`
- **After every plan wave:** Run `npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Aligned to the six actual plans (02-01 … 02-06). Wave = the plan's frontmatter `wave`;
> there is no plan 07 (i18n extension is a Wave-0 step inside plan 02-02).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | — (gate) | T-02-01 | Probe dry-run enumerates every planned call; no key printed | smoke | `node --check scripts/artemida-probe.mjs && node scripts/artemida-probe.mjs --dry-run` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | — (gate) | T-02-01 | `ARTEMIDA_API_KEY` supplied via `.env.local` only; never in git | manual | `node -e "process.loadEnvFile?.('.env.local'); console.log(Boolean(process.env.ARTEMIDA_API_KEY))"` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | all | T-02-03 | Live probe `--json` committed; no `UNKNOWN (call failed)` survives | script + human | `node --env-file=.env.local scripts/artemida-probe.mjs --json > docs/artemida-v1-contract.json && grep -Eq 'GET[[:space:]]+/pricing' docs/artemida-v1-contract.md` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | TRIAL-02 | T-02-05 | `/api/pricing` validates days/devices; 401 without session; exact provider price | unit | `npx vitest run tests/unit/artemida-client.test.ts tests/unit/pricing-route.test.ts tests/unit/i18n.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | TRIAL-02 | — | Every D-17 V1 method incl. `resetTraffic`/`listKeys(q)` typechecked + tested | unit | `npx vitest run tests/unit/artemida-client.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 3 | TRIAL-01 | T-02-09 / T-02-10 | Concurrent claim one winner; rollback guarded by `trialKeyId: null` | unit | `npx vitest run tests/unit/trial-claim.test.ts tests/unit/trial-rollback.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 3 | TRIAL-01 | — | Migration applied; no drift / pending migration | cli | `npx prisma migrate status && npx prisma validate` | ❌ W0 | ⬜ pending |
| 2-03-03 | 03 | 3 | TRIAL-01, TRIAL-02 | T-02-11 | Bot trial + tariff keyboard via shared service; no raw API text | unit | `npx vitest run tests/unit` | ✅ extend | ⬜ pending |
| 2-04-01 | 04 | 4 | CAB-01 | T-02-13 / T-02-14 | Cache-first read + background revalidate; status derived from `expiresAt` | unit | `npx vitest run tests/unit/keys-service.test.ts tests/unit/i18n.test.ts` | ❌ W0 | ⬜ pending |
| 2-04-02 | 04 | 4 | CAB-01 | — | Bot keys branch via shared read path; font normalized; list scrolls in page flow | unit + build | `npx vitest run tests/unit && npm run build` | ✅ extend | ⬜ pending |
| 2-05-01 | 05 | 5 | CAB-04 | T-02-17 / T-02-19 | Ownership-joined sub-link read; server SVG QR; `toSvg` NOT called | unit | `npx vitest run tests/unit/qr.test.ts tests/unit/i18n.test.ts` | ❌ W0 | ⬜ pending |
| 2-05-02 | 05 | 5 | CAB-04, TRIAL-03 | T-02-18 | Bot sends sub-link + guides pointer; URL never logged | unit + build | `npx vitest run tests/unit && npm run build` | ✅ extend | ⬜ pending |
| 2-06-01 | 06 | 6 | CAB-03 | T-02-21 / T-02-23 | Device routes session + ownership gated; `token`/`id` validated | unit | `npx vitest run tests/unit/devices-route.test.ts tests/unit/i18n.test.ts` | ❌ W0 | ⬜ pending |
| 2-06-02 | 06 | 6 | CAB-03 | T-02-22 | Destructive inline confirm; no native confirm; long device names truncate + `title` | unit + build | `npx vitest run tests/unit && npm run build` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/artemida-client.test.ts` — envelope parsing (object AND string `error`), status→code mapping, retry policy, `Retry-After` (inject fake `fetch`)
- [ ] `tests/unit/trial-claim.test.ts` — concurrent `claimTrial` one winner; rollback guarded by `trialKeyId: null`
- [ ] `tests/unit/trial-rollback.test.ts` — a failed `createTrial` releases `trialUsed`; a recorded success cannot reopen
- [ ] `tests/unit/pricing-route.test.ts` — query validation (1–10 devices, 7/30/90) + 401 without session
- [ ] `tests/unit/keys-service.test.ts` — cache→render mapping, status from `expiresAt`, trial badge flag
- [ ] `tests/unit/qr.test.ts` — `renderSubscriptionQr` returns `<svg`, encodes URL, asserts `toSvg` not called
- [ ] `tests/unit/devices-route.test.ts` — session required, token path param validated
- [ ] `tests/unit/i18n.test.ts` — widen regex for `t(key, params)` + plural-category assertions
- [ ] `tests/helpers/fake-fetch.ts` — fixture helper returning verified envelopes (no network)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live ARTEMIDA pricing/trial/keys field names | all | Needs real `ARTEMIDA_API_KEY`; success shapes `[ASSUMED]` | Plan 02-01 `checkpoint:human-verify` live probe — the agent commits `docs/artemida-v1-contract.{md,json}` and the owner confirms the recorded shapes (no `UNKNOWN (call failed)`) before any dependent UI is wired |
| Bot trial + tariff flow end-to-end | TRIAL-01/02 | Needs test bot token + live API | BotFather test bot, send /start, tap trial, verify key issued |
| PWA install + device-management confirm UX | CAB-03 | Visual/device judgment | Real device, verify inline confirm panel |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
