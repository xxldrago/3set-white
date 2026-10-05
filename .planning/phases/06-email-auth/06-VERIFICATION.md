---
phase: 06-email-auth
verified: 2026-10-05T16:45:00Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Откройте /login на десктопе 1440px, проверьте центрирование виджета Telegram под email-формой"
    expected: "Виджет строго по центру колонки max-w-md, без уползания влево-вниз; поздняя подгрузка iframe не сдвигает layout"
    why_human: "Визуальный layout нельзя проверить grep/тестами; код-уровень (in-flow flex, min-h-24, ноль absolute/fixed в цепочке) верифицирован"
  - test: "Клик-проход: переключение login/register (?mode=register), неверные креды, rate-limit лок, сброс через /reset и /reset/confirm, привязка/отвязка Telegram и смена пароля в Account"
    expected: "Одинаковый generic-копипаст на 401/409, 429 с серверным ожиданием, токен-панели invalid/expired/used, unlink-предупреждение lastMethod до второго тапа, успех ведёт на / (reset-confirm — на явный re-login)"
    why_human: "В репо нет автоматизированных UI-тестов; интерактивные флоу требуют живого браузера"
  - test: "Запросите сброс пароля для реального аккаунта с настроенным SMTP-релеем"
    expected: "Письмо со ссылкой приходит в течение минуты; ссылка одноразовая, живёт 1 час; после confirm новый пароль входит, старый — нет"
    why_human: "Реальная SMTP-доставка требует прод-кредов, которых нет в этой среде; код-путь покрыт fake-transport векторами"
---

# Phase 6: Email Auth Verification Report

**Phase Goal:** Пользователь регистрируется и входит по email, может связать Telegram-аккаунт, восстанавливает пароль по почте
**Verified:** 2026-10-05T16:45:00Z
**Status:** human_needed (автопроверки зелёные, блокеров нет; остались предзаявленные UAT-кавеаты)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Пользователь регистрируется по email + пароль без верификации и сразу входит; сессия — та же httpOnly cookie | ✓ VERIFIED | `app/api/auth/email/register/route.ts` минтит `signSession(user.id, null)` + `buildSessionCookie` (тот же `3set_session`, что в `app/api/auth/telegram/route.ts:97,145`); интеграционный вектор «register creates the user and mints a uid-subject session» зелёный в моём прогоне (17/17) |
| 2 | Пользователь входит по email + пароль; привязывает Telegram к email-аккаунту и наоборот | ✓ VERIFIED | Login: байт-идентичный 401 + dummy-verify + escalating lock (тесты «byte-identical 401», «repeated failures lock» зелёные). Link: dual-proof (`requireSession` + `verifyWidget` + `consumeWidgetHash`), merge в одной транзакции, 409 `telegram_taken` без сайд-эффектов; unlink за confirm-флагом с `lastMethod`-хинтом; change-password с проверкой текущего — все векторы 17/17 зелёные |
| 3 | Пользователь сбрасывает пароль через ссылку на email | ✓ VERIFIED | Request (1h TTL `RESET_TTL_MS`, honest 404 `reset_no_account` — единственная принятая enumeration-поверхность) + confirm (shape-gate, timing-safe compare, used/expiry до эффекта, atomic consume `updateMany count===1` в транзакции, без авто-сессии). 10 reset-векторов вкл. concurrent double-confirm — зелёные в полном прогоне 388/388 |
| 4 | Trial для email-аккаунтов защищён от фарма | ✓ VERIFIED | Email-only аккаунты получают 401 на `POST /api/trial` (TG-gate, wiring проверен); клейм атомарен на обоих путях (`updateMany where trialUsed:false`, тесты true-then-false); merge даёт `trialUsed = OR` (двойной клейм после линка невозможен); чужой TG — 409 без мержа. N емейлов = N trials только ценой N distinct TG-идентичностей — как в baseline до фазы |
| 5 | Кнопка «Войти через Telegram» корректно позиционирована на десктопе | ✓ VERIFIED (code-level) | `/login` — одна центрированная `max-w-md` колонка: EmailAuthCard → divider → `TelegramWidgetSlot` (in-flow `flex min-h-24 items-center justify-center`) → InstallPrompt; `LoginButton` reused verbatim; grep по цепочке слота: ноль `absolute`/`fixed` (совпадения только в комментариях). Пиксельная центровка 1440px — в human UAT |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` + `migrations/20261005054841_email_auth` | nullable telegramId, email unique, passwordHash, PasswordReset, LoginAttempt | ✓ VERIFIED | Схема + миграция на месте; целевая БД `setwhite` содержит `password_resets`, `login_attempts` |
| `lib/password.ts` | Argon2id hash/verify, sane params, dummy path | ✓ VERIFIED | argon2id m=19456/t=2/p=1 (OWASP), verify never-throws, `dummyVerify` на precomputed-хэше; unit-тесты зелёные |
| `lib/auth-rate-limit.ts` | DB-backed backoff + lock, server-side | ✓ VERIFIED | per-email+IP, MAX 5 → lock 15мин с удвоением, cap 2ч; 429 + `retryAfterSec`; успех сбрасывает; всё серверное, клиент только рендерит число |
| `lib/auth.ts` / `lib/session.ts` | userId-subject сессии + legacy tid compat | ✓ VERIFIED | `signSession(uid, tid?)`, `verifySession` HS256 allow-list; `requireSession` → `{userId, telegramId\|null}` с DB-резолвом legacy; `requireTelegramSession` — claims-direct (бэккомпат без строки) |
| `lib/accounts.ts` | link/merge + unlink, trialUsed OR | ✓ VERIFIED | Одна транзакция: KeyCache/Order/Ticket + PasswordReset/Notification re-point, dupe-drop по `@@unique([userId,keyId])`, delete-loser-before-inherit (P2002-порядок), `trialUsed OR`, fill-forward профиля |
| `lib/mail.ts` | SMTP + fake-transport seam, 2 шаблона, без PII в логах | ✓ VERIFIED | `sendMail`/`sendResetMail`/`sendWelcomeMail`, `MailError(send_failed)`, логи только domain+outcome, unconfigured → logged no-op |
| `app/api/auth/email/{register,login,logout}/route.ts` | 400/409/401-identical/429 дисциплина | ✓ VERIFIED | Прочитаны целиком; register: P2002-race → 409; login: gate-first 429, unknown/no-hash/wrong → один 401; logout чистит cookie |
| `app/api/auth/email/{link,unlink}/route.ts` | dual-proof link, confirm-gated unlink + re-mint | ✓ VERIFIED | Прочитаны целиком; каждая привилегия re-mint'ит сессию (link +tid, unlink tid-less) |
| `app/api/auth/email/password/{request,confirm,change}/route.ts` | 1h one-time токены, atomic consume, смена с проверкой | ✓ VERIFIED | Прочитаны целиком; confirm без Set-Cookie (явный re-login) |
| `components/*` + `app/{login,reset/*}/page.tsx` + `app/page.tsx` | stacked login, reset-формы, Account-секция | ✓ VERIFIED | 11 новых компонентов на месте; `409 email_taken → auth.invalidCredentials` (UI не раскрывает существование); смена рендерится только при `passwordHash`; `lastMethod`-варнинг до второго тапа; TG-ветка home байт-идентична + Account |
| `lib/i18n/messages/ru.ts` | блок `auth.*`, каждый ключ используется | ✓ VERIFIED | `auth:`-блок на месте; `tests/unit/i18n.test.ts` (no-unused-keys + every-t-key-exists) зелёный в полном прогоне |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| EmailAuthCard/ResetForms/Account | `/api/auth/email/*` | `fetch` POST + typed error codes | ✓ WIRED | `email_taken`→generic copy, `rate_limited`+`retryAfterSec`→лок, `confirmation_required`+`lastMethod`→варнинг (grep-подтверждено) |
| email routes | `users`/`password_resets`/`login_attempts` | Prisma CRUD, не статика | ✓ WIRED | Все роуты читаны: реальные запросы, результат возвращается/маппится, статических returns нет |
| link route | `verifyWidget` + `consumeWidgetHash` + `linkAccounts` | обе пробы обязательны | ✓ WIRED | Сессия ПЕРВОЙ, затем HMAC-проверка и one-time consume (replay невозможен) |
| login/register/telegram routes | `3set_session` httpOnly cookie | общий `buildSessionCookie` | ✓ WIRED | Три роута используют один билдер и одно имя куки |
| merge | KeyCache/Order/Ticket/PasswordReset/Notification | `updateMany loser→survivor` в `$transaction` | ✓ WIRED | Потерянных/осиротевших строк нет (Cascade только после re-point) |
| trial route | `requireTelegramSession` + atomic claim | TG-gate | ✓ WIRED | Email-only → 401; связанные идут атомарным TG-клеймом с OR-флагом |
| bot (`lib/bot.ts`, `lib/bot-payments.ts`) | Phase 6 модули | — | ✓ UNTOUCHED | Импорты бот-пути: keys/orders/tickets/support/prisma — нет `accounts`/`password`/`mail`/`session` (D-94 соблюдён) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| register route | `user.id` → JWT uid | `prisma.user.create` | ✓ | ✓ FLOWING |
| login route | session + `user.telegramId` → tid claim | `prisma.user.findUnique` | ✓ | ✓ FLOWING |
| reset request | `token` → mail + DB row | `randomBytes(32)` (256 бит) + `passwordReset.create` | ✓ | ✓ FLOWING |
| reset confirm | `passwordHash` rotation | `hashPassword` → `user.update` в транзакции с consume | ✓ | ✓ FLOWING |
| AccountSection | `user.{email,telegramId,passwordHash}` | `prisma.user.findUnique` по session-identity | ✓ | ✓ FLOWING |

### Behavioral Spot-Checks (собственный прогон, не SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Email-auth flow (register/login/lock/link/unlink/change/farm) | `vitest run tests/integration/email-auth-flow.test.ts` (против локального `setwhite`, мигрирован) | 17/17 passed | ✓ PASS |
| Unit: password + i18n + uid-сессии | `vitest run tests/unit/password.test.ts tests/unit/i18n.test.ts tests/unit/auth-session-userid.test.ts` | 15/15 passed | ✓ PASS |
| Full suite | `vitest run` | 43 files / 388 tests passed | ✓ PASS (факт SUMMARY подтверждён) |
| DB-backed без env | без `DATABASE_URL` | `denied access` — environment, не код | ? SKIP→RESOLVED (поднял `DATABASE_URL=postgresql://alekseimikhalkin@/setwhite?host=/tmp`, всё зелёное) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 06-01, 06-04 | Регистрация email+пароль без верификации, сразу вход | ✓ SATISFIED | register route + EmailAuthCard + интеграционный вектор |
| AUTH-02 | 06-01, 06-04 | Вход email+пароль, та же httpOnly cookie | ✓ SATISFIED | login route + shared `3set_session`; identical-401 + lock векторы |
| AUTH-03 | 06-02, 06-04 | Link/unlink, объединение аккаунтов | ✓ SATISFIED | accounts service + 3 роута + Account UI; merge/unlink/change векторы |
| AUTH-04 | 06-03, 06-04 | Сброс пароля по email | ✓ SATISFIED | mail + 2 роута + reset pages; 10 unit-векторов |
| AUTH-05 | 06-01, 06-02 | Trial-защита от фарма для email | ✓ SATISFIED | TG-gate + atomic claims + merge OR + 409 taken (см. Truth 4) |
| AUTH-06 | 06-04 | Layout кнопки Telegram на десктопе | ✓ SATISFIED (code) + UAT | Slot-контейнмент; пиксели — human |

Орфанов нет: все 6 AUTH-требований фазы покрыты планами 06-01..06-04.

### Adversarial Checks (из brief'а)

| Check | Result |
|-------|--------|
| No plaintext passwords (Argon2id, sane params) | ✓ PASS — только `passwordHash`; grep по `password\s*[:=]` даёт лишь zod-схемы; хранение только Argon2id |
| Login brute-force gated server-side | ✓ PASS — DB-backed gate первым в login + reused в reset-request; UI только рендерит серверный `retryAfterSec` |
| Reset tokens 1h one-time + atomic consume + hashed-at-rest-or-unguessable | ✓ PASS — TTL 3600s, consume `count===1` в транзакции, токен 256-бит `randomBytes(32)` (unguessable-ветвь parenthetical'а); хранение plaintext при такой энтропии допустимо по brief'у |
| Session subject userId + legacy tid compat, no confusion | ✓ PASS — `requireSession`/`requireTelegramSession`; legacy резолвится серверным DB-lookup, клиентский id не доверяется нигде |
| Link requires proof of BOTH accounts | ✓ PASS — сессия (email-сторона) + валидный одноразовый widget-HMAC (TG-сторона) |
| Unlink of last method warns (D-93) | ✓ PASS — сервис не блокирует (owner-accepted), роут требует `{confirm:true}`, `lastMethod`-хинт на 400, UI варнинг до мутации |
| Merge moves keys/orders/tickets, trialUsed=OR, no dupe/orphan | ✓ PASS — re-point всего user-scoped (вкл. PasswordReset/Notification), dupe-drop, delete-before-inherit, одна транзакция |
| Trial claim atomic, no farm | ✓ PASS — `updateMany … trialUsed:false` на обоих путях, тесты true-then-false |
| Enumeration limited to accepted reset answer | ✓ PASS с оговоркой — login: идентичный 401 (включая TG-only и ghost); register UI: 409 маппится на generic `auth.invalidCredentials`; честный 404 только на reset-request (D-89, принято). Сырой API-409 на register технически различим при прямом зондировании — стандартная практика, UI-оракула нет |
| Every new auth.* i18n key referenced | ✓ PASS — i18n completeness-тесты зелёные |
| Bot untouched (TG-only) | ✓ PASS — импорты бота без Phase-6 модулей |
| No secrets committed | ✓ PASS — скан без находок; SMTP-значения только через env |

Замечания (info, не блокеры):
- `claimTrialByUserId` покрыт тестами, но не вызывается ни одним роутом (email-trial идёт TG-путём после линка). Enforcement целостен без него; функция — tested defense-in-depth примитив.
- Stateless-сессии: токен, выпущенный до unlink/change-password, остаётся валидным до expiry (отзыва нет — свойственно stateless JWT, вне скоупа фазы). Клиентский поток корректен: каждая привилегия re-mint'ит куку.
- `requireSession` для uid-токенов не проверяет существование строки (после merge токен удалённого loser-аккаунта даёт пустые выборки, не чужие данные — cross-account утечки нет).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| components/AccountSection.tsx | 55,58,72 | `return null` | ℹ️ Info | Легитимные early-return для неаутентифицированных/legacy-без-строки, не стабы |
| (все 20 новых/тронутых auth-файлов) | — | TODO/FIXME/XXX/placeholder/console.log | — | Чисто (совпадения только в комментариях и Tailwind `placeholder:`) |

### Human Verification Required

См. frontmatter `human_verification` (3 предзаявленных кавеата из brief'а: 1440px-центровка + no-shift, клик-проходы, живая SMTP-доставка + end-to-end round-trip). Ни один не ставит под сомнение код — все требуют глаз/браузера/прод-кредов.

### Gaps Summary

Блокеров нет. Все 5 success criteria observably true в кодовой базе и подтверждены собственным прогоном (tsc clean, 43/388 green). Статус `human_needed` — только из-за предзаявленных UAT-кавеатов, которые по brief'у «do NOT fail».

---
_Verified: 2026-10-05T16:45:00Z_
_Verifier: the agent (gsd-verifier)_
