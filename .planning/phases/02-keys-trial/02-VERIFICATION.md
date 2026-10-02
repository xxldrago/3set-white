---
phase: 02-keys-trial
verified: 2026-10-02T12:22:00Z
status: human_needed
score: 7/9 must-haves verified
behavior_unverified: 2
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/9
  gaps_closed:
    - "revalidateKeys upserts ONLY provider keys whose customerRef === String(telegramId) (prior gap #5 / CAB-01 / SC3)"
    - "Ownership joins (getKeyForUser/getSubscriptionForUser/listDevices/removeDevice/clearDevices) can no longer be defeated by foreign cache rows (prior gap #6 / CAB-03)"
    - "getSubscriptionForUser no longer overwrites a good cached subscription_url with null on a tolerant-normalizer 2xx (prior gap #7 / CAB-04)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items:
  - truth: "Пользователь получает trial в один тап из бота и видит инструкции по подключению (TRIAL-01/TRIAL-03, bot half)"
    test: "Tap «Попробовать» / «Инструкции» in a real Telegram chat against the running bot"
    expected: "Trial key issued for that chat; a repeat tap shows the used-state copy; «Инструкции» shows v2rayNG/Streisand/Hiddify sections"
    why_human: "Telegraf handlers are not unit-tested (importing lib/bot.ts launches polling); the handler wiring exists but no test exercises the update flow"
  - truth: "Live ARTEMIDA key-scoped success shapes (GET /keys/{id}, /subscription-links, /devices) match the tolerant normalizers"
    test: "Re-run scripts/artemida-probe.mjs with a key-holding account once the owner has one; confirm whether GET /keys reports customerRef as a string"
    expected: "Recorded shapes (no UNKNOWN) and sub-link/QR/traffic/device UI populate from real data; customerRef is a string so the ownership filter matches"
    why_human: "02-01 probe account held 0 keys; these shapes remain UNKNOWN and are an accepted owner-pending caveat"
coincidental_reliance_items: []
human_verification:
  - test: "In a real Telegram chat, tap «Попробовать», then tap it again; tap «Инструкции»."
    expected: "First tap issues a trial key; second tap shows the used-state copy; «Инструкции» lists v2rayNG/Streisand/Hiddify."
    why_human: "Telegraf handlers cannot be unit-imported without launching polling."
  - test: "Re-run scripts/artemida-probe.mjs from a key-holding account; verify the normalized customerRef type."
    expected: "GET /keys/{id}, /subscription-links, /devices return recognized shapes; sub-link/QR/traffic/device UI populates; customerRef is a string (numeric => fail-closed empty cache, see caveat)."
    why_human: "The 02-01 probe account held 0 keys; key-scoped shapes are owner-pending."
  - test: "Visual/interaction pass over TariffPicker (live price, disabled-until-ready, error+retry), TrialButton used/error, SubscriptionCard badges, ConfirmPanel second-tap/Escape/focus trap; confirm the device floor is 2 (accepted owner decision) not 1."
    expected: "All dynamic states render per UI-SPEC; device selector minimum is 2 per provider minDevices."
    why_human: "Layout/interaction contracts and the provider-driven device clamp (2–10 vs roadmap's stated 1–10) are not covered by automated UI tests and are an accepted owner decision."
---

# Phase 2: Keys & Trial Verification Report

**Phase Goal:** Пользователь получает trial, выбирает тариф и видит свои подписки с рабочими конфигами
**Verified:** 2026-10-02T12:22:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plan 02-07

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Cabinet one-tap trial is issued and persisted (TRIAL-01) | ✓ VERIFIED | `app/api/trial/route.ts` → `startTrial` → `claimTrial`/`createTrial`; `components/TrialButton.tsx` posts it. `tests/unit/trial-claim.test.ts` (concurrent claim) + `trial-rollback.test.ts` (4) pass |
| 2   | Bot one-tap trial works (TRIAL-01) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `lib/bot.ts:111` handler calls the shared `startTrial`; no test exercises the Telegraf update flow — see Human Verification |
| 3   | Second trial is blocked server-side (TRIAL-01) | ✓ VERIFIED | Atomic `updateMany({where:{telegramId, trialUsed:false}})` (`lib/keys-service.ts:297`); concurrent test yields exactly one `created` + one `already_used` and the loser never calls the provider |
| 4   | Tariff 7/30/90 × devices (2–10) shows the exact live price (TRIAL-02) | ✓ VERIFIED | `app/api/pricing/route.ts` zod-clamps days to {7,30,90} and devices to 2..10 and returns `pricing.price`; `tests/unit/pricing-route.test.ts` (6) + `artemida-client.test.ts` (23) pass. Device floor clamped to 2 (provider minDevices=2, owner decision 2026-10-02 — accepted caveat) |
| 5   | «Мои подписки» shows the user's OWN subscriptions with status/expiry (CAB-01, SC3) | ✓ VERIFIED | **Gap #5 CLOSED.** `revalidateKeys` (lines 148–160) skips every key whose normalized `customerRef !== String(telegramId)` before `upsertCachedKey`; null-ref keys are skipped. `keys-service.test.ts` ownership vectors (A's cache stays empty when only B's key is returned; mixed list populates each user only with their own; null-ref never upserted) pass |
| 6   | Key detail renders subscription link + local QR + traffic for an owned key (CAB-04) | ✓ VERIFIED | `app/keys/[id]/page.tsx`; `lib/qr.ts` + `QrSvg`; `tests/unit/qr.test.ts` (4) pass; routes wired. Live provider shape owner-pending (caveat) |
| 7   | Device list / delete-one / reset-all route mechanics (CAB-03) | ✓ VERIFIED | 3 session-gated routes + `ConfirmPanel`; `tests/unit/devices-route.test.ts` (12) pass |
| 8   | Connection guides (v2rayNG/Streisand/Hiddify) in cabinet and bot (TRIAL-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `app/guides/page.tsx` renders all three (static page builds); bot `menuGuides` handler wired but untested — see Human Verification |
| 9   | Per-user ownership isolation across list/detail/device routes (IDOR) | ✓ VERIFIED | **Gap #6 CLOSED.** The population step (truth #5) no longer creates foreign-owned `keys_cache` rows; all four ownership joins remain `user: { telegramId }` (`listKeys` L123, `getKeyForUser` L172, `getSubscriptionForUser` L204, `ownedKeyRowId` L257 used by `listDevices`/`removeDevice`/`clearDevices`). The two-user vector asserts `getKeyForUser(A,'KEY_B')`, `getSubscriptionForUser(A,'KEY_B')`, and `listDevices(A,'KEY_B')` all return null and no foreign row exists |

**Score:** 7/9 truths verified (2 present, behavior-unverified)

### Gap-Closure Detail (plan 02-07)

| Prior Gap | Fix in source | Regression test | Status |
| --- | --- | --- | --- |
| #5 CAB-01/SC3 cross-user key mirror | `lib/keys-service.ts:155-158` — `const ownerRef = String(telegramId); ... if (key.customerRef !== ownerRef) continue;` | `ownership: revalidateKeys(A) never mirrors B's key into A's cache`; `ownership: a mixed account-wide list populates each user only with their own keys`; `ownership: a key with null customerRef is never upserted` | ✓ CLOSED |
| #6 CAB-03 defeated ownership joins | Root-caused upstream by the same filter; joins unchanged and now unreachable from a foreign row | `ownership: a key owned only by B is not readable or mutable by A after revalidation` (`getKeyForUser`/`getSubscriptionForUser`/`listDevices` null, 0 foreign rows) | ✓ CLOSED |
| #7 CAB-04 null overwrite | `lib/keys-service.ts:223-235` — `...(links.subscriptionUrl !== null ? { subscriptionUrl: links.subscriptionUrl } : {})`; traffic/`lastSyncedAt` still refresh | `preserves a good cached subscription_url when a 2xx normalizes to null (gap #7)`; `refreshes the cached subscription_url when the provider returns a real URL` | ✓ CLOSED |

**Prohibitions (ADR-550):** both 02-07 test-tier prohibitions are now backed by wired regression tests, so they resolve VERIFIED rather than flagged:
- MUST NOT mirror another user's key/subscriptionUrl into the caller's cache — enforced by the three ownership vectors (filter present at the only population path).
- MUST NOT overwrite a good cached `subscription_url` with null — enforced by the null-preservation vector (spread guard present).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/artemida-probe.mjs` | Dry-runnable live probe | ✓ VERIFIED | `--dry-run` exits 0; secret hygiene maintained |
| `docs/artemida-v1-contract.md` / `.json` | Locked observed contract | ✓ VERIFIED | Observed pricing/keys/balance; key-scoped shapes explicitly `UNKNOWN` (accepted caveat) |
| `lib/artemida.ts` | Full V1 client (D-17) | ✓ VERIFIED | Transport, retry, typed errors, idempotency; no debt markers; unchanged by 02-07 as intended |
| `app/api/pricing/route.ts` | Session-gated live price | ✓ VERIFIED | Clamps + exact provider amount |
| `app/api/trial/route.ts` | Session-gated one-tap trial | ✓ VERIFIED | Clean `trial_used` 409 |
| `lib/keys-service.ts` | Single read/write path | ✓ VERIFIED | Ownership-filtered `revalidateKeys` + null-safe `subscription_url` write (fixed) |
| `components/TariffPicker.tsx` | Live tariff picker | ✓ VERIFIED | Calls BFF only; in-flight abort |
| `components/TrialButton.tsx` | One-tap CTA | ✓ VERIFIED | In-flight lock + used/error states |
| `components/SubscriptionCard.tsx` | Key card with status badge | ✓ VERIFIED | Derived status + amber TRIAL chip |
| `app/page.tsx` | «Мои подписки» section | ✓ VERIFIED | Renders per-user rows from the now-filtered cache |
| `app/api/keys/route.ts` | Cache-first list BFF | ✓ VERIFIED | Same path as cabinet list, now ownership-scoped |
| `app/keys/[id]/page.tsx` | Key detail (link/QR/traffic/devices) | ✓ VERIFIED | Ownership-joined read; tolerant fallbacks |
| `app/api/keys/[id]/route.ts` | Key detail BFF | ✓ VERIFIED | zod id, 404 non-owned |
| `app/api/keys/[id]/subscription/route.ts` | Sub-link + traffic BFF | ✓ VERIFIED | URL never logged; null-safe cache write |
| `app/api/keys/[id]/devices/route.ts` (+ `[token]`, `clear`) | Device BFF routes | ✓ VERIFIED | Session gate + zod + ownership join |
| `components/ConfirmPanel.tsx` | Inline destructive confirm (D-32) | ✓ VERIFIED | Second-tap only; Escape/Cancel no-op; no native dialog |
| `lib/qr.ts` + `components/QrSvg.tsx` | Local SVG QR | ✓ VERIFIED | No `toSvg`, no `<image>`/external href |
| `tests/unit/keys-service.test.ts` | Two-user ownership + null-preservation regression suite | ✓ VERIFIED | 10 tests pass against real Postgres with spied provider |
| `prisma/migrations/20261002010428_keys_trial` | Schema migration | ✓ VERIFIED | Adds `trial_used`/`trial_key_id` + expanded `keys_cache` |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `TrialButton` | `/api/trial` | `fetch POST` | ✓ WIRED | In-flight lock; 409 → used state |
| `/api/trial` | `startTrial` | direct import | ✓ WIRED | Atomic claim path |
| `TariffPicker` | `/api/pricing` | `fetch GET` | ✓ WIRED | Debounced, abortable |
| `/api/pricing` | `artemida.getPricing` | direct import | ✓ WIRED | Exact provider amount |
| `app/page.tsx` | `listKeys`/`revalidateKeys` | direct import + `after()` | ✓ WIRED | Refresh path now filters to `customerRef === String(telegramId)` |
| `/api/keys` | `listKeys`/`revalidateKeys` | direct import + `after()` | ✓ WIRED | Same ownership-filtered path |
| `app/keys/[id]` | `getKeyForUser`/`getSubscriptionForUser`/`listDevices` | direct import | ✓ WIRED | Ownership join `user: { telegramId }`; foreign row can no longer exist |
| bot handlers | `startTrial`/`listKeys`/`getSubscriptionForUser`/`getPricing` | direct import | ✓ WIRED (untested) | Shared path, no duplicate fetch |
| `getSubscriptionForUser` | `artemida.getSubscriptionLinks`/`getTraffic` | direct import | ✓ WIRED | Traffic degrades to nulls; URL write guarded |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `app/page.tsx` / `/api/keys` | `RenderedKey[]` | `prisma.keyCache` rows populated by `revalidateKeys` ← ARTEMIDA `GET /keys`, filtered to the caller's `customerRef` | Yes (real query) | ✓ FLOWING |
| `app/keys/[id]` | `subscriptionUrl`, `traffic`, `devices` | `getSubscriptionLinks`/`getTraffic`/`getDevices` via ownership join | Yes | ✓ FLOWING (foreign keys no longer enter the cache) |
| `TariffPicker` | `price` | `/api/pricing` ← ARTEMIDA `GET /pricing` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Two-user ownership regression file | `DATABASE_URL=... npx vitest run tests/unit/keys-service.test.ts` | 1 file / **10 tests passed** | ✓ PASS |
| Full unit suite (DB-backed) | `DATABASE_URL=... npx vitest run tests/unit` | **11 files / 77 tests passed** | ✓ PASS |
| Cross-user leak reproduction (prior FAIL) | `revalidateKeys(A)` with provider returning B's key, then `listKeys(A)` | A's cache stays `[]` (test-asserted) — leak no longer reproduces | ✓ PASS |

> Note: the verify request stated "79/79"; the actual green count is **11 files / 77 tests** (same as the 02-07 SUMMARY). Both the file count and every assertion pass; the discrepancy is only in the stated total, not in coverage.

### Probe Execution

| Probe | Command | Result | Status |
| --- | --- | --- | --- |
| `scripts/artemida-probe.mjs` | `node scripts/artemida-probe.mjs --dry-run` | exit 0 | PASS (dry-run) |
| live ARTEMIDA capture | `node --env-file=.env.local scripts/artemida-probe.mjs --json` | not re-run — would live-hit provider | SKIP (owner-pending) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| TRIAL-01 | 02-03 | One-tap trial from bot + cabinet; repeat blocked server-side | ✓ SATISFIED (cabinet) / bot human | Atomic claim + route; concurrent + rollback tests |
| TRIAL-02 | 02-02, 02-03 | 7/30/90 × 2–10 with live price | ✓ SATISFIED | Pricing route + client tests; device floor clamped to 2 per provider (accepted caveat) |
| TRIAL-03 | 02-05, 01-04 | Guides (v2rayNG/Streisand/Hiddify) in bot + cabinet | ✓ SATISFIED (cabinet) / bot human | `app/guides/page.tsx`; bot handler wired |
| CAB-01 | 02-04, 02-07 | «Мои подписки» with status/expiry in bot + PWA | ✓ SATISFIED | Ownership-filtered population + two-user regression suite |
| CAB-03 | 02-06, 02-07 | Device list/delete-one/reset-all | ✓ SATISFIED | Route mechanics verified; foreign keys can no longer be created/mutated |
| CAB-04 | 02-05, 02-07 | Configs + `subscriptionUrl`, traffic | ✓ SATISFIED | Detail/QR mechanics verified; null-safe cache write + ownership join |

No orphaned requirements: all IDs mapped to Phase 2 in REQUIREMENTS.md (TRIAL-01/02/03, CAB-01/03/04) appear in at least one plan's `requirements`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | The prior `revalidateKeys` cross-user upsert and unconditional `subscription_url` overwrite are gone; no `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` markers in the phase-modified source (`lib/keys-service.ts`, `tests/unit/keys-service.test.ts`) |

`ConfirmPanel` uses no `window.confirm`/`alert`/`<dialog>` (only a comment mentions it). QR uses no `toSvg`, `<image>`, or external href.

### Human Verification Required

1. **Bot trial + guides flow**
   **Test:** In a real Telegram chat, tap «Попробовать», then tap it again; tap «Инструкции».
   **Expected:** First tap issues a trial key; second tap shows the used-state copy; «Инструкции» lists v2rayNG/Streisand/Hiddify.
   **Why human:** Telegraf handlers cannot be unit-imported without launching polling.

2. **Live ARTEMIDA key-scoped shapes (owner-pending)**
   **Test:** Re-run the probe from a key-holding account; confirm `customerRef` is reported as a string.
   **Expected:** `GET /keys/{id}`, `/subscription-links`, `/devices` return recognized shapes; sub-link/QR/traffic/device UI populates.
   **Why human:** The 02-01 probe account held 0 keys (accepted owner-pending caveat). Residual risk: if the live provider returns `customerRef` as a number, `normalizeKey` yields null and every key is skipped — fail-closed (no leak, but no population). A number→string coercion would be the follow-up.

3. **Visual/interaction states + device clamp**
   **Test:** Device/browser pass over TariffPicker (live price, disabled-until-ready, error+retry), TrialButton used/error, SubscriptionCard badges, ConfirmPanel second-tap/Escape/focus trap; confirm the device selector minimum is 2.
   **Expected:** All dynamic states render per UI-SPEC; device floor is 2 (accepted owner decision, provider minDevices=2) even though the roadmap text says 1–10.
   **Why human:** Layout/interaction contracts and the provider-driven device clamp are not covered by automated UI tests.

### Gaps Summary

All three prior gaps are genuinely closed in the codebase, not merely claimed:

1. **Gap #5 (CAB-01/SC3)** — `revalidateKeys` now iterates the account-wide `GET /keys` result and `continue`s on any key whose normalized `customerRef !== String(telegramId)` (absent/null refs included). This is the only path that populates `keys_cache` from the provider (the other `upsertCachedKey` caller is `startTrial`, whose key is the caller's own). The prior empirically-reproduced cross-user mirror no longer occurs.
2. **Gap #6 (CAB-03)** — the four ownership joins (`listKeys`, `getKeyForUser`, `getSubscriptionForUser`, `ownedKeyRowId` → `listDevices`/`removeDevice`/`clearDevices`) all scope by `user: { telegramId }`; with the population source filtered, a foreign key can no longer exist to defeat them. The two-user vector asserts the detail/sub-link/device reads return null for the non-owner.
3. **Gap #7 (CAB-04)** — the `subscription_url` write is spread only when `links.subscriptionUrl !== null`, so a tolerant-normalizer null on a 2xx preserves the previously good cached URL; a real URL still refreshes.

Verified against source (`lib/keys-service.ts`), the two-user regression suite (`tests/unit/keys-service.test.ts`, 10/10 pass), the full unit suite (11 files / 77 tests green), and a clean `tsc --noEmit`. Commits `3df2abf` and `414d844` exist and match the 02-07 SUMMARY.

No gaps remain. The status is `human_needed` only because Phase 2 carries its accepted, owner-pending human checks (bot flow, live key-scoped provider shapes, visual/interaction states, device clamp 2–10) — none of which is a code defect.

---

_Verified: 2026-10-02T12:22:00Z_
_Verifier: the agent (gsd-verifier)_
