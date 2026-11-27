# Phase 21: Subscription & Purchase (7 days) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-27
**Phase:** 21-Subscription & Purchase (7 days)
**Areas discussed:** Цены и лимит устройств, Платёжный конвейер, Промо/trial/гейтинг, Subscription UI и статус

---

## Selection

User selected all four areas. Not re-asked (carried forward): locked prices 115/400/1000/1900/3800 ₽ at 2 devices; devices 2–10; trials non-renewable; RU/RUB, безлимит, live APIs, no simulation; dark prototype theme; `/shop` stub → real shop; active-key gating from phases 19/20.

---

## Цены и лимит устройств

| Option | Selected |
|--------|----------|
| Бэкенд `/pricing`, live-коут через `lib/pricing.ts` | ✓ |
| Локальные константы в Dart | |
| ARTEMIDA напрямую с клиента | |

| Option (devices) | Selected |
|------------------|----------|
| Мобильный поток 2–10 | ✓ |
| UI 2–10, API 9999 | |
| UI до 9999 | |

| Option (rounding) | Selected |
|-------------------|----------|
| Целые RUB, вверх | ✓ |
| Целые RUB, математическое округление | |
| Копейки | |

**Notes:** backend is source of truth for amount; client computes preview only.

---

## Платёжный конвейер

| Option | Selected |
|--------|----------|
| Переиспользовать `orders-service`/outbox + общий Platega webhook | ✓ |
| Отдельный мобильный конвейер | |
| Platega с клиента | |

| Option (checkout UI) | Selected |
|----------------------|----------|
| WebView внутри приложения (`flutter_inappwebview`) | ✓ |
| Внешний браузер + deep-link return | |
| Только webhook, без UI ожидания | |

| Option (status) | Selected |
|-----------------|----------|
| Poll 3 с/5 мин + webhook + continuation pending-заказа | ✓ |
| Только poll (клиент выпускает ключ) | |
| Только webhook | |

**Notes:** webhook is the only key issuer; `payload=orderId`; idempotent on `transaction_id`; resume pending order after app kill.

---

## Промо, trial и гейтинг

| Option | Selected |
|--------|----------|
| Бэкенд `/promo/apply` через существующую promo-логику | ✓ |
| Локально в Dart | |
| PWA `/promo/apply` без обёртки | |

| Option (trial) | Selected |
|----------------|----------|
| Бэкенд-флаг `isTrial` + UI | ✓ |
| Только UI | |

| Option (grace) | Selected |
|----------------|----------|
| Бэкенд authoritative: `statusKind` + `graceUntil` 24 ч | ✓ |
| Клиентский расчёт | |

---

## Subscription UI и статус

| Option | Selected |
|--------|----------|
| Один `/subscription` через `getSubscriptionForUserId` | ✓ |
| Раздельные `/keys`/`/devices` | |
| Оставить stub | |

| Option (confetti) | Selected |
|-------------------|----------|
| Свой overlay (CustomPainter/AnimationController) | ✓ |
| Пакет confetti | |
| Только тост | |

| Option (ring) | Selected |
|---------------|----------|
| CustomPainter | ✓ |
| flutter_svg | |
| Только текст | |

**Notes:** copy link via `Clipboard.setData`; Shop Screen replaces stub; no bottom nav.

---

## the agent's Discretion

- JSON contracts/field names for `/pricing`, `/subscription`, `/promo/apply`, `/payments/*`; freezed models.
- Platega merchant account choice for mobile orders once test credentials exist.
- WebView controller and deep-link return; pending-order persistence (no plaintext secrets).
- Confetti duration/particles, ring thresholds, «expires soon» copy.

## Deferred Ideas

- Device management/settings/push — phase 22.
- Hardening/release/Play/TestFlight/GPL — phase 23/external.
- Platega test credentials — external blocker.
- load bar — deferred from phase 19.
- Static catalog/SNI allowlist/light theme/bottom nav/network simulation — rejected earlier; do not revisit.
- Phase 19/20 deferred UAT — resolve before milestone close.
