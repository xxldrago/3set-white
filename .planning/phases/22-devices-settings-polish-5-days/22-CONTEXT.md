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

### Устройства и уведомления (зафиксировано пользователем 2026-11-28 после research)

- **D-05:** «Добавить это устройство» честно интерпретируется как переход/копирование subscription-ссылки (уже работает по D-15 фазы 21), а не бесплатный POST. Увеличение лимита устройств — только через существующий платный `upgradeKey(addDevices)` → `/payments/create {kind:'upgrade'}` → webhook → outbox → worker. Нового эмитента ключа и обхода оплаты нет. — **Reversibility:** costly — откат к буквальному POST добавил бы второй, несуществующий в ARTEMIDA контракт и потребовал бы симуляции.
- **D-06:** Undo «Вернуть» на 5 с — это **отложенный DELETE**, который можно отменить до отправки в ARTEMIDA. После реального удаления повторная вставка строки запрещена: провайдер не поддерживает restore, фейковое восстановление недопустимо. — **Reversibility:** reversible — локальный таймер и состояние UI, но откат к «restore» потребовал бы симуляции.
- **D-07:** Сеть-чип остаётся read-only (D-11 фазы 19 не пересматривается): показываем реальный тип соединения из `connectivity_plus`; смена сети уже инвалидирует Drift `ping_cache` через `networkPingInvalidationProvider`. Никакого toggle WiFi/LTE и тоста «сеть изменена» по нажатию. — **Reversibility:** reversible — локальный виджет, но фейковый toggle запрещён.
- **D-08:** FCM token registration (REQ-NOTIF-02) **отложен** из-за отсутствия Firebase-проекта и credentials — внешний блокер. В фазе 22 реализуются только локальные напоминания T-7/T-3/T-1 через `flutter_local_notifications` с human-verify гейтом на установку пакета. — **Reversibility:** reversible — дескоп требования и отложенный бэкенд-роут.
- **D-09:** Установка `flutter_local_notifications` и прямого `timezone` — за `checkpoint:human-verify` (pub.dev legitimacy seam не поддерживается GSD); точные версии из research. При отказе — записываем заблокированную зависимость без тихой замены пакета. — **Reversibility:** reversible — замена пакета или отказ от push.

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

- Пользователь выбрал только одну серую зону для обсуждения — kill switch. Остальные неоднозначности были исследованы `22-RESEARCH.md` и зафиксированы решениями D-05..D-09:
  1. ARTEMIDA не имеет free-add/restore; доступны `getDevices(keyId)`, `deleteDevice(token)`, `clearDevices`, а увеличение ёмкости — платный `upgradeKey(addDevices)`. См. D-05/D-06.
  2. Undo — отложенный DELETE с отменой до отправки провайдеру; повторная вставка после реального удаления запрещена. См. D-06.
  3. Сеть-чип остаётся read-only; кеш пинга уже инвалидируется реальной сменой сети. См. D-07.
  4. FCM заблокирован внешними credentials; local notifications — с human-verify на пакет. См. D-08/D-09.
  5. Профиль берёт имя/аватар из реальных БД-полей (`firstName`, `username`) и `referralCode` (уже содержит префикс `3SET-`, не дублировать). Email вымышлять нельзя.
  6. Reset Demo — только локальные secure storage + Drift, без серверной сессии/ключа.
  7. Auto-connect — новая Drift-настройка + launch listener поверх существующего FSM, без изменений D-15 фазы 20.
  8. Accessibility: `main.dart:55` ограничивает dynamic type 1.3, `AppTheme.dim` не проходит AA на карточках (4.24:1 / 3.92:1) — требует реального исправления, а не косметического отчёта.

</specifics>

<deferred>
## Deferred Ideas

- Пользовательский toggle kill switch — отклонён пользователем 2026-11-28 как конфликтующий с D-09 фазы 20; не переносить в более поздние фазы без нового решения.
- FCM token registration (REQ-NOTIF-02) — отложен до появления Firebase-проекта и credentials (D-08); не изобретать фейковый backend-роут.
- Буквальные «бесплатный POST add» и «undo восстанавливает устройство» — отклонены как конфликтующие с контрактом ARTEMIDA и запретом симуляции (D-05/D-06).
- Фейковый WiFi/LTE toggle — отклонён по D-11 фазы 19 (D-07).
- Отложенное из фаз 19/20/21 UAT остаётся внешним долгом и не входит в фазу 22.

</deferred>

---

*Phase: 22-Devices, Settings & Polish*
*Context gathered: 2026-11-28*
