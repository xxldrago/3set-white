---
phase: "1"
slug: "foundation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-30"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.3 |
| **Config file** | none — Wave 0 installs (`vitest.config.ts` + `tests/`) |
| **Quick run command** | `npx vitest run tests/unit` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit`
- **After every plan wave:** Run `npx vitest run && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | CAB-02 | T-auth-01 | Forged Widget hash rejected | unit | `npx vitest run tests/unit/auth-widget.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | CAB-02 | T-auth-02 | Tampered initData rejected | unit | `npx vitest run tests/unit/auth-initdata.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | CAB-02 | T-auth-03 | Session roundtrip, wrong secret + alg:none rejected | unit | `npx vitest run tests/unit/session.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-04 | 01 | 1 | CAB-02 | — | No missing i18n keys vs ru.ts | unit | `npx vitest run tests/unit/i18n.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 2 | CAB-05 | — | Manifest valid + build passes | build/smoke | `npm run build && node scripts/check-manifest.mjs` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 3 | DB | — | migrate + seed green | smoke | `npx prisma migrate dev && npm run db:seed` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest 5.0.3 config
- [ ] `tests/unit/auth-widget.test.ts` — known-answer HMAC vectors (fixed `test-token` fixtures)
- [ ] `tests/unit/auth-initdata.test.ts` — WebAppData path vectors
- [ ] `tests/unit/session.test.ts` — jose roundtrip with throwaway `SESSION_SECRET`
- [ ] `tests/unit/i18n.test.ts` — key-completeness check
- [ ] `scripts/check-manifest.mjs` — fetch `/manifest.webmanifest`, assert icons/display
- [ ] `npm install -D vitest@5.0.3` — framework install

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Install prompt + login screen render (mobile) | CAB-05 | No Playwright in Phase 1 | Chrome DevTools → Application → Manifest; real-device install |
| End-to-end login (Widget → cookie → skeleton) | CAB-02 | Needs owner test-bot token | Browser + test bot, verify no duplicate users |
| Repo on GitHub, main pushed, no secrets in history | OPS-03 | Owner-side confirmation | `gh repo view 3set-white`; scan history for token patterns |
| Brand icons (no logo in repo yet) | CAB-05 | Visual judgment | Human-verify placeholder icons |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
