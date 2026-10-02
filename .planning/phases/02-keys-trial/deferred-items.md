# Phase 02 — Deferred Items (out-of-scope discoveries)

> Items noticed during execution that are NOT caused by the current task's
> changes. Per the executor scope boundary they were left untouched.

| # | Found during | Item | Why out of scope | Status |
|---|--------------|------|------------------|--------|
| 1 | 02-02 Task 1 | `tests/unit/auth-widget.test.ts > rejects a replayed hash` fails locally | The test talks to Postgres via `consumeWidgetHash`; no local Postgres is configured (the working `.env.local` holds only `ARTEMIDA_API_KEY`/`ARTEMIDA_BASE_URL`). Pre-existing; the plan's 02-02 verify does not include this file. | Open — needs a running Postgres (or CI DB) to pass |
| 2 | 02-02 Task 1 | `tests/integration/auth-flow.test.ts` not run locally | Same missing-Postgres reason; the vitest config supplies a dummy `DATABASE_URL` for hermetic unit runs. Pre-existing, unrelated to 02-02. | Open — logged in `.planning/WINDOWS.md` |
