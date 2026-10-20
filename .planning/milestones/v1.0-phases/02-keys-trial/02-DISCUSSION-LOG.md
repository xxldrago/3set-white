# Phase 2: Keys & Trial - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-30
**Phase:** 2-Keys & Trial
**Areas discussed:** ARTEMIDA client, Trial anti-abuse, Tariff UX, Keys freshness

---

## ARTEMIDA client

| Option | Description | Selected |
|--------|-------------|----------|
| Read+Trial | Только нужное Phase 2 | |
| Full client | Сразу все методы включая create/renew/upgrade | ✓ |
| You decide | На усмотрение планировщика | |

**User's choice:** Full client; p-retry + Idempotency-Key; typed ArtemidaError; ключ и base URL в lib/env.ts
**Notes:** Единый контракт клиента сейчас, чтобы не ретрофитить вызывающие места позже.

---

## Trial anti-abuse

| Option | Description | Selected |
|--------|-------------|----------|
| User flag | Флаг trialUsed + trialKeyId на users | ✓ |
| Trials table | Отдельная таблица trials с историей | |
| You decide | На усмотрение планировщика | |

**User's choice:** Флаг на users; атомарный UPDATE ... WHERE trial_used=false; rollback при ошибке ARTEMIDA; чистый RU-ответ при повторе
**Notes:** Отдельная таблица отклонена — достаточно одной записи на telegram-id. Rollback-при-ошибке + Idempotency-Key закрывают риск двойного ключа.

---

## Tariff UX

| Option | Description | Selected |
|--------|-------------|----------|
| Bot + PWA | И бот (inline keyboard), и PWA | ✓ |
| Только PWA | Бот позже | |
| Только бот | PWA позже | |

**User's choice:** Bot + PWA; серверный BFF GET /api/pricing; live update при смене устройств; цена как у ARTEMIDA
**Notes:** Клиент никогда не носит API-ключ.

---

## Keys freshness

| Option | Description | Selected |
|--------|-------------|----------|
| Cache-first | keys_cache мгновенно, фоновое обновление | ✓ |
| Always live | Живой запрос каждый раз | |
| You decide | На усмотрение планировщика | |

**User's choice:** Cache-first; sub-link + QR; трафик display-only; подтверждение на необратимые действия устройств
**Notes:** —

---

## the agent's Discretion

None — пользователь закрыл все развилки явным выбором.

## Deferred Ideas

None.
