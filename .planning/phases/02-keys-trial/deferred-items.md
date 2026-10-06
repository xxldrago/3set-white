# Phase 02 — Deferred Items (out-of-scope discoveries)

> Items noticed during execution that are NOT caused by the current task's
> changes. Per the executor scope boundary they were left untouched.

| # | Found during | Item | Why out of scope | Status |
|---|--------------|------|------------------|--------|
| 1 | 02-02 Task 1 | `tests/unit/auth-widget.test.ts > rejects a replayed hash` fails locally | The test talks to Postgres via `consumeWidgetHash`; no local Postgres is configured (the working `.env.local` holds only `ARTEMIDA_API_KEY`/`ARTEMIDA_BASE_URL`). Pre-existing; the plan's 02-02 verify does not include this file. | Open — needs a running Postgres (or CI DB) to pass |
| 2 | 02-02 Task 1 | `tests/integration/auth-flow.test.ts` not run locally | Same missing-Postgres reason; the vitest config supplies a dummy `DATABASE_URL` for hermetic unit runs. Pre-existing, unrelated to 02-02. | Open — logged in `.planning/WINDOWS.md` |
| 3 | 02-04 Task 2 | Full `npx vitest run` parallel suite: `auth-flow.test.ts > rejects the replayed payload` flaked (200 instead of 401) | The test consumes a one-time replay hash in test 1 and asserts rejection in test 2; with test files running in parallel workers, `auth-widget.test.ts` calls `prisma.replayCache.deleteMany()` and can wipe the row in between. Passes cleanly in isolation (`npx vitest run tests/integration/auth-flow.test.ts` → 2 passed). Pre-existing test-isolation fragility, untouched by 02-04. | Open — logged in `.planning/WINDOWS.md` (id 6) |
