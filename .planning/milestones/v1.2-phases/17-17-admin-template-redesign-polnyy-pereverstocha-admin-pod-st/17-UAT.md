=== GSD verify-work: Phase 17 ===
## UAT results
| Test | Status | Notes |
|---|---|---|
| GET /api/admin/users/search?q=sokol | 401 | ok |
| GET /api/admin/promos | 401 | ok |
| GET /api/admin/referrals/stats | 401 | ok |
| GET /api/admin/referrals/top-refs | 401 | ok (post-deploy) |
| GET /api/admin/wallet | 401 | ok |
| GET /admin (no session) | 307 | redirect to login, ok |
| tsc --noEmit |        0 errors |
