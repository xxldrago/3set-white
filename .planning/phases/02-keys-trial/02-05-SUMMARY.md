---
phase: 02-keys-trial
plan: '05'
subsystem: api
tags: [artemida, subscription-link, qr, traffic, bff, rsc, telegraf, i18n, vitest, next]

# Dependency graph
requires:
  - phase: 02-keys-trial/02-01
    provides: docs/artemida-v1-contract.{md,json} — key-scoped shapes explicitly UNKNOWN (0-key probe)
  - phase: 02-keys-trial/02-02
    provides: lib/artemida.ts (getSubscriptionLinks/getTraffic, tolerant normalizers), lib/session.ts (requireSession), BFF pattern
  - phase: 02-keys-trial/02-03
    provides: lib/keys-service.ts shared path, expanded keys_cache mirror (subscription_url/traffic)
  - phase: 02-keys-trial/02-04
    provides: RenderedKey/statusLabel/formatKeyDate, cache-first listKeys/revalidateKeys, bot «Мои ключи»
  - phase: 01-foundation/01-04
    provides: app/guides/page.tsx (TRIAL-03 cabinet half, already shipped)
provides:
  - lib/qr.ts — server-only renderSubscriptionQr (QRCode.toString({type:'svg'}), no toSvg)
  - lib/keys-service.ts — getKeyForUser + getSubscriptionForUser (ownership-joined)
  - app/api/keys/[id]/route.ts — session-gated key detail BFF
  - app/api/keys/[id]/subscription/route.ts — subscription link + traffic BFF
  - app/keys/[id]/page.tsx — key-detail RSC (link, copy, QR, traffic, guides deep-link)
  - components/QrSvg.tsx + components/CopyButton.tsx
  - lib/bot.ts — key:link action (link + guides pointer) and working «Инструкции»
  - tests/unit/qr.test.ts — server-SVG / no-toSvg / no-external-image vectors
affects: [02-06]

# Actuals (#2632) — chars/4 over the realized non-lockfile diff (27740 patch chars / 4).
actuals:
  tokens: 6935
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: ["qrcode@^1.5.4", "@types/qrcode@^1.5.6"]
  patterns:
    - "Server-rendered QR: QRCode.toString(url, {type:'svg'}) injected as inert SVG; no third-party image URL (UI-SPEC contract)"
    - "Ownership-joined detail read on (userId, keyId) before any provider call — non-owned key is indistinguishable from missing (T-02-17)"
    - "Tolerant key-scoped read: an absent subscription URL degrades to key.linkUnavailable; a fetch failure to key.linkError — never a fabricated URL (02-01 KEY CONTRACT)"
    - "Small client island (CopyButton) for browser-only clipboard inside an async RSC page"
    - "Bot resolves the sub-link through the same getSubscriptionForUser service the cabinet uses; URL sent to the owning chat only, never logged (T-02-18)"
    - "Inline callback_data uses a list index, not the provider key id, to stay under Telegram's 64-byte limit"

key-files:
  created:
    - lib/qr.ts
    - app/api/keys/[id]/route.ts
    - app/api/keys/[id]/subscription/route.ts
    - app/keys/[id]/page.tsx
    - components/QrSvg.tsx
    - components/CopyButton.tsx
    - tests/unit/qr.test.ts
  modified:
    - lib/keys-service.ts
    - lib/i18n/messages/ru.ts
    - lib/bot.ts
    - package.json
    - package-lock.json

key-decisions:
  - "getSubscriptionForUser returns null for a non-owned/missing key (no oracle) and propagates ArtemidaError from the sub-link fetch so callers can distinguish key.linkError (fetch failed) from key.linkUnavailable (valid response, no URL)"
  - "Traffic fetch failure degrades to nulls instead of failing the link (display-only, D-31); the fresh sub-link/traffic values mirror back into keys_cache only after the sub-link call succeeds, so a shape mismatch never wipes a good cached URL"
  - "QR is rendered locally as an SVG string by lib/qr.ts and injected via QrSvg — never a URL to fetch (T-02-19); test asserts no toSvg, no <image>, no external href"
  - "bot key:link replies `${t('key.linkTitle')}\\n${url}\\n\\n${t('key.guidesCta')} — ${t('bot.menuGuides')}` and the previously dead «Инструкции» button now resolves the shared guides.* copy (TRIAL-03 bot parity)"
  - "No new i18n keys were needed for Task 2; the eleven key.* additions from Task 1 are referenced by page/CopyButton/bot, keeping the no-unused-keys invariant green"

patterns-established:
  - "Credential-bearing subscription URLs are rendered inline to the owning user only; logs carry {route, code, requestId} at most"
  - "Missing-vs-error UI split: valid-but-absent → neutral placeholder; fetch failure → mapped error + retry"

requirements-completed: [CAB-04, TRIAL-03]

coverage:
  - id: D1
    description: "renderSubscriptionQr returns a local SVG (starts with <svg) with no toSvg export and no <image>/external href"
    requirement: CAB-04
    verification:
      - kind: unit
        ref: "tests/unit/qr.test.ts (4 vectors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/keys/[id] and /subscription are session-gated, zod-validate the id, and 404 a non-owned key without leaking a reason"
    requirement: CAB-04
    verification: []
    human_judgment: true
    rationale: "No dedicated route unit-vector; thin wrappers over the ownership-joined service plus the proven requireSession/ArtemidaError pattern. The 404/IDOR path needs an authenticated request-level run."
  - id: D3
    description: "Key detail renders the subscription URL with a copy control, a locally produced SVG QR, humanized traffic and the guides deep-link; missing link shows key.linkUnavailable, failure shows key.linkError"
    requirement: CAB-04
    verification: []
    human_judgment: true
    rationale: "Visual/interaction contract (UI-SPEC long-text/partial/error states); production build is green and the page is dynamic (ƒ) but the visual states need a browser pass."
  - id: D4
    description: "The bot delivers the subscription link through the shared path and points at the guides; the «Инструкции» button resolves the same guides.* copy"
    requirement: TRIAL-03
    verification: []
    human_judgment: true
    rationale: "Telegraf handlers are not unit-tested (importing lib/bot.ts launches polling); the inline-keyboard flow requires a manual Telegram review."
  - id: D5
    description: "i18n dictionary has no missing or unused keys after the key-detail strings"
    requirement: null
    verification:
      - kind: unit
        ref: "tests/unit/i18n.test.ts#dictionary has no unused keys"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-10-02
status: complete
---

# Phase 02 Plan 05: Key Detail — Subscription Link, QR & Traffic Summary

**The key-detail vertical slice ships: an ownership-joined subscription URL with a locally rendered SVG QR (`QRCode.toString({type:'svg'})`, never a third-party image), humanized display-only traffic, and the guides deep-link — plus the bot delivering the same link and a working «Инструкции» reply, with a clean RU fallback when the unobserved provider shape has no URL.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-02T11:35:00Z (approx)
- **Completed:** 2026-10-02T11:42:00Z (approx)
- **Tasks:** 2 of 2
- **Files created/modified:** 12 (Task 1: 11, Task 2: 1)
- **Commits:** 2

## Accomplishments

- **Server-rendered QR (D-30 / T-02-19):** `lib/qr.ts#renderSubscriptionQr` wraps `QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 256 })`. There is no `toSvg()` in the package (RESEARCH Pitfall 3); the test asserts that absence, plus no `<image>` and no external `href`, and that distinct URLs yield distinct SVGs (payload proof). `components/QrSvg.tsx` injects the trusted SVG string as inert markup and never accepts a URL.
- **Ownership-joined reads (T-02-17 / T-02-20):** `getKeyForUser` and `getSubscriptionForUser` resolve the owning `userId` from the session telegram id and join on `(userId, keyId)`; a key the caller does not own returns `null` (same as missing), and no provider call is made for a non-owned key. Both BFF routes `requireSession()` first and zod-validate the `id` path segment.
- **Tolerant key-scoped contract (02-01 KEY CONTRACT):** the provider's `GET /keys/{id}`, `/subscription-links` and `/devices` shapes remain `UNKNOWN` (0-key probe). `getSubscriptionForUser` propagates an `ArtemidaError` from the sub-link call so the page shows `key.linkError` + `common.retry`; a valid response without a URL shows `key.linkUnavailable` — never a fabricated URL or an empty QR. The traffic read is display-only (D-31) and degrades to nulls rather than failing the link. Fresh values mirror into `keys_cache` only after the sub-link call succeeds, so a shape mismatch cannot wipe a good cached URL.
- **Key-detail page:** async RSC with the key name, expiry (`key.expires`, `DD.MM.YYYY`), derived status, the `key.linkTitle` block with a copy control (`key.copy` idle / `key.copied` confirmed, ≥44px), an inline `QrSvg` with `key.qrCaption`, a `key.trafficLabel` line (`key.trafficUsed` when unlimited, `key.trafficOf` when limited, humanized GB/MB, `tabular-nums`), and a `key.guidesCta` deep-link to `/guides` (TRIAL-03). Long URLs wrap with `break-all` and clamp to two lines.
- **Bot parity (CAB-04 / TRIAL-03):** «Мои ключи» now attaches one inline control per key; the `key:link:<index>` handler resolves the link through the SAME `getSubscriptionForUser` path and replies with the URL plus a «Как подключиться» pointer. The previously dead «Инструкции» button now resolves the shared `guides.*` copy. The subscription URL is sent to the owning chat only and never logged (T-02-18); polling-launch guard and PII-safe logging are untouched.
- **i18n:** eleven `key.*` keys added and referenced by page/CopyButton/bot; no unused or missing keys (completeness scanner green).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — key detail with subscription link, QR and traffic** — `3a8b984` (feat)
2. **Task 2: Bot subscription-link message + guides (TRIAL-03 bot half)** — `7e4e090` (feat)

**Plan metadata:** committed with this SUMMARY (docs).

## Files Created/Modified

- `lib/qr.ts` — server-only `renderSubscriptionQr`; local SVG, no `toSvg`.
- `lib/keys-service.ts` — `getKeyForUser`, `SubscriptionForUser`, `getSubscriptionForUser` (ownership join → `getSubscriptionLinks` → best-effort `getTraffic` → cache mirror).
- `app/api/keys/[id]/route.ts` — session-gated `{ key }` detail BFF; zod id; 404 non-owned; typed error mapping; code/requestId-only logging.
- `app/api/keys/[id]/subscription/route.ts` — session-gated `{ subscriptionUrl, links, traffic }` BFF; same 404/IDOR and error discipline.
- `app/keys/[id]/page.tsx` — async RSC key-detail slice (link/copy/QR/traffic/expiry/guides).
- `components/QrSvg.tsx` — server component rendering the trusted SVG inline.
- `components/CopyButton.tsx` — client copy island (deviation; see below).
- `lib/i18n/messages/ru.ts` — `key.linkTitle/copy/copied/qrCaption/trafficLabel/trafficUsed/trafficOf/guidesCta/linkUnavailable/linkError`.
- `lib/bot.ts` — inline per-key link controls, `key:link:<index>` handler, working `menuGuides` reply.
- `tests/unit/qr.test.ts` — 4 QR vectors.
- `package.json` / `package-lock.json` — `qrcode` + `@types/qrcode`.

## Decisions Made

- **Missing vs error:** `getSubscriptionForUser` returns `null` for a non-owned/missing key and lets `ArtemidaError` escape from the sub-link fetch. This gives the route a clean 404 and the page the `key.linkError` state, distinct from the valid-response `key.linkUnavailable` placeholder the UI-SPEC requires.
- **No wipe on shape drift:** the cache mirror is written only after the sub-link call succeeds, so a tolerant normalizer returning `null` on a shape mismatch never deletes a previously good URL.
- **Index-based bot callbacks:** `key:link:<index>` keeps the callback payload tiny and avoids Telegram's 64-byte `callback_data` cap on long provider key ids.
- **Task 2 needed no new i18n keys:** it reuses `key.linkTitle`/`key.guidesCta`/`key.linkUnavailable`/`key.linkError` and the existing `guides.*` set, so `ru.ts` was unchanged by Task 2 despite being listed in the plan's file set.

## Deviations from Plan

### Auto-fixed / adjustments

**1. [Rule 3 - Blocking] Added `components/CopyButton.tsx` (new client island)**
- **Found during:** Task 1 (`app/keys/[id]/page.tsx`)
- **Issue:** The plan requires a copy button with `key.copy`/`key.copied`, but `app/keys/[id]/page.tsx` is an async RSC and clipboard access is browser-only. No file in the plan's `files_modified` set can host a client component without violating the RSC / `'use client'` contract (`QrSvg.tsx` is explicitly a server component).
- **Fix:** A minimal `'use client'` `CopyButton` receiving the URL as a prop; the page renders it inside the link block. ≥44px touch target (`h-11`).
- **Files modified:** `components/CopyButton.tsx` (new), `app/keys/[id]/page.tsx`
- **Verification:** `npx tsc --noEmit` clean; `npm run build` green; i18n completeness green.
- **Committed in:** `3a8b984`
- **Ledger:** recorded in `.planning/WINDOWS.md` (id 8).

---

**Total deviations:** 1 (blocking). No unplanned runtime feature; the dependency install (`qrcode`, `@types/qrcode`) is exactly the plan's, both RESEARCH-audit Approved (T-02-SC).

## Issues Encountered

- **Local DB for the full unit suite:** the DB-backed vectors (`keys-service`, `trial-claim`, `trial-rollback`, `auth-widget`) required `DATABASE_URL` pointing at the local Homebrew Postgres (`setwhite`). The plan's Task 2 verify (`npx vitest run tests/unit`) is green with it exported (10 files / 59 tests).
- **Build env:** `.env.local` holds only ARTEMIDA vars, so `npm run build` was given throwaway `BOT_TOKEN`/`BOT_TEST_TOKEN`/`DATABASE_URL`/`SESSION_SECRET`/`WEBHOOK_SECRET` inline (same hermetic approach as prior waves). Build compiled successfully and the new routes render as dynamic (ƒ).

## Known Stubs

None. The `key.linkUnavailable` / `key.linkError` placeholders are intentional partial/error states, not stubs — no hardcoded-empty data flows into a successful render.

## Threat Flags

None — the new surface (`/api/keys/[id]`, `/api/keys/[id]/subscription`, `/keys/[id]`, the bot link action) is exactly the plan's threat model. Mitigations implemented: T-02-17 (ownership-joined read; non-owned key indistinguishable from missing), T-02-18 (subscription URL never logged; logs carry `{route, code, requestId}` only), T-02-19 (local SVG only; no URL accepted by `QrSvg`; test asserts no external refs), T-02-20 (zod-validated id + awaited async params), T-02-SC (only the audited `qrcode`/`@types/qrcode` installed).

## User Setup Required

None for steady state. To reproduce the verification:

```bash
export DATABASE_URL="postgresql://<local-user>@127.0.0.1:5432/setwhite"
npx tsc --noEmit
npx vitest run tests/unit
BOT_TOKEN=... BOT_TEST_TOKEN=... SESSION_SECRET=... WEBHOOK_SECRET=... npm run build
```

## Next Phase Readiness

- `getKeyForUser`/`getSubscriptionForUser` extend the single `lib/keys-service.ts` path — 02-06 (devices) should add its functions there, not a parallel Prisma/fetch path.
- `renderSubscriptionQr` + `QrSvg` are reusable for the devices screen if needed.
- ⚠️ Key-scoped provider shapes (`GET /keys/{id}`, `/subscription-links`, `/devices`) are still `UNKNOWN` (0-key probe): the first phase holding a key should re-probe and tighten the tolerant normalizers. Tracked as WINDOWS id 1.
- ⚠️ The bot's inline `key:link:<index>` maps to the current `listKeys` ordering at tap time; if 02-06 changes list ordering, keep it index-stable or switch to a stable token.

---

*Phase: 02-keys-trial*
*Completed: 2026-10-02*

## Self-Check: PASSED

- FOUND: lib/qr.ts
- FOUND: lib/keys-service.ts (getKeyForUser/getSubscriptionForUser)
- FOUND: app/api/keys/[id]/route.ts
- FOUND: app/api/keys/[id]/subscription/route.ts
- FOUND: app/keys/[id]/page.tsx
- FOUND: components/QrSvg.tsx
- FOUND: components/CopyButton.tsx
- FOUND: tests/unit/qr.test.ts
- FOUND: commit 3a8b984 (Task 1)
- FOUND: commit 7e4e090 (Task 2)
- VERIFY: `npx tsc --noEmit` exits 0
- VERIFY: `npx vitest run tests/unit` → 10 files / 59 tests passed (with local Postgres)
- VERIFY: `npx vitest run tests/unit/qr.test.ts tests/unit/i18n.test.ts` → 9 passed
- VERIFY: `npm run build` → Compiled successfully; `/keys/[id]`, `/api/keys/[id]`, `/api/keys/[id]/subscription` all dynamic (ƒ)
- VERIFY: QR output starts with `<svg`, no `toSvg`, no `<image>`, no external `href`
- VERIFY: no STATE.md / ROADMAP.md modification by this executor
