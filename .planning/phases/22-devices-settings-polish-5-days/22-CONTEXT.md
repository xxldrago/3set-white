# Phase 22: Devices, Settings & Polish - Context

**Gathered:** 2026-11-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Управление устройствами, профиль и настройки, push-напоминания об истечении подписки и финальная полировка тёмного UI мобильного клиента. Фаза не меняет VPN-ядро, FSM, туннель, платёжный конвейер и нативную сетевую защиту.

</domain>

<decisions>
## Implementation Decisions

### Kill switch (зафиксировано пользователем 2026-11-28)

- **D-01:** Kill switch остаётся **всегда включённым**, без пользовательского toggle. Решение фазы 20 D-09 и безусловное требование REQ-CONN-06 «disconnect → no traffic leaks» не пересматриваются. ROADMAP 22.5 / старый REQ-SET-01 с toggle не реализуются. — **Reversibility:** costly — откат меняет публичное поведение безопасности и нативные правила: Android `VpnService` `allowBypass=false` и iOS `NEOnDemandRuleConnect`; нужны новые тесты на утечки трафика и пересмотр REQ-CONN-06.
- **D-02:** В профиле показывается read-only строка «Kill switch: включён» + пояснение мелким текстом «Трафик вне VPN заблокирован». Не кликабельно, без выключателя и без изменения тоста фазы 20 D-12. — **Reversibility:** reversible — локальный виджет и копия.
- **D-03:** `REQ-SET-01` в `.planning/REQUIREMENTS.md` переписывается из «Toggle» в «Kill Switch Status (read-only)» с явной ссылкой на D-09 фазы 20 как причину. Планировщик не должен строить toggle. — **Reversibility:** reversible — формулировка требования, без миграции.
- **D-04:** Фаза 22 **не меняет нативный VPN-код**: `allowBypass=false`, `NEOnDemandRuleConnect`, Foreground Service и Entitlements остаются как в фазе 20. Никаких скрытых флагов и выключателей в нативном слое. — **Reversibility:** costly — нативный контракт и проверка утечек трафика; откат требует изменения Android/iOS-кода и повторной верификации.

### the agent's Discretion

- Формат профиля/настроек (shutter vs отдельный экран), конкретные виджеты и порядок секций — на усмотрение планировщика, если сохраняются тёмная тема прототипа и отсутствие нижней навигации (D-15/D-16 фазы 19, D-16 фазы 21).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` §Phase 22 — задачи 22.1–22.12 и deliverables
- `.planning/REQUIREMENTS.md` §REQ-DEV, §REQ-SETTINGS, §REQ-NOTIF, §REQ-BE-06 — требования фазы
- `.planning/PROJECT.md` §Context, §Constraints — RU/RUB, ARTEMIDA V1, secrets-only-env, single server

### Locked decisions from prior phases
- `.planning/phases/20-vpn-core-connect-fsm-10-days/20-CONTEXT.md` D-09, D-12 — kill switch always-on и его toast
- `.planning/phases/19-server-pools-auto-ping-7-days/19-CONTEXT.md` D-11, D-15, D-16 — сеть-чип read-only, прототип без нижней навигации, тёмная тема
- `.planning/phases/21-subscription-purchase-7-days/21-CONTEXT.md` D-12, D-15, D-16 — `/devices` и профиль отложены в фазу 22, копирование ссылки, Shop без нижней навигации

### Design source
- `.planning/seeds/prototype-mobile-client.html` — прототип профиля/настроек/устройств
- `.planning/seeds/SEED-001-mobile-client-karing.md` — описание прототипа

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/mobile/subscription/route.ts` — уже отдаёт `deviceLimit`, `devices`, `link`, `statusKind`, `graceUntil`; новый `/devices` должен переиспользовать ту же модель владения, а не второй источник правды.
- `lib/artemida.ts` — `getDevices(id)`, `deleteDevice(id, token)`, `clearDevices(id)`, `upgradeKey(id, {addDevices})` уже описаны в `ArtemidaClient`; отsubscribe-логика и error-маппинг готовы.
- `mobile/lib/features/subscription/providers.dart` и модели `subscription.dart` — основа live-провайдеров и freezed-моделей для устройств/профиля.
- `mobile/lib/features/servers/widgets/main_header.dart` — аватар/кнопка профиля уже ведут в заглушку; точка входа в новый Profile Sheet.
- `mobile/lib/core/storage/secure_storage.dart`, `mobile/lib/core/db/` — паттерны Drift/secure storage для настроек и Reset Demo.
- `mobile/lib/features/shop/shop_screen.dart` — готовый helper `copySubscriptionLink` + toast «Ссылка скопирована» для REQ-SET-03.

### Established Patterns
- Все мобильные роуты: `verifyAccessToken` → zod → один сервис → envelope `{ok:false,error}`; 200 для provider-ошибок, stable outcome codes, без provider-текста в логах.
- Клиент не вызывает ARTEMIDA и не хардкодит лимиты/цены; бэкенд — источник правды.
- Нельзя: `load`, симуляция, `Math.random`-fake, lower navigation, секреты в логах/UI.
- Generated freezed/`.g.dart` файлы пересобираются через `dart run build_runner build --delete-conflicting-outputs`.

### Integration Points
- `mobile/lib/app/router.dart` — Profile Sheet / settings как новая ветка навигации без `NavigationBar`; WebView-роут и payment flow не трогать.
- `mobile/lib/main.dart` — место для always-on слушателей (по образцу `paymentResumeListenerProvider`).
- `mobile/lib/core/vpn/` — откуда читать реальный статус соединения, но без изменений FSM/нативных правил.

</code_context>

<specifics>
## Specific Ideas

- Пользователь выбрал только одну серую зону для обсуждения — kill switch. Остальные неоднозначности фазы **должны быть исследованы research-агентом и вынесены как open questions**, а не решены молча:
  1. Реализация `/api/mobile/devices`: какие операции реально доступны через ARTEMIDA (`getDevices`/`deleteDevice(token)`) и что такое «Добавить это устройство» (REQ-DEV-03) — уже существующая привязка или платный `upgradeKey(addDevices)`.
  2. Undo «Вернуть» на 5 с (REQ-DEV-02): как восстановить устройство через провайдера и что делать, если повторная привязка недоступна.
  3. Сеть-чип (REQ-SET-05) конфликтует с D-11 фазы 19 (read-only, без симуляции): что именно считается «сменой сети» и как инвалидировать кеш пинга без фейкового toggle.
  4. Push: local notifications (`flutter_local_notifications`) и FCM token (REQ-NOTIF-01/02) — появление FCM требует внешних Firebase-credentials и бэкенд-регистрации; проверить доступность до commitments.
  5. Источник данных профиля (имя/аватар) — Telegram Login Widget/JWT claims против вымышленного email; проект явно без email/password.
  6. Reset Demo (REQ-SET-04) — границы очистки (secure storage + Drift, но не server-side сессия/ключ).

</specifics>

<deferred>
## Deferred Ideas

- Пользовательский toggle kill switch — отклонён пользователем 2026-11-28 как конфликтующий с D-09 фазы 20; не переносить в более поздние фазы без нового решения.
- Идеи вне обсуждённой зоны (устройства/undo, сеть-чип, push, источник профиля, Reset Demo) не были выбраны для обсуждения; они не являются новыми фичами, а остаются открытыми вопросами в рамках текущей фазы и подлежат research.
- Отложенное из фаз 19/20 UAT остаётся внешним долгом и не входит в фазу 22.

</deferred>

---

*Phase: 22-Devices, Settings & Polish*
*Context gathered: 2026-11-28*
