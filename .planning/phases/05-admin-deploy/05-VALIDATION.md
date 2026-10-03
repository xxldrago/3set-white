---
phase: "5"
slug: "admin-deploy"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-03"
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 |
| **Config file** | `vitest.config.ts` (`fileParallelism: false`, DB-backed, dummy env) |
| **Quick run command** | `DATABASE_URL=postgresql://alekseimikhalkin@127.0.0.1:5432/setwhite npx vitest run tests/unit` |
| **Full suite command** | `DATABASE_URL=… npx vitest run` |
| **Estimated runtime** | ~80 seconds |

---

## Sampling Rate

- **After every task commit:** Run `DATABASE_URL=… npx vitest run tests/unit`
- **After every plan wave:** Run `DATABASE_URL=… npx vitest run && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite green + `npm run build` (inline throwaway env) + Docker smoke (server-gated)
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | ADM-01 | T-adm-bootstrap | Bootstrap creates administrator once, never re-elevates | unit | `npx vitest run tests/unit/admin-auth.test.ts` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | ADM-01 | T-adm-route | Admin route 401/404/200 by role; deny-by-default | integration | `npx vitest run tests/unit/admin-route.test.ts` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 2 | ADM-02 | T-adm-pii | Search by telegram-id/key; truncation; no PII leak | integration | `npx vitest run tests/unit/admin-search.test.ts` | ❌ W0 | ⬜ pending |
| 5-04-01 | 04 | 3 | ADM-01 | T-adm-role | Role-aware gate migration; self-change blocked; profile role action | integration | `npx vitest run tests/unit/admin-route.test.ts` | ❌ W0 | ⬜ pending |
| 5-05-01 | 05 | 3 | OPS-02 | T-wl-dns | WL sub-link host verify: correct passes, mismatch falls back | unit | `npx vitest run tests/unit/whitelabel.test.ts` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 4 | ADM-03 | T-bcast-dup | Broadcast enqueue deduped; 403 terminal, 429 retryable | integration | `npx vitest run tests/unit/broadcast.test.ts` | ❌ W0 | ⬜ pending |
| 5-07-01 | 07 | 5 | ADM-03/04 | T-adm-stats | Stats aggregates; balance ok/low/critical/unknown | unit | `npx vitest run tests/unit/admin-stats.test.ts tests/unit/balance-alert.test.ts` | ❌ W0 | ⬜ pending |
| 5-06-01 | 06 | 6 | OPS-01 | T-docker-build | Dockerfile build-stage env + generated client copy | build (server) | container smoke (server-gated) | ❌ human | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/admin-auth.test.ts` — role resolution, bootstrap once, `can()` matrix
- [ ] `tests/unit/admin-route.test.ts` — 401/404/200 by role; self-change block; last-admin guard
- [ ] `tests/unit/admin-search.test.ts` — exact telegram-id/key lookup, truncation, PII discipline
- [ ] `tests/unit/admin-stats.test.ts` + `tests/unit/balance-alert.test.ts` — aggregates + balance classification (plan 07)
- [ ] `tests/unit/broadcast.test.ts` — Broadcast + deduped Notification; worker 403 terminal / 429 retry
- [ ] `tests/unit/health-route.test.ts`, `tests/unit/env.test.ts`, `tests/unit/whitelabel.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker image builds & container boots | OPS-01 | Docker unavailable on dev Mac | Server: `docker compose -f docker-compose.prod.yml build && up -d`; check logs |
| HTTPS + webhooks on my.3set.online | OPS-01 | Needs DNS+cert on server | Curl `https://my.3set.online`; Telegram/Platega webhook health |
| White Label sub-link reachable | OPS-02 | Needs DNS A→144.31.93.193 | Resolve `sub.my.3set.online`; fetch a sub-link |
| ARTEMIDA brand domain set | OPS-02 | Owner manual in ARTEMIDA cabinet | Owner checklist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
