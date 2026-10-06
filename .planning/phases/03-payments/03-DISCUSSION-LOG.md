# Phase 3: Payments - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-02
**Phase:** 3-Payments
**Areas discussed:** Platega contract, Money pipeline, Renew & upgrade, Payment history

---

## Platega contract

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect flow | Хостед-страница Platega, возврат в кабинет/бот | ✓ |
| QR in-place | QR СБП на нашей странице | |
| You decide | На усмотрение планировщика | |

**User's choice:** Redirect flow; verify + server re-query перед выдачей; сверка суммы и валюты; 2 режима (тест/прод)
**Notes:** Callback не источник истины — обязателен re-query и amount/currency match.

---

## Money pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Ingest-fast + outbox | 200 сразу, выдача из outbox | ✓ |
| Inline fulfillment | Выдача прямо в callback | |
| Orders + states / Payments only | | Orders + states ✓ |

**User's choice:** Ingest-fast + outbox; orders state machine (pending→paid→provisioning→provisioned/failed) с UNIQUE tx-id; hourly reconcile; retry+alert на ARTEMIDA-сбой
**Notes:** Cash-path защита от double provisioning и потерянных callback'ов.

---

## Renew & upgrade

| Option | Description | Selected |
|--------|-------------|----------|
| One pipeline | new/renew/upgrade через общий flow | ✓ |
| Separate flow | Отдельный платёжный flow | |

**User's choice:** One pipeline с `{kind,keyId?,params}`; цена через `GET /pricing`; trial заблокирован в UI; standard semantics (renew +дни, upgrade prorated)
**Notes:** —

---

## Payment history

| Option | Description | Selected |
|--------|-------------|----------|
| From our DB | orders/payments, без live-запроса | ✓ |
| Live from Platega | Запрос к Platega каждый раз | |

**User's choice:** Из нашей БД; в боте и кабинете; rich rows (сумма/статус/дата/что куплено)
**Notes:** —

---

## the agent's Discretion

None — пользователь закрыл все развилки явным выбором.

## Deferred Ideas

None.
