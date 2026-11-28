# Phase 22: Devices, Settings & Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-28
**Phase:** 22-devices-settings-polish-5-days
**Areas discussed:** Kill switch toggle

---

## Kill switch toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Оставить always-on | D-09 фазы 20 не пересматриваем; в профиле показываем статус «Kill switch включён», REQ-SET-01 → display-only. | ✓ |
| Разрешить выключатель | Пересмотр D-09: пользователь выключает защиту; нужны изменения Android OnDemand и тесты на утечки. | |
| Toggle только в демо-режиме | В проде always-on, в демо локальный флаг без влияния на туннель. | |

**User's choice:** Оставить always-on.
**Notes:** Пользователь явно подтвердил приоритет безопасности из фазы 20 D-09 / REQ-CONN-06 над формулировкой ROADMAP 22.5.

## Профиль при always-on

| Option | Description | Selected |
|--------|-------------|----------|
| Статус с пояснением | «Kill switch: включён» + «Трафик вне VPN заблокирован», не кликабельно. | ✓ |
| Прятать в профиле | Не показывать kill switch, остаётся только toast фазы 20 D-12. | |

**User's choice:** Статус с пояснением.

## REQ-SET-01

| Option | Description | Selected |
|--------|-------------|----------|
| Переписать как display-only | Обновить REQUIREMENTS.md со ссылкой на D-09 фазы 20. | ✓ |
| Оставить как есть, зафиксировать дефер | В CONTEXT пометить нереализованным, реестр требований не трогать. | |
| Удалить требование | Вычеркнуть REQ-SET-01. | |

**User's choice:** Переписать как display-only.

## Нативный код

| Option | Description | Selected |
|--------|-------------|----------|
| Не трогать нативный код | allowBypass=false и NEOnDemandRuleConnect остаются как в фазе 20. | ✓ |
| Подготовить скрытый флаг | Нативный переключатель выключен по умолчанию, без UI. | |

**User's choice:** Не трогать нативный код.

## the agent's Discretion

- Формат профиля/настроек и порядок секций — на усмотрение планировщика при сохранении тёмной темы прототипа и отсутствия нижней навигации.

## Deferred Ideas

- Пользовательский toggle kill switch — отклонён; без нового решения пользователя не переносить в последующие фазы.
- Не выбранные для обсуждения зоны (устройства/undo, сеть-чип, push, источник данных профиля, Reset Demo) остаются открытыми вопросами research в рамках фазы 22.
- UAT-долги фаз 19/20/21 не являются частью фазы 22.
