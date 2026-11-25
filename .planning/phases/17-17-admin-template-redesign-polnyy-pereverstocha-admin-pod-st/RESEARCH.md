# Phase 17 — /admin redesign research

**Phase:** 17 — Admin template redesign
**Goal:** полный переверсточа /admin под стилистику шаблона, замена текущих элементов

## 1. Current state

### `app/admin/page.tsx` (RSC entry — rewritten)
- `export const dynamic = 'force-dynamic'`
- Calls `await requireRole('administrator', 'manager')`; `SessionError` → `redirect('/login')`, `AdminError` → `notFound()` (per T-05-01/Pitfall 3 — layouts are not a boundary, page re-runs the guard).
- Renders `<AdminApp />`.

### `app/admin/AdminApp.tsx` (322 lines, single-page client dashboard)
- `'use client'`, imports `./admin.css`, uses lucide-react icons (`Search`, `Download`, `RotateCcw`).
- State: `period` (7/30/90), `searchQ` (300 ms debounce), `rows/count/truncated` (users), `promos`, `stats`, `wallet`, `sec` ('overview').
- Fetches (client-side, admin BFF): `/api/admin/referrals/stats?from&to`, `/api/admin/wallet`, `/api/admin/promos`, `/api/admin/users/search`.
- Sections rendered: **Overview** (kpi-grid + "Операционная воронка" bar chart + top-5 promos table + 7/30/90 period chips + balance rows), **Analytics** (funnel bars + KPI grid), **Users** (searchable table), **Wallet** (balance KPI), **Promos** (full table).
- `exportUsers()` builds a CSV from `/api/admin/users/search?q=` and triggers a browser download.

### `app/admin/admin.css` (79 lines of custom dark theme)
- `.admin` prefix, Manrope/Unbounded/JetBrains fonts, bg `#0e1512`, gradient bg, `.kpi-grid` (5 cols), `.card`, `.tbl`, `.chbars` funnel bars, `.chip`, `.btn-p/.btn-g/.btn-r`, `@media (max-width:1100px)` and `(max-width:720px)` breakpoints.

### Related shell (coexists, not part of the AdminApp rewrite)
- `app/admin/layout.tsx` — shadcn-style shell (title, `AdminNav`, RoleChip line).
- Other RSC pages: `app/admin/roles/page.tsx` (server-reads `loadAdminRoster` + `loadAdminUsersTable`), `app/admin/wallet/WalletClient.tsx`, `app/admin/analytics/page.tsx`, etc.

## 2. Patterns

### BFF endpoints (glob `app/api/admin/**`) — relevant for AdminApp
| Endpoint | Method | Returns |
|---|---|---|
| `/api/admin/referrals/stats` | GET (`from`, `to`, `granularity`, `userId`) | `{ stats, series, granularity }` — `funnelStats` + `funnelSeries` (lib/referral-stats); role: administrator |
| `/api/admin/wallet` | GET | `{ balance }` — ARTEMIDA `getBalance` (administrator-only) |
| `/api/admin/wallet/topups` | POST `{ amount }` | `{ topup }` — invoice/status (admin-wallet) |
| `/api/admin/wallet/topups/[paymentId]` | GET | topup status (processed/paid/CANCELED) for polling |
| `/api/admin/promos` | GET → `{ promos }` (PromoRow), POST create (409 `code_taken`) | promo list |
| `/api/admin/users/search` | GET `?q=` → `{ rows, count, truncated }` (ADMIN_SEARCH_LIMIT = 50) | `AdminSearchResult` rows |
| `/api/admin/users/[id]` | GET | `AdminProfile` (header + keys/payments/tickets sections) |
| `/api/admin/users/[id]/keys/[keyId]/devices` | GET | key device list |
| `/api/admin/roles` | POST `{ telegramId, role }` (`client` removes) | role change |
| `/api/admin/me` | GET | `{ role }` |

### `lib/admin-service.ts` (loadAdminUsersTable shape)
```
AdminUserTableRow: { id, telegramId, email, username, firstName, lastName, role,
  keysCount, ordersCount, createdAt, segment, recencyDays, frequency, monetary }
```
(`loadAdminUsersTable(segment?)`, 50 rows ordered by `createdAt desc`.)

### `lib/admin-stats.ts`
- `loadDbStats(from)` → `DbStats { revenue, users, orders }`
- `loadArtemidaStats()` → `ArtemidaStats { balance, keys, devices, degraded }` — 60 s TTL cache (`ARTEMIDA_CACHE_TTL_MS`)

### Existing tests (`tests/integration/admin-*.ts`)
- `tests/integration/admin-profile.test.ts` — partner subdomains (assign/resolve/taken/reserved), partner referral credits, admin referrals (`loadAdminReferrals`: count/earned/spent/rows), key-devices route gating, `loadAdminHeader` (trialUsed/paidOrders/paidTotal), `notifyAdminsNewTicket`.

## 3. Approach comparison

| Option | Description | Fit for "замена текущих элементов" |
|---|---|---|
| **Static-style UI fetched from real endpoints (current AdminApp style)** | Client components fetch `/api/admin/*`; dark theme via `admin.css`. | Lowest friction, matches the current shape — but it IS the current approach. |
| **Enhance existing components** (`components/admin/*`) | Server-rendered RSC pages using `CARD`/`GRID`/`FUNNEL_GRID` tokens, `StatsPanel`, `PeriodSelector`, `MetricCard`. | Natural for the standalone section pages (`/admin/roles`, `/admin/wallet`, …) — but the redesign goal is replacing the single-page AdminApp. |
| **Template-style rewrite of AdminApp** (recommended) | Replace AdminApp's visuals with the template's design (shadcn tokens + template classes from keys.html), keeping the client-fetch data flow and the page guard. | Directly matches the goal: "полный переверсточа /admin под стилистику шаблона". |

**Theme approach:** use existing shadcn design tokens already present in `components/admin/*` — `CARD` (`rounded-2xl border border-line p-6`), `GRID`/`FUNNEL_GRID`, `text-muted`, `text-dim`, `tabular-nums`, `bg-foreground`, `text-lime`, dark mode via Tailwind class + `class="dark"` support. Delete `admin.css` in the redesign (it belongs to the old look).

## 4. Data plan — AdminApp endpoint → section mapping

| Section | Endpoint | Response fields used |
|---|---|---|
| **Overview** | `/api/admin/referrals/stats?from&to` | `stats.{clicks, registrations, purchases, revenue, devices}` + `series` (chart) |
| | `/api/admin/wallet` | `balance.{balance, unlimited, currency}` |
| | `/api/admin/promos` | `promos[]` (code, type, discount, usedCount, maxUses, expiresAt) — top-5 table |
| **Analytics** | `/api/admin/referrals/stats` (same, period-driven) | funnel series → charts |
| **Users** | `/api/admin/users/search?q=` | `rows`, `count`, `truncated` |
| **Wallet** | `/api/admin/wallet` | balance |
| | `/api/admin/wallet/topups/[paymentId]` (5 s poll) | topup status while creating |
| **Promos** | `/api/admin/promos` | full list table |

Additional endpoints the redesigned shell should use where relevant: `/api/admin/roles` (POST), `/api/admin/users/[id]` (profile expand), `/api/admin/users/[id]/keys/[keyId]/devices`, `/api/admin/me`.

## 5. Template UI patterns (from `keys.html`, untracked scratch mockup) + animation

CSS custom properties seen: `--bg:#0e1512`, `--panel:#131c17`, `--lime:#b7ff45`, `--lime-2:#d4ff85`, `--green:#8fdc2c`, `--amber:#ffd166`, `--red:#ff7a6b`, `--r-lg:22px`, `--r-md:16px`, `--r-sm:12px`, `--ease:cubic-bezier(.22,.9,.28,1)`, `--shadow`, `--glow`.
Classes seen: `.bg-fx` (fixed grid), `.card.reveal`, `.blob b1/b2/b3`, `.kc-stats`, `.kc-prog` (progress bars), `.stats-strip`, `.tabs`, `.pill`, `.page-title`, `.keyCards`… — i.e. dark cards, progress bars, stats strips, pill/chip toggles.
Animation: `countUp` (number counting), `toast()`, `confetti()`, IntersectionObserver `.reveal` classes, glow blobs (`--glow`, spring-ish `--ease`). For the admin redesign: use `series` data from `/api/admin/referrals/stats` for sparkline/bar charts; keep `tabular-nums` on numbers.

**Open question / note:** the garbled user fragment "f-u-C2-68кест-light via ffrврендер" was not found anywhere in the repo (`keys.html` has no `fu-*`/`c2-68` classes; no table classes either). Recommend confirming with the user what that fragment refers to before implementation.
