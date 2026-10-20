---
phase: 04-support-retention
plan: 02
subsystem: attachments
tags: [sharp, image-validation, magic-bytes, webp-downscale, upload-volume, path-confinement, SUP-02]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: zod-validated `lib/env.ts` singleton + server-only module conventions
  - phase: 04-support-retention
    provides: Ticket/Attachment schema + `Attachment.path` column (04-01)
provides:
  - lib/attachments.ts — the one NormalizedAttachment contract for both channels (normalizeImage / saveAttachment / readAttachment)
  - sharp@^0.35.5 pinned direct dependency, cleared through the legitimacy gate
  - UPLOAD_DIR + ADMIN_TELEGRAM_IDS env fields; named `uploads` compose volume
  - WebP/1600px/5 MiB/path-confinement security boundary for every attachment
affects: [04-04 cabinet multipart + gated serve, 04-05 thread UI, 04-06 thread UI, 04-07 bot getFileLink intake]

actuals:
  tokens: 3600
  tasks: 3
  commits: 4

tech-stack:
  added:
    - "sharp@^0.35.5 — native image decode/validate/downscale (server-only, D-54)"
  patterns:
    - "Format decided from decoded bytes (sharp.metadata().format allow-list) — never filename/MIME"
    - "Bounded re-encode: <=1600px WebP q80; 5 MiB pre-decode cap + limitInputPixels + animated:false"
    - "Server-generated randomUUID storage name; only a RELATIVE path is persisted"
    - "readAttachment: path.resolve(...).startsWith(UPLOAD_DIR + path.sep) confinement guard"
    - "Tests point env.UPLOAD_DIR at a mkdtemp dir before dynamically importing the module"

key-files:
  created:
    - lib/attachments.ts
    - tests/unit/ticket-attachments.test.ts
  modified:
    - lib/env.ts
    - package.json
    - package-lock.json
    - docker-compose.yml
    - .env.example
    - next.config.ts

key-decisions:
  - "sharp legitimacy checkpoint (SUS reason: too-new) cleared on evidence: official lovell/sharp repo, Apache-2.0, no postinstall script, 128M+ weekly downloads, and already present at 0.35.5 as next's optional transitive dep"
  - "UPLOAD_DIR defaults to /data/uploads — mirrors the compose mount; server-only, never NEXT_PUBLIC_*"
  - "ADMIN_TELEGRAM_IDS is a string allow-list (empty/unset = no admins) parsed by a later plan's requireAdminSession"
  - "next.config outputFileTracingIncludes is belt-and-braces insurance only — the Docker runner copies full node_modules"
  - "SUP-02 not checked complete here: it spans 04-04/04-05/04-06/04-07 (channel wiring); this plan delivers the shared pipeline half"

patterns-established:
  - "Magic-byte truth: allow-list {jpeg,png,webp}; SVG/HTML/garbage byte streams rejected"
  - "UnsupportedImageError wraps every size/format/decode rejection at one boundary"
  - "No attachment bytes or paths are ever logged (AG-8); module logs nothing"

requirements-advanced: [SUP-02]
requirements-completed: []

coverage:
  - id: D1
    description: "Only real jpeg/png/webp bytes are accepted; format comes from decoded bytes via sharp, not the client filename/MIME"
    requirement: SUP-02
    verification:
      - kind: unit
        ref: "tests/unit/ticket-attachments.test.ts#accepts jpeg/png/webp and returns normalized WebP bytes"
        status: pass
      - kind: unit
        ref: "tests/unit/ticket-attachments.test.ts#rejects a non-image buffer with UnsupportedImageError"
        status: pass
    human_judgment: false
  - id: D2
    description: "Accepted images are downscaled to <=1600px WebP; the 5 MiB cap is enforced on the raw bytes before decode"
    requirement: SUP-02
    verification:
      - kind: unit
        ref: "tests/unit/ticket-attachments.test.ts#downscales a 3000px image to <=1600 and never enlarges a small one"
        status: pass
      - kind: unit
        ref: "tests/unit/ticket-attachments.test.ts#rejects an empty buffer and a buffer over 5 MiB"
        status: pass
    human_judgment: false
  - id: D3
    description: "Storage name is server-generated; only a relative path is persisted; a read that escapes UPLOAD_DIR is refused"
    requirement: SUP-02
    verification:
      - kind: unit
        ref: "tests/unit/ticket-attachments.test.ts#saveAttachment writes under UPLOAD_DIR and returns a relative path"
        status: pass
      - kind: unit
        ref: "tests/unit/ticket-attachments.test.ts#readAttachment refuses a traversal path / an absolute path"
        status: pass
    human_judgment: false
  - id: D4
    description: "Upload volume + env fields + standalone sharp tracing exist for dev and prod"
    verification:
      - kind: other
        ref: "docker-compose.yml named `uploads` volume at /data/uploads; .env.example UPLOAD_DIR placeholder; next.config outputFileTracingIncludes"
        status: pass
    human_judgment: false

duration: 29min
completed: 2026-10-03
status: complete
---

# Phase 4 Plan 2: Attachment pipeline Summary

**One server-only `lib/attachments.ts` turns untrusted bytes from both channels into a bounded WebP on a confined local volume — format from magic bytes via `sharp`, 5 MiB/1600px caps, and a path-escape guard — backed by the pinned `sharp` dep and the compose upload volume.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-10-03T11:11:03Z
- **Completed:** 2026-10-03T11:40:07Z
- **Tasks:** 3
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- [BLOCKING] Package-legitimacy checkpoint for `sharp` cleared on the plan's evidence and independent inspection: the only SUS signal was `too-new` (latest patch `0.35.5`, 2026-09-27). The package is the official `lovell/sharp` project (Apache-2.0, homepage `sharp.pixelplumbing.com`), has **no** `postinstall` script, 128M+ weekly downloads, and was **already installed** at `0.35.5` as `next@16.3.7`'s optional dependency. Promoted to a direct dependency so `npm ci` guarantees it on deploy.
- `lib/attachments.ts` is now the single image-validation/storage path (T-04-05/06/07): format is decided from `sharp.metadata().format` against `{jpeg,png,webp}` (a spoofed filename/MIME is ignored, SVG/HTML rejected), inputs are capped at 5 MiB before decode with `limitInputPixels: 4096*4096` and `animated: false`, accepted images are auto-oriented and downscaled to ≤1600px WebP q80, and stored under `UPLOAD_DIR/<ticketId>/<uuid>.webp` with only a relative path returned.
- `readAttachment` refuses any resolved path that escapes `UPLOAD_DIR` (`../escape`, absolute paths) — the IDOR/LFI boundary for the gated serve route in 04-04.
- Volume/config wiring exists for dev + prod: named `uploads` compose volume at `/data/uploads`, `UPLOAD_DIR`/`ADMIN_TELEGRAM_IDS` in `lib/env.ts`, placeholders in `.env.example`, and a narrow `outputFileTracingIncludes` for `sharp`/`@img`.
- Full unit suite green: 23 files / 191 tests; `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: [BLOCKING] Approve the `sharp` package before install (legitimacy gate)** - `0dba9cf` (chore)
2. **Task 2: normalizeImage + local-volume save/read (tracer)** - `07a1586` (feat)
3. **Task 3: Upload volume + .env.example + standalone tracing config** - `bd0e3c4` (chore)

**Plan metadata:** (this SUMMARY commit, docs)

_Note: Task 2 is the tracer; its `<verify>` (`npx vitest run tests/unit/ticket-attachments.test.ts`) was re-run end-to-end before Task 3 and passed — no expansion onto an unproven slice._

## Files Created/Modified

- `lib/attachments.ts` (NEW) — `MAX_ATTACHMENT_BYTES`, `UnsupportedImageError`, `NormalizedAttachment`, `normalizeImage`, `saveAttachment`, `readAttachment`; resolves `UPLOAD_DIR` once at module load.
- `tests/unit/ticket-attachments.test.ts` (NEW) — 7 vectors: accept 3 formats → WebP, reject text/SVG, 3000px downscale (no enlarge), size cap (empty / >5 MiB), traversal + absolute read refusal, relative save round-trip.
- `lib/env.ts` — `UPLOAD_DIR` (`min(1).default("/data/uploads")`) and optional `ADMIN_TELEGRAM_IDS`.
- `package.json` / `package-lock.json` — `sharp` promoted from optional transitive to direct dep `^0.35.5`.
- `docker-compose.yml` — `UPLOAD_DIR: /data/uploads` on `web`, `uploads:/data/uploads` mount, top-level `uploads` volume.
- `.env.example` — `UPLOAD_DIR=/data/uploads` + commented `ADMIN_TELEGRAM_IDS` placeholder.
- `next.config.ts` — `outputFileTracingIncludes` for `node_modules/sharp/**/*` and `node_modules/@img/**/*`.

## Decisions Made

- **Checkpoint cleared, not skipped:** the SUS verdict was a recency false-positive; the plan's evidence plus direct inspection (`repository`, `license`, `scripts` showing no `postinstall`, installed version) established the package is legitimate. Recorded here per the SUS protocol instead of pausing, per the orchestrator's explicit instruction to proceed when the install is judged safe.
- **Format truth is byte-derived:** acceptance keys on `sharp.metadata().format`; the API/route layers must still never trust `File.type`/`file.name` — that enforcement is `normalizeImage`'s job and is tested.
- **Relative-path-only persistence:** `saveAttachment` returns `path.relative(UPLOAD_DIR, abs)` to feed `Attachment.path` (04-01) — no absolute path ever crosses into the DB.
- **`ADMIN_TELEGRAM_IDS` shape deferred:** stored as an optional comma-separated string; the `Set<number>` parse + `requireAdminSession` live in the plan that owns the admin routes (04-04), keeping this plan to config + pipeline.
- **SUP-02 left unchecked:** the requirement needs both channel heads; this plan is the shared pipeline half, so the requirement is recorded as *advanced*, not complete.

## Deviations from Plan

None - plan executed exactly as written. The only judgment call — proceeding through the blocking `sharp` checkpoint — was explicitly authorized by the orchestrator and is documented above.

## Issues Encountered

None. `npm install sharp@^0.35.5` was a no-op download (already present) that only promoted the dependency edge in `package.json`/`package-lock.json`. `docker compose config` could not be run (no Docker CLI/daemon on this host); the YAML was verified structurally by inspection and `next.config.ts` typechecks via the clean `tsc` run.

## User Setup Required

None beyond the approved install. For prod, ensure `UPLOAD_DIR` is set (compose provides `/data/uploads`) and, for admin reply/close in later plans, add real Telegram ids to `ADMIN_TELEGRAM_IDS` in the server `.env` — placeholders only are committed.

## Next Phase Readiness

- 04-04 (cabinet multipart + gated serve) can call `normalizeImage` → `saveAttachment` and later `readAttachment(att.path)` directly; routes touching `sharp` must declare `export const runtime = "nodejs"`.
- 04-07 (bot intake) can `fetch(ctx.telegram.getFileLink(...))` → `Buffer` → the same `normalizeImage`.
- No blockers. The upload volume is declared; `sharp` is pinned and traced for the standalone image.

---
*Phase: 04-support-retention*
*Completed: 2026-10-03*

## Self-Check: PASSED

- FOUND: lib/attachments.ts
- FOUND: tests/unit/ticket-attachments.test.ts
- FOUND: lib/env.ts
- FOUND: docker-compose.yml
- FOUND: .env.example
- FOUND: next.config.ts
- FOUND: package.json
- FOUND: 0dba9cf (Task 1 sharp gate + pin)
- FOUND: 07a1586 (Task 2 attachments pipeline)
- FOUND: bd0e3c4 (Task 3 volume + config)
