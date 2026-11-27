# Phase 21: Subscription & Purchase (7 days) - Context

**Gathered:** 2026-11-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Полный поток покупки: статус подписки, магазин с 5 тарифами, оплата через Platega, выпуск/продление ключа, гейтинг по ключу.

В фазе 21:
- `GET /api/mobile/pricing` — цены через существующий `lib/pricing.ts` (живой коут ARTEMIDA + маркапа), 5 тарифов, устройства 2–10, целые RUB с округлением вверх.
- `GET /api/mobile/subscription` — реальный статус через `getSubscriptionForUserId`: `expiresAt`, `remainingDays`, `deviceLimit`, `link`, `devices[]`, `isTrial`, `graceUntil` (24 ч).
- `POST /api/mobile/payments/create`, `GET /api/mobile/payments/status/{id}`, `POST /api/mobile/promo/apply` — тонкие обёртки над существующими `orders-service`/`platega`/promo-логикой.
- Platega webhook остаётся единственным источником выпуска ключа: `CONFIRMED` → orders/outbox → ARTEMIDA key issue/renew; идемпотентно по `transaction_id`/`payload=orderId`.
- Shop Screen по прототипу: 5 тарифов (115/400/1000/1900/3800 ₽ при 2 устройствах), stepper 2–10, promo LIME15/3SET5, payment chips МИР/VISA/MC/SBP/CRYPTO, живая сумма, SVG-кольцо days/30, copy subscription link.
- WebView внутри приложения (`payment_url`), poll `/payments/status` 3 с до 5 мин, «Ожидаем оплату…», confetti на `CONFIRMED` + toast «Подписка продлена до {date}», continuation последнего pending-заказа после убийства приложения.
- Trial block: бэкенд-флаг `isTrial` + `precheckOwnedKeyByUserId`/`isTrialConflict`, UI скрывает продление/апгрейд и показывает «Триал не продлевается».
- Subscription gating: нет активного ключа → connect заблокирован → переход в магазин, тост «Нужен активный ключ».

Не в фазе 21:
- Управление устройствами (добавление/удаление, лимит в UI) — фаза 22.
- Настройки/профиль, push-уведомления — фаза 22.
- Релиз/hardening, Play Internal/TestFlight, GPL/юридическое — фаза 23 и внешние блокеры.
- load-бар — отложен с фазы 19.
- Реальные платежи без тестовых кредов Platega — внешний блокер; тестовый конвейер и source-уровневые проверки здесь.

</domain>

<decisions>
## Implementation Decisions

### Цены и лимит
- **D-01:** Цен тарифов отдаёт бэкенд через новый `GET /api/mobile/pricing`,computed через существующий `lib/pricing.ts` (ARTEMIDA quote + retail markup). При 2 устройствах значения ровно 115/400/1000/1900/3800 ₽. Клиент не хардкодит цены и не дёргает ARTEMIDA напрямую. — **Reversibility:** costly — публичный контракт; клиент и тесты завязаны на формулу ответа.
- **D-02:** Мобильный поток жёстко 2–10 устройств; бэкенд валидирует `devices ∈ [2,10]` для мобильных роутов, остальной бэкенд сохраняет `TARIFF_MAX_DEVICES=9999`. — **Reversibility:** reversible — границы валидации.
- **D-03:** Итоговая сумма = база × devices/2 × (1 − discount), целые RUB, округление **вверх**. Бэкенд — источник правды для суммы заказа; клиент считает только для предпросмотра. — **Reversibility:** reversible — формула/округление.

### Платёжный конвейер
- **D-04:** Мобильные платежные роуты — тонкие обёртки над существующим `orders-service`: `createOrder`, `precheckOwnedKeyByUserId`, `loadOrderForUserId`; `payload = orderId`, идемпотентность по `transaction_id`. Webhook Platega остаётся общий (`app/api/platega/callback/route.ts`) с header-verification, server-side re-query, amount check, outbox. — **Reversibility:** costly — заказной контракт и webhook; откат = отдельный мобильный конвейер.
- **D-05:** Пользователь подтверждает оплату в WebView внутри приложения (`flutter_inappwebview`), открывая `payment_url` из `/payments/create`. Внешний браузер/deep-link return — не основной путь. — **Reversibility:** costly — новая зависимость + навигация + lifecycle.
- **D-06:** Клиент опрашивает `GET /api/mobile/payments/status/{id}` каждые 3 с, макс 5 мин; webhook — единственный источник выпуска ключа. Если приложение убито во время оплаты, при следующем запуске находится последний `PENDING` заказ и опрос продолжается. — **Reversibility:** reversible — можно убрать continuation.
- **D-07:** `CONFIRMED` → outbox → ARTEMIDA issue/renew → обновление `/subscription`; `CANCELED`/`CHARGEBACKED`/`DISPUTED` не выпускают ключ; статусы и суммы сверяются сервером, клиент не инициирует выпуск. — **Reversibility:** reversible.

### Промо, trial, гейтинг
- **D-08:** Промокоды LIME15 (−15%) и 3SET5 (−5%) проверяются бэкендом через `/api/mobile/promo/apply` (переиспользование существующей promo-логики). Клиент применяет только полученный процент, не хранит коды как источник правды. — **Reversibility:** reversible — можно перевести проверку в общий заказной конвейер.
- **D-09:** Trial-ключи: `/subscription` отдаёт `isTrial`; бэкенд дополнительно проверяет `precheckOwnedKeyByUserId`/`isTrialConflict`; UI скрывает продление/апгрейд и показывает «Триал не продлевается». — **Reversibility:** reversible.
- **D-10:** Grace period 24 ч authoritative на бэкенде: `/subscription` отдаёт `statusKind` + `graceUntil`; подключение **разрешено** в grace (пользователь подтвердил 2026-11-27 после research). Реализуется один общий чистый server-side предикат (`statusKind` + `graceUntil`) в новом хелпере; он используется и в `/subscription`, и импортируется в `isActiveKey` фаз 19/20 (`/servers`, `/config`) — изменение уже выполнение гейтов входит в фазу 21; boundary-тесты на `expiresAt ± 24h ± 1ms`. UI показывает «expires soon»-баннер. Клиент не вычисляет 24 ч сам. — **Reversibility:** reversible — можно вернуть гейты к strict expired.
- **D-11:** Нет активного ключа (или grace) → connect заблокирован, тост «Нужен активный ключ», переход в магазин. Наследует D-21 фазы 19 и D-03 фазы 20 (`/config` требует ключ). — **Reversibility:** reversible.

### Subscription UI
- **D-12:** Статус подписки читается из одного `GET /api/mobile/subscription` (реальные ключи/устройства/лимит/ссылка/isTrial/graceUntil через `getSubscriptionForUserId`). Раздельные `/keys`/`/devices` — фаза 22. — **Reversibility:** reversible — можно разделить эндпоинты.
- **D-13:** Кольцо срока подписки days/30 рисуется Flutter `CustomPainter`, цвет по порогам; без `flutter_svg` и без load-бара. — **Reversibility:** reversible.
- **D-14:** Confetti при `CONFIRMED` — собственный overlay на `AnimationController`/`CustomPainter`, без новой зависимости и без симуляции оплаты; затем overlay с деталями ключа и тост «Подписка продлена до {date}». — **Reversibility:** reversible.
- **D-15:** Копирование subscription-ссылки — через `Clipboard.setData` (`flutter/services`), тост «Ссылка скопирована»; без дополнительной зависимости. — **Reversibility:** reversible.
- **D-16:** Shop Screen — тёмная тема прототипа, русская копия, 5 тарифов, payment chips, stepper, promo, живая сумма; заменяет заглушку `features/shop/shop_screen.dart` без нижней навигации. — **Reversibility:** costly — переделка экрана+навигации; откат к заглушке.

### the agent's Discretion
- Точный JSON-контракт `/pricing`, `/subscription`, `/promo/apply`, `/payments/*`; имена полей и freezed-модели Dart.
- Выбор merchant-аккаунта Platega для мобильных заказов (site vs bot) при появлении тестовых кредов; контракт остаётся совместимым с header-verification.
- Точный WebView-контроллер и deep-link return handling; способ сохранения pending-order id.
- Длительность/частицы confetti, пороги цветов кольца, текста «expires soon».
- Как именно хранить последний pending заказ (Drift vs secure storage) при условии, что secrets не сохраняются в открытом виде.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §Phase 21 — goal + tasks 21.1–21.13 + deliverables.
- `.planning/REQUIREMENTS.md` §REQ-SUB (01..06), §REQ-SHOP (01..08), §REQ-BACKEND (BE-03/04/05/07/08).
- `.planning/PROJECT.md` — v2.0, RU/RUB, безлимит, цены, trial-ограничения, Platega creds блокер.
- `.planning/STATE.md` — фазы 19/20 human_needed, UAT отложен; фаза 21 Pending; Platega test credentials блокер.

### Prior locked decisions
- `.planning/phases/19-server-pools-auto-ping-7-days/19-CONTEXT.md` — D-21 no_active_key gate, D-20 no simulation; `/servers.key` для key pill.
- `.planning/phases/20-vpn-core-connect-fsm-10-days/20-CONTEXT.md` — D-01 `/config` gating, D-03 активный ключ при каждом конфиге; connect заблокирован без ключа.
- `.planning/phases/19-.../19-01-SUMMARY.md`, `.planning/phases/20-.../20-01-SUMMARY.md` — как строить тонкие бэкенд-роуты и тесты.

### Seed & prototype
- `.planning/seeds/SEED-001-mobile-client-karing.md` — тарифы, device selector 2–10, promo, payment methods, ring, grace, trial.
- `.planning/seeds/prototype-mobile-client.html` — Shop screen markup/terms/price summary/pay chips/confetti/ring/toasts; NOTE симуляция (`sleep`, confetti demo, fake prices) не переносится.

### Backend (reuse, do not duplicate)
- `lib/orders-service.ts` — `createOrder`, `CreateOrderInput`, `OrderKind`, `precheckOwnedKeyByUserId`, `loadOrderForUserId`, `applyConfirmedPayment`, `enqueueFulfillOrder`, outbox.
- `app/api/platega/callback/route.ts` — header auth, zod, re-query, amount check, idempotency, ack 200; single source of key issuance.
- `lib/platega.ts`, `lib/payments.ts`, `lib/orders-service.ts`, `lib/pricing.ts`, `lib/tariff-grid.ts`, `lib/promo*.ts`, `lib/keys-service.ts` (`getSubscriptionForUserId`, `getKeyForUserId`, `isTrialConflict`), `lib/mobile-auth.ts`.
- `app/api/mobile/subscription/route.ts` — current `keys: []` stub to fill.
- `app/api/mobile/{servers,config}/*` — route pattern (verifyAccessToken, force-dynamic, zod, logger).

### Mobile app
- `mobile/lib/features/shop/shop_screen.dart` — заглушка; заменить на реальный Shop Screen.
- `mobile/lib/features/subscription/providers.dart` — `pricingPlansProvider` locked цены, `selectedPlanProvider`, `paymentProcessingProvider`, `paymentUrlProvider`, `userSubscriptionProvider` (stub), `createPaymentProvider` (mock URL) — всё заменить на живые API.
- `mobile/lib/core/api/endpoints.dart` — `Endpoints.subscription/payments/keys/devices` уже есть; добавить `pricing`, `promoApply`.
- `mobile/lib/features/servers/*` — key pill/no-key banner/gating; `mobile/lib/app/router.dart` — `/shop` route уже есть.
- `mobile/lib/app/theme.dart`, `mobile/AGENTS.md`, `AGENTS.md`.

### Research docs
- `.planning/research/{ARCHITECTURE,FEATURES,PITFALLS,STACK,SUMMARY}.md` — Platega webhook/idempotency, ARTEMIDA errors, rate limits, GPL, entitlements; server-to-server only.

### No SPEC / no UI-SPEC
- No `21-SPEC.md`, no `21-UI-SPEC.md`; прототип и CONTEXT задают визуальный контракт (аналог `--skip-ui`).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orders-service.ts` + `app/api/platega/callback/route.ts` + outbox — готовый,idempotentный платёжный конвейер; мобильные роуты должны быть обёртками.
- `lib/pricing.ts`/`tariff-grid.ts` — живое ценообразование, калиброванное под locked prices при 2 устройствах; `getQuote`/`getAllMarkupsPerDevice`.
- `lib/platega.ts` `PlategaClient`, `createTransaction`, `getTransaction`, `detectPlategaMerchant` — уже есть и протестирован.
- `keys-service.ts` `getSubscriptionForUserId`, `getKeyForUserId`, `deriveStatusKind`, `daysUntilExpiry`, `isTrialConflict` — готовый источник статуса подписки.
- Riverpod `FutureProvider.autoDispose`, `StateProvider`, freezed + `build_runner`; Dio + `AuthInterceptor`; тёмная `AppTheme.dark`.
- `Endpoints.subscription/payments/keys/devices`; `/shop` route; `main_header` key pill; no-key banner.

### Established Patterns
- Backend = тонкая обёртка; secrets env-only; `verifyAccessToken`; zod at boundary; `force-dynamic`; pino без секретов; provider errors не 5xx.
- Webhook: verify headers → parse → resolve order → re-query → amount check → atomic claim → outbox → 200 fast.
- Flutter: `AsyncValue.when`, `ref.invalidate`, `ConsumerWidget`, strict lints, no simulation.
- GSD tracer-first; `<read_first>`, `<acceptance_criteria>`, `<fails_when>`, `<threat_model>`; verify `flutter analyze`/`flutter test`/`npx tsc`/`npx prisma validate`.

### Integration Points
- `app/api/mobile/pricing/route.ts` (NEW), `app/api/mobile/promo/apply/route.ts` (NEW), `app/api/mobile/payments/create/route.ts` (NEW), `app/api/mobile/payments/status/[id]/route.ts` (NEW).
- `app/api/mobile/subscription/route.ts` — fill from `getSubscriptionForUserId`.
- Platega callback — reuse; mobile orders carry `payload=orderId` and `source=mobile`.
- `mobile/lib/features/shop/` — real Shop Screen + widgets (term cards, stepper, promo, chips, ring, confetti).
- `mobile/lib/features/subscription/providers.dart` + models — freezed subscription/payment/pricing/promo models.
- `mobile/lib/core/payment/` (NEW) — WebView controller, pending-order continuation, poll service.
- `mobile/pubspec.yaml` — add `flutter_inappwebview`; keep drift/ffi/ffigen/auth stack.
- `mobile/lib/app/router.dart` — `/shop` real destination; no bottom nav.
</code_context>

<specifics>
## Specific Ideas

- Locked prices: 7д 115, 1м 400 («Хит» badge), 3м 1000, 6м 1900, 12м 3800 ₽ at 2 devices.
- Formula: `base × devices/2 × (1 − discount)`, whole RUB round up; per-day-per-device in summary.
- Promo: LIME15 −15%, 3SET5 −5%; invalid → shake + error; persists until changed.
- Payment chips: МИР, VISA, MC, SBP, CRYPTO; selection persists.
- Toasts: «Нужен активный ключ», «Триал не продлевается», «Ссылка скопирована», «Лимит устройств достигнут» (phase 22), «Ожидаем оплату…», «Подписка продлена до {date}».
- Confetti: own overlay; ring days/30 green/yellow/red thresholds.
- Platega webhook never provisions directly — outbox does; app only reflects status.
- Min password 8 (phase 18); prototype's «минимум 6» ignored.

## Deferred Ideas

- Device management/add/remove/limit UI — Phase 22 (`REQ-DEV-01..05`, `REQ-BE-06`).
- Settings/profile screen, push notifications — Phase 22.
- Hardening/release, Play Internal/TestFlight, GPL legal — Phase 23/external.
- Real Platega test credentials — external blocker; test-mode/source verification only here.
- load-бар — deferred from phase 19 (REQ-POOL-04).
- Static server catalog, SNI allowlist, light theme, bottom nav, manual network-chip simulation — rejected in phases 19/20; do not revisit.
- Phase 19/20 deferred UAT — must be resolved before milestone close.
</specifics>

<deferred>
## Deferred Ideas

See `<specifics>` Deferred Ideas above. No scope creep captured; no folded/reviewed todos (`todo.match-phase` empty). No UI-SPEC by explicit choice consistent with prior phases.
</deferred>

---
*Phase: 21-Subscription & Purchase (7 days)*
*Context gathered: 2026-11-27*
