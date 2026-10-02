---
phase: 02-keys-trial
verified: 2026-10-02T01:56:05Z
status: gaps_found
score: 5/9 must-haves verified
behavior_unverified: 2
overrides_applied: 0
gaps:
  - truth: "Пользователь видит список «Мои подписки» — только свои подписки (CAB-01, roadmap SC3)"
    status: failed
    reason: "revalidateKeys() calls artemida.listKeys() with NO customerRef/q filter and upserts EVERY provider key under the calling user's local userId. The ARTEMIDA account is service-wide (a single ARTEMIDA_API_KEY for all users), and GET /keys returns the whole account's keys, so any user's background revalidation mirrors every other user's keys into their own keys_cache. Empirically reproduced: after revalidateKeys(user A), listKeys(A) returned user B's key and A could read B's subscriptionUrl. The cache is the data source for the cabinet list, the key-detail ownership joins, and the device routes, so this is a cross-user data leak that defeats T-02-13/T-02-17/T-02-21 at the population step."
    artifacts:
      - path: "lib/keys-service.ts"
        issue: "revalidateKeys (lines ~138-148) iterates list.items and calls upsertCachedKey(user.id, key) for every key, with no customerRef / ownership filter"
      - path: "lib/artemida.ts"
        issue: "listKeys (lines ~474-483) issues GET /keys with no q/customerRef param when called with no args"
    missing:
      - "Filter revalidation to the caller's keys: only upsert entries where key.customerRef === String(telegramId) (and/or call artemida.listKeys({ q: String(telegramId) })), or restrict upserts to keyIds already owned by that userId"
      - "Add a regression test with two users proving revalidateKeys(A) never inserts B's keys into A's cache"
  - truth: "Пользователь управляет устройствами ключа — только своего ключа (CAB-03)"
    status: failed
    reason: "Same root cause as the CAB-01 gap. listDevices/removeDevice/clearDevices join ownership against keys_cache, but revalidateKeys populates keys_cache with other users' keys, so a mirrored foreign key passes the ownership join and the user can list/delete/clear another user's devices (and read their sub-link via getSubscriptionForUser). The route-level IDOR tests pass only because they never populate the cache through the leaking path."
    artifacts:
      - path: "lib/keys-service.ts"
        issue: "ownedKeyRowId/getSubscriptionForUser join on keys_cache rows that revalidateKeys can create for the wrong user"
    missing:
      - "Populate/refresh keys_cache only with keys owned by the caller (see CAB-01 gap); add a two-user regression test asserting a foreign key is not mutable"
  - truth: "Ключ-деталь не перезаписывает рабочую закэшированную subscriptionUrl значением null при несовпадении формы ответа (CAB-04)"
    status: partial
    reason: "getSubscriptionForUser writes links.subscriptionUrl into keys_cache after any 2xx sub-link response. A shape mismatch does not throw (the normalizer is tolerant and returns null), so a 200 with an unrecognized body overwrites a previously good cached URL with null. The 02-05 SUMMARY's claim that 'a shape mismatch never wipes a good cached URL' is inaccurate — only an HTTP failure is caught, not a normalizer yielding null."
    artifacts:
      - path: "lib/keys-service.ts"
        issue: "getSubscriptionForUser (lines ~209-217) unconditionally updates subscription_url/traffic after a successful fetch"
    missing:
      - "Only write subscription_url when links.subscriptionUrl is non-null (preserve the previous value otherwise)"
behavior_unverified_items:
  - truth: "Пользователь получает trial в один тап из бота и видит инструкции по подключению (TRIAL-01/TRIAL-03, bot half)"
    test: "Tap «Попробовать» / «Инструкции» in a real Telegram chat against the running bot"
    expected: "Trial key issued for that chat; a repeat tap shows the used-state copy; «Инструкции» shows v2rayNG/Streisand/Hiddify sections"
    why_human: "Telegraf handlers are not unit-tested (importing lib/bot.ts launches polling); the handler wiring exists but no test exercises the update flow"
  - truth: "Live ARTEMIDA key-scoped success shapes (GET /keys/{id}, /subscription-links, /devices) match the tolerant normalizers"
    test: "Re-run scripts/artemida-probe.mjs with a key-holding account once the owner has one"
    expected: "Recorded shapes (no UNKNOWN) and sub-link/QR/traffic/device UI populate from real data"
    why_human: "02-01 probe account held 0 keys; these shapes remain UNKNOWN and are an accepted owner-pending caveat"
deferred: []
---

# Phase 2: Keys & Trial Verification Report

**Phase Goal:** Пользователь получает trial, выбирает тариф и видит свои подписки с рабочими конфигами
**Verified:** 2026-10-02T01:56:05Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Cabinet one-tap trial is issued and persisted (TRIAL-01) | ✓ VERIFIED | `app/api/trial/route.ts` → `startTrial` → `claimTrial`/`createTrial`; `components/TrialButton.tsx` posts it. `tests/unit/trial-claim.test.ts` (concurrent claim) + `trial-rollback.test.ts` (4) pass |
| 2 | Bot one-tap trial works (TRIAL-01) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `lib/bot.ts:111` handler calls the shared `startTrial`; no test exercises the Telegraf update flow — see Human Verification |
| 3 | Second trial is blocked server-side (TRIAL-01) | ✓ VERIFIED | Atomic `updateMany({where:{telegramId, trialUsed:false}})` (`lib/keys-service.ts:278`); concurrent test yields exactly one `created` + one `already_used` and the loser never calls the provider |
| 4 | Tariff 7/30/90 × devices (2–10) shows the exact live price (TRIAL-02) | ✓ VERIFIED | `app/api/pricing/route.ts` zod-clamps days to {7,30,90} and devices to 2..10 and returns `pricing.price`; `tests/unit/pricing-route.test.ts` (6) + `artemida-client.test.ts` (23) pass. Device floor clamped to 2 (provider minDevices=2, owner decision 2026-10-02 — accepted caveat) |
| 5 | «Мои подписки» shows the user's OWN subscriptions with status/expiry (CAB-01, SC3) | ✗ FAILED | `revalidateKeys` mirrors ALL account keys under the caller's `userId` (no customerRef filter). Empirically reproduced cross-user leak — see Gaps |
| 6 | Key detail renders subscription link + local QR + traffic for an owned key (CAB-04) | ✓ VERIFIED | `app/keys/[id]/page.tsx`; `lib/qr.ts` + `QrSvg`; `tests/unit/qr.test.ts` (4) pass; routes wired. Live provider shape owner-pending (caveat) |
| 7 | Device list / delete-one / reset-all route mechanics (CAB-03) | ✓ VERIFIED | 3 session-gated routes + `ConfirmPanel`; `tests/unit/devices-route.test.ts` (12) pass |
| 8 | Connection guides (v2rayNG/Streisand/Hiddify) in cabinet and bot (TRIAL-03) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `app/guides/page.tsx` renders all three (static page builds); bot `menuGuides` handler wired but untested — see Human Verification |
| 9 | Per-user ownership isolation across list/detail/device routes (IDOR) | ✗ FAILED | Same root cause as #5: `keys_cache` is populated cross-user, defeating the ownership joins in `getKeyForUser`/`getSubscriptionForUser`/`listDevices`/`removeDevice`/`clearDevices` |

**Score:** 5/9 truths verified (2 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/artemida-probe.mjs` | Dry-runnable live probe | ✓ VERIFIED | `--dry-run` exits 0 (20 lines); secret hygiene maintained |
| `docs/artemida-v1-contract.md` / `.json` | Locked observed contract | ✓ VERIFIED | Observed pricing/keys/balance; key-scoped shapes explicitly `UNKNOWN` (accepted caveat) |
| `lib/artemida.ts` | Full V1 client (D-17) | ✓ VERIFIED | Transport, retry, typed errors, idempotency; no debt markers |
| `app/api/pricing/route.ts` | Session-gated live price | ✓ VERIFIED | Clamps + exact provider amount |
| `app/api/trial/route.ts` | Session-gated one-tap trial | ✓ VERIFIED | Clean `trial_used` 409 |
| `lib/keys-service.ts` | Single read/write path | ⚠️ PARTIAL | Contains the cross-user `revalidateKeys` defect |
| `components/TariffPicker.tsx` | Live tariff picker | ✓ VERIFIED | Calls BFF only; in-flight abort |
| `components/TrialButton.tsx` | One-tap CTA | ✓ VERIFIED | In-flight lock + used/error states |
| `components/SubscriptionCard.tsx` | Key card with status badge | ✓ VERIFIED | Derived status + amber TRIAL chip |
| `app/page.tsx` | «Мои подписки» section | ⚠️ PARTIAL | Renders correctly, but its data source is polluted by the leak |
| `app/api/keys/route.ts` | Cache-first list BFF | ⚠️ PARTIAL | Same polluted data source |
| `app/keys/[id]/page.tsx` | Key detail (link/QR/traffic/devices) | ✓ VERIFIED | Ownership-joined read; tolerant fallbacks |
| `app/api/keys/[id]/route.ts` | Key detail BFF | ✓ VERIFIED | zod id, 404 non-owned |
| `app/api/keys/[id]/subscription/route.ts` | Sub-link + traffic BFF | ✓ VERIFIED | URL never logged |
| `app/api/keys/[id]/devices/route.ts` (+ `[token]`, `clear`) | Device BFF routes | ✓ VERIFIED | Session gate + zod + ownership join |
| `components/ConfirmPanel.tsx` | Inline destructive confirm (D-32) | ✓ VERIFIED | Second-tap only; Escape/Cancel no-op; no native dialog |
| `lib/qr.ts` + `components/QrSvg.tsx` | Local SVG QR | ✓ VERIFIED | No `toSvg`, no `<image>`/external href |
| `prisma/migrations/20261002010428_keys_trial` | Schema migration | ✓ VERIFIED | Adds `trial_used`/`trial_key_id` + expanded `keys_cache` |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `TrialButton` | `/api/trial` | `fetch POST` | ✓ WIRED | In-flight lock; 409 → used state |
| `/api/trial` | `startTrial` | direct import | ✓ WIRED | Atomic claim path |
| `TariffPicker` | `/api/pricing` | `fetch GET` | ✓ WIRED | Debounced, abortable |
| `/api/pricing` | `artemida.getPricing` | direct import | ✓ WIRED | Exact provider amount |
| `app/page.tsx` | `listKeys`/`revalidateKeys` | direct import + `after()` | ⚠️ PARTIAL | Refresh path cross-pollinates users |
| `/api/keys` | `listKeys`/`revalidateKeys` | direct import + `after()` | ⚠️ PARTIAL | Same defect |
| `app/keys/[id]` | `getKeyForUser`/`getSubscriptionForUser`/`listDevices` | direct import | ⚠️ PARTIAL | Ownership join trusts a polluted cache |
| bot handlers | `startTrial`/`listKeys`/`getSubscriptionForUser`/`getPricing` | direct import | ✓ WIRED (untested) | Shared path, no duplicate fetch |
| `getSubscriptionForUser` | `artemida.getSubscriptionLinks`/`getTraffic` | direct import | ✓ WIRED | Traffic degrades to nulls |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `app/page.tsx` / `/api/keys` | `RenderedKey[]` | `prisma.keyCache` rows populated by `revalidateKeys` ← ARTEMIDA `GET /keys` | Yes (real query) | ⚠️ STATIC-ISH / POLLUTED — source is account-wide, not user-scoped |
| `app/keys/[id]` | `subscriptionUrl`, `traffic`, `devices` | `getSubscriptionLinks`/`getTraffic`/`getDevices` via ownership join | Yes | ⚠️ Ownership join is defeated by the populated cache |
| `TariffPicker` | `price` | `/api/pricing` ← ARTEMIDA `GET /pricing` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Unit suite (DB-backed) | `DATABASE_URL=... npx vitest run tests/unit` | 11 files / 71 tests passed | ✓ PASS |
| Production build | `npx next build` (throwaway env) | Compiled successfully; all Phase-2 routes dynamic (ƒ), `/guides` static | ✓ PASS |
| Probe dry-run | `node scripts/artemida-probe.mjs --dry-run` | exit 0 | ✓ PASS |
| **Cross-user isolation** | throwaway script: `revalidateKeys(A)` with provider returning B's key, then `listKeys(A)` | A's cache went `[]` → `["KEY_OWNED_BY_USER_B"]`; A read B's `subscriptionUrl` | ✗ **FAIL** |

### Probe Execution

| Probe | Command | Result | Status |
| --- | --- | --- | --- |
| `scripts/artemida-probe.mjs` | `node scripts/artemida-probe.mjs --dry-run` | exit 0 | PASS (dry-run) |
| live ARTEMIDA capture | `node --env-file=.env.local scripts/artemida-probe.mjs --json` | not re-run — would consume/live-hit provider | SKIP (owner-pending) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| TRIAL-01 | 02-03 | One-tap trial from bot + cabinet; repeat blocked server-side | ✓ SATISFIED (cabinet) / bot human | Atomic claim + route; concurrent + rollback tests |
| TRIAL-02 | 02-02, 02-03 | 7/30/90 × 2–10 with live price | ✓ SATISFIED | Pricing route + client tests; device floor clamped to 2 per provider |
| TRIAL-03 | 02-05, 01-04 | Guides (v2rayNG/Streisand/Hiddify) in bot + cabinet | ✓ SATISFIED (cabinet) / bot human | `app/guides/page.tsx`; bot handler wired |
| CAB-01 | 02-04 | «Мои подписки» with status/expiry in bot + PWA | ✗ BLOCKED | Cross-user mirror in `revalidateKeys` |
| CAB-03 | 02-06 | Device list/delete-one/reset-all | ✗ BLOCKED (isolation) | Route mechanics verified; foreign keys become mutable via the polluted cache |
| CAB-04 | 02-05 | Configs + `subscriptionUrl`, traffic | ✗ BLOCKED (isolation) | Detail/QR mechanics verified; foreign sub-link readable via the polluted cache |

No orphaned requirements: all IDs mapped to Phase 2 in REQUIREMENTS.md (TRIAL-01/02/03, CAB-01/03/04) appear in at least one plan's `requirements`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `lib/keys-service.ts` | ~144-147 | `artemida.listKeys()` without customerRef/`q` filter, then upsert every item under the caller's `userId` | 🛑 Blocker | Cross-user key/sub-link/device leak (IDOR) |
| `lib/artemida.ts` | ~474-483 | `listKeys` sends no `q` when called with no args | 🛑 Blocker | Enables the above |
| `lib/keys-service.ts` | ~209-217 | Unconditional `subscription_url` overwrite on any 2xx (normalizer may return null) | ⚠️ Warning | Can wipe a good cached URL on a provider shape mismatch |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` markers in phase-modified source. `ConfirmPanel` uses no `window.confirm`/`alert`/`<dialog>` (only a comment mentions it). QR uses no `toSvg`, `<image>`, or external href.

### Human Verification Required

1. **Bot trial + guides flow**
   **Test:** In a real Telegram chat, tap «Попробовать», then tap it again; tap «Инструкции».
   **Expected:** First tap issues a trial key; second tap shows the used-state copy; «Инструкции» lists v2rayNG/Streisand/Hiddify.
   **Why human:** Telegraf handlers cannot be unit-imported without launching polling.

2. **Live ARTEMIDA key-scoped shapes**
   **Test:** Re-run the probe from a key-holding account.
   **Expected:** `GET /keys/{id}`, `/subscription-links`, `/devices` return observable, recognized shapes; sub-link/QR/traffic/device UI populates.
   **Why human:** 02-01 probe account held 0 keys (accepted owner-pending caveat).

3. **Visual/interaction states**
   **Test:** Device/browser pass over TariffPicker (live price, disabled-until-ready, error+retry), TrialButton used/error, SubscriptionCard badges, ConfirmPanel second-tap/Escape/focus trap.
   **Why human:** Layout/interaction contracts are not covered by automated UI tests.

### Gaps Summary

The phase delivers a technically solid vertical slice — trial issuance, live pricing, the subscription list/detail (link/QR/traffic), device management, and guides are all present, wired, typecheck clean, build clean, and covered by 71 passing unit tests. However, one root-cause defect blocks the phase goal as stated ("...видит **свои** подписки"):

**`revalidateKeys()` mirrors the entire shared ARTEMIDA account into whichever user triggers a refresh.** Because the service runs on a single `ARTEMIDA_API_KEY` and `GET /keys` is account-wide (the `q`/customerRef filter the client already supports is deliberately unused — COVERAGE.md opts it out), every cabinet open, `/api/keys` hit, and bot «Мои ключи» upserts *all* provider keys under the calling user's `userId`. The cache is the source for the list, the key-detail ownership joins, and the device routes, so User A can see User B's subscriptions, read B's subscription URL, and delete B's devices. This was reproduced directly: after `revalidateKeys(A)` with the provider returning B's key, `listKeys(A)` returned B's key and its sub-link.

The fix is localized to `lib/keys-service.ts#revalidateKeys` (and optionally passing `q: String(telegramId)` in `lib/artemida.ts#listKeys`): only upsert keys whose `customerRef` equals the caller's telegram id (or only refresh already-owned `(userId, keyId)` rows). A two-user regression test should assert a foreign key never appears in the caller's cache.

Secondary warning: `getSubscriptionForUser` can overwrite a good cached `subscription_url` with `null` on a provider shape mismatch (the tolerant normalizer returns null on a 2xx rather than throwing).

---

_Verified: 2026-10-02T01:56:05Z_
_Verifier: the agent (gsd-verifier)_
