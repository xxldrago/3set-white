# Walking Skeleton — 3set-white

**Phase:** 1
**Generated:** 2026-09-30

## Capability Proven End-to-End

A Telegram user hitting /start or the PWA login lands in one users row keyed by telegram-id, holds one httpOnly session, and can install the RU cabinet shell from a production build.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.3.x App Router, single process, bot-in-Next via handleUpdate (D-01) | One deployable for web plus bot; matches locked decision, avoids second process |
| Data layer | Postgres 17 plus Prisma 7 pinned to caret 7.10.0 (D-05) | Relational orders plus tickets future; v8 tag is an RC and stays out |
| Auth | Dual Telegram HMAC verifiers plus one jose HS256 httpOnly session, telegram-id unique (D-09, D-10, D-12) | Bot and web resolve to one row; no passwords, no localStorage tokens |
| Deployment target | Local Compose web plus db now; full Nginx plus HTTPS plus my.3set.online in Phase 5 (D-06) | Reproducible topology from day one without blocking on the prod host |
| Directory layout | Single Next app: app routes plus lib services plus components plus prisma (D-04) | Later ARTEMIDA and Platega clients slot into lib with zero restructuring |
| PWA | Manifest plus viewport themeColor plus install prompt; Serwist deferred (D-13) | Install prompts work without offline support per Next.js docs |
| i18n | Hand-rolled typed RU dictionary plus t helper (D-16) | RU now, EN later with no refactor; next-intl deferred to v2 |

## Stack Touched in Phase 1

- [ ] Project scaffold (framework, build, lint, test runner)
- [ ] Routing — real routes: shell page, login, guides, auth API, webhook API
- [ ] Database — one real write (seed plus /start upsert) AND one real read (flow test plus session lookup)
- [ ] UI — interactive elements wired to the API (LoginButton post, InstallPrompt button)
- [ ] Deployment — documented local full-stack run (Compose file plus Homebrew Postgres fallback where Docker is absent)

## Out of Scope (Deferred to Later Slices)

- ARTEMIDA keys, pricing, trial issuance (Phase 2)
- Platega payments, renew, upgrade, history (Phase 3)
- Tickets, attachments, expiry reminders (Phase 4)
- Admin roles, broadcast, White Label, prod HTTPS on my.3set.online (Phase 5)
- Serwist offline support (explicitly deferred per D-13)
- Telegram OIDC login migration (backlog note from OQ-1)

## Subsequent Slice Plan

- Phase 2: trial in one tap plus live tariffs plus my-subscriptions with configs
- Phase 3: Platega pay-to-key pipeline plus renew plus upgrade plus history
- Phase 4: unified ticket queue plus attachments plus expiry pushes
- Phase 5: role-based admin plus White Label plus production deploy
