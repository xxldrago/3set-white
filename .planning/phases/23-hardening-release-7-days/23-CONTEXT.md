# Phase 23: Hardening & Release - Context

**Gathered:** 2026-11-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-hardening и подготовка релиза мобильного клиента: маппинг ошибок ARTEMIDA, captive-portal detection, IPv4-only DNS без утечек, battery optimization, privacy/GPL, CI/CD для Android и iOS, crash reporting, метаданные магазинов и version bump. Фаза не меняет платёжный конвейер, kill switch (всегда включён), общий grace-предикат и уже зафиксированные навигационные решения.

</domain>

<decisions>
## Implementation Decisions

### VPN/DNS hardening (зафиксировано пользователем 2026-11-29)

- **D-01:** DNS в конфиге мобильного клиента (`lib/mobile-config.ts`) переводится на **IPv4-only 1.1.1.1 / 1.0.0.1**; IPv6 DNS (`fdfe:dcba:9876::2`) убирается. Бэкенд остаётся единственным источником конфига (D-01/D-08 фазы 20), клиент не собирает DNS сам. — **Reversibility:** costly — меняется опубликованный контракт конфига и поведение реального туннеля; откат требует повторной проверки DNS-утечек на устройстве.
- **D-02:** Captive portal обнаруживается **реальным HTTP-пробом через туннель** (generate_204); при `302` на non-HTTPS → FSM `disconnect` + тост «Авторизуйтесь в Wi-Fi». Никакой симуляции портала и фейкового `302`. — **Reversibility:** costly — меняется поведение FSM/туннеля; откат требует нативной и FSM-верификации.
- **D-03:** При обнаружении портала: `disconnect` → `idle`, тост «Авторизуйтесь в Wi-Fi» и кнопка «Повторить» → обычный `connect`. **Авто-реконнект не делается** (иначе гонка с D-15 фазы 20 и циклы). Kill switch остаётся всегда включённым (D-09 фазы 20). — **Reversibility:** costly — публичное поведение безопасности и FSM.
- **D-04:** Граница проверки: автоматизируются только конфиг-юниттесты (IPv4-only, отсутствие IPv6 DNS) и FSM-юниттесты детекта/notify; реальный `dnsleaktest.com` и captive portal — **manual-only UAT** на устройстве с живым туннелем. — **Reversibility:** reversible — тестовая стратегия, без миграции.

### the agent's Discretion

- Порядок и формулировки остальных задач фазы 23 определяет research/планировщик с учётом внешних блокеров; пользователь обсудил только VPN/DNS.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` §Phase 23 — задачи 23.1–23.12 и deliverables
- `.planning/REQUIREMENTS.md` §REQ-CONN-06, §NFR-04, §NFR-07, §NFR-08, §Risks (GPL-3.0 legal review) — единственные релевантные требования; отдельного раздела REQ-REL нет, поэтому планировщик использует ID задач `23.1`…`23.12` как requirement IDs.
- `.planning/PROJECT.md` §Context, §Constraints — Russian/RUB, single server, secrets-only-env, ARTEMIDA/Platega

### Locked decisions from prior phases
- `.planning/phases/20-vpn-core-connect-fsm-10-days/20-CONTEXT.md` D-01, D-05, D-08, D-09, D-15 — серверный конфиг, C-shared shim, DNS, kill switch always-on, reconnect при смене сети
- `.planning/phases/19-server-pools-auto-ping-7-days/19-CONTEXT.md` D-06/D-07 — libbox urltest vs Socket fallback
- `.planning/phases/21-subscription-purchase-7-days/21-CONTEXT.md` D-10/D-16 — grace-гейты и тёмная тема без нижней навигации
- `.planning/phases/22-devices-settings-polish-5-days/22-CONTEXT.md` D-08 — FCM/Firebase отсутствует (влияет на crash reporting choice)

### Code and design sources
- `lib/mobile-config.ts` — текущая DNS-секция (`dns_mode: "hijack"`, `172.18.0.2`, `fdfe:dcba:9876::2`)
- `app/api/mobile/config/route.ts` — единственный источник полного конфига
- `mobile/lib/core/vpn/connection_notifier.dart` — FSM и network-change reconnect
- `.planning/seeds/prototype-mobile-client.html` — визуальный контракт (без нижней навигации)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/mobile-config.ts` и `app/api/mobile/config/route.ts` — серверная сборка конфига; менять DNS только здесь.
- `mobile/lib/core/vpn/connection_notifier.dart` — FSM с `disconnect()` и action-toasts; новая captive-portal ветка должна пользоваться существующими переходами.
- `mobile/lib/core/ping/` — уже есть реальный HTTP-проб через outbound; паттерн для generate_204/captive probe.
- `mobile/lib/core/errors/` (если есть) и stable-code envelope из фаз 19–22 — основа для маппинга ARTEMIDA 401/402/409/429/502/503 и `Retry-After`.
- `mobile/lib/core/settings/` — Drift v2 и паттерн persisted settings.

### Established Patterns
- Никакой симуляции: реальный проб, реальный конфиг, реальные метрики; `load` не показывать.
- Kill switch всегда включён; отключение без туннеля не блокирует трафик.
- Секреты/токены/ссылки никогда не логируются и не попадают в UI.
- new pub packages требуют `checkpoint:human-verify` до установки.

### Integration Points
- `lib/mobile-config.ts` → `/api/mobile/config` → libbox TUN; DNS меняется только на бэкенде.
- `connection_notifier.dart` → captive probe → disconnect → toast/«Повторить»; без изменений нативного VPN-кода без крайней нужды.
- CI/CD и store-артефакты — вне репозиторийского кода, требуют внешнихcredentials.

</code_context>

<specifics>
## Specific Ideas

- Пользователь обсудил только VPN/DNS. Остальные задачи фазы подлежат research и могут быть зафиксированы как внешние блокеры:
  1. Release gating: Play Console / App Store / TestFlight, privacy URL `3set.online/privacy`, GPL legal sign-off, git push/тег — без credentials/одобрений реальные сабмиты невозможны.
  2. ARTEMIDA error map 401/402/409/429/502/503 + `Retry-After` — где писать unit-тесты и как показывать ошибки в UI без утечки provider text.
  3. Crash reporting: Sentry vs Crashlytics — нет Firebase-проекта и DSN; новый пакет требует human-verify.
  4. Battery optimization: Android unrestricted / iOS background modes — нативные разрешения, device-only UAT.
  5. CI/CD Android/iOS — GitHub Actions, fastlane, store credentials; iOS заблокирован entitlement (D-07 фазы 20).
  6. App Store metadata / privacy manifest / data safety — legal/сторовые артефакты.
  7. Version bump: `pubspec.yaml` + `package.json` sync, tag `mobile/v2.0.0`; push в origin не делался (ветка ahead).
- Ничего из перечисленного не должно имитироваться: при отсутствии внешних данных фиксируем blocker/deferred/source-only.

</specifics>

<deferred>
## Deferred Ideas

- Авто-реконнект после captive portal — отклонён пользователем (D-03) из-за гонки с D-15 фазы 20.
- Фейковый DNS-leak/CI probe через внешний сайт — отклонён (D-04).
- Toggle kill switch — отклонён ранее (D-01 фазы 22), не пересматривается.
- Невыбранные для обсуждения зоны фазы 23 не являются новыми фичами; они остаются задачами фазы, но их реализация зависит от внешних блокеров и будет уточнена research.

</deferred>

---

*Phase: 23-Hardening & Release*
*Context gathered: 2026-11-29*
