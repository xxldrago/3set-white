# Phase 19: Server Pools & Auto-Ping (7 days) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-27
**Phase:** 19-Server Pools & Auto-Ping (7 days)
**Areas discussed:** Источник серверов, Метод пинга, UI и навигация, Ключ и данные карточек

---

## Selection (present_gray_areas)

User selected all four: **Источник серверов, Метод пинга, UI и навигация, Ключ и данные карточек**.

Context already locked, not re-asked: two tabs REQ-POOL-01; proto/sni REQ-POOL-03/05; quick-path 800ms ≤3 + full 2s REQ-PING-02/03; TTL 60s REQ-PING-04; connectivity invalidation REQ-PING-05; sort RTT→load REQ-PING-06; last-good REQ-PING-07; manual refresh REQ-PING-08; RU/RUB; no simulation; live APIs; phase 18 Flutter/Riverpod/dio/secure storage; phase 19 before VPN core (phase 20) and subscription (phase 21). Found in code: `/api/mobile/servers` not implemented; ARTEMIDA has no `/servers`; `/pricing` is tariffs; `getSubscriptionLinks` exists; `/subscription` returns `keys: []`; `Endpoints.servers` already declared; home `_HomeScreen` + `NavigationBar` placeholder; light M3 theme; `connectivity_plus`; no `drift`/`libbox`.

---

## Источник серверов

### Q1. Откуда фаза 19 берёт список серверов и их конфиги?

| Option | Description | Selected |
|--------|-------------|----------|
| Статический каталог на бэкенде (Recommended) | Файл/константа `lib/server-pools.ts`, не зависит от ключа/ARTEMIDA | |
| Парсинг subscription-ссылки ARTEMIDA | `getSubscriptionLinks(keyId)`, парсинг `vless://`, группировка по mode | ✓ |
| Гибрид: каталог + синк из subscription | Два источника правды | |
| Таблица Server в БД + админка | Prisma + сиды + админ-UI вне фазы | |

**User's choice:** Парсинг subscription-ссылки ARTEMIDA
**Notes:** `/pricing` не подходит; в контракте ARTEMIDA нет `/servers`.

### Q2. Как распределять распарсенные серверы между simple и whitelist?

| Option | Description | Selected |
|--------|-------------|----------|
| По протоколу: Reality → whitelist (Recommended) | VLESS+Reality → whitelist, остальное → simple | |
| По SNI allowlist | whitelist только если sni в allowlist | |
| Гибрид: протокол + SNI | Reality + SNI allowlist | |
| По remark из подписки | Метка в имени сервера | ✓ |

**User's choice:** По remark из подписки
**Notes:** Требует конкретное соглашение по remark и fallback (следующий вопрос).

### Q3. По какому именно признаку в remark относить сервер к whitelist, и что делать без метки?

| Option | Description | Selected |
|--------|-------------|----------|
| WL/whitelist/обход + fallback на Reality (Recommended) | remark содержит WL/whitelist/обход → whitelist; иначе simple; без remark — Reality→whitelist | ✓ |
| Префикс [WL]/[S] | Строгий префикс; без префикса → simple | |
| Слово Reality в remark | Reality → whitelist; иначе simple | |
| Другое — опишу формат | Пользовательский формат подписки | |

**User's choice:** WL/whitelist/обход + fallback на Reality
**Notes:** case-insensitive.

### Q4. Откуда брать city/flag/cc для карточки сервера?

| Option | Description | Selected |
|--------|-------------|----------|
| Парсить flag + city из remark (Recommended) | emoji-флаг + город; fallback remark как имя + host | ✓ |
| Только remark как имя | Без города/флага | |
| Словарь host → city/flag | Поддерживаемый словарь | |
| Host как имя | Без метаданных | |

**User's choice:** Парсить flag + city из remark

### Q5. Что делать с load-баром, если в subscription-ссылке нагрузки нет?

| Option | Description | Selected |
|--------|-------------|----------|
| Скрыть load до реальной метрики (Recommended) | Протокол/SNI/пинг; REQ-POOL-04 отложена; сортировка только RTT | ✓ |
| Статический load в конфиге | Визуально, но не реально; противоречит «без симуляции» | |
| Считать load на бэкенде | Нужен источник; выходит за фазу | |
| Показывать, если есть в ссылке | Оппортунистически | |

**User's choice:** Скрыть load до реальной метрики

---

## Метод пинга

### Q1. Чем измеряем RTT в фазе 19?

| Option | Description | Selected |
|--------|-------------|----------|
| libbox urltest + HTTP fallback (Recommended) | `libbox.urltest` через outbound; fallback Dart-проба | ✓ |
| Только Dart HTTP HEAD | Живой, но whitelist ложный офлайн | |
| Только libbox urltest | Максимально корректно, высокий риск | |
| FFI-каркас + HTTP HEAD, urltest в фазе 20 | Минимальный риск | |

**User's choice:** libbox urltest + HTTP fallback

### Q2. Когда включать HTTP fallback и как показывать его в UI?

| Option | Description | Selected |
|--------|-------------|----------|
| Глобально + бейдж «HTTP» (Recommended) | libbox недоступен → всё через Dart-пробу + бейдж | |
| По серверу + пометка «~» | urltest упал → Dart-проба для сервера | |
| Молча, без индикации | Без бейджа | ✓ |
| Только debug, prod — ошибка | В prod только libbox | |

**User's choice:** Молча, без индикации
**Notes:** Риск: пользователь не поймёт ложный офлайн whitelist при fallback; решение пользователя.

### Q3. Чем именно мерить fallback-пробу?

| Option | Description | Selected |
|--------|-------------|----------|
| TCP connect до host:port (Recommended) | `Socket.connect`, реальный TCP RTT, любой протокол; помечается приблизительным | ✓ |
| HTTP HEAD до host:port | Как ROADMAP 19.4; только HTTP endpoints | |
| TCP + TLS с SNI | Ближе к whitelist, сложнее | |
| generate_204 напрямую | Меряет интернет, не сервер | |

**User's choice:** TCP connect до host:port

---

## UI и навигация

### Q1. Как встроить экран серверов в текущую навигацию?

| Option | Description | Selected |
|--------|-------------|----------|
| Заменить содержимое «Главной» (Recommended) | Нижняя навигация остаётся; табы внутри | |
| Полный макет прототипа | Убрать нижнюю навигацию; главный экран + шторки; магазин отдельно | ✓ |
| Отдельная вкладка «Серверы» | Пятый пункт | |
| Список ниже заглушки | Не рекомендую | |

**User's choice:** Полный макет прототипа
**Notes:** Нижняя навигация убирается; магазин/профиль/логика — заглушки до фаз 21–22; существующие auth-маршруты сохраняются.

### Q2. Какой визуальный стиль берём в фазе 19?

| Option | Description | Selected |
|--------|-------------|----------|
| Тёмная тема прототипа для всего (Recommended) | `#0e1512/#b7ff45/#3ee6b0`, Manrope/Unbounded; перекрасить auth + тесты | ✓ |
| Оставить светлую M3 | Структура без редизайна | |
| Тёмный только экран серверов | Разрозненно | |
| Обе темы + переключатель | Больше работы | |

**User's choice:** Тёмная тема прототипа для всего

### Q3. Что делает кнопка «Подключить» в фазе 19, если VPN-ядро ещё не готово (фаза 20)?

| Option | Description | Selected |
|--------|-------------|----------|
| Запускает выбор сервера (Recommended) | quick-path → full ping → подсветка; «ядро в фазе 20»; без симуляции | ✓ |
| Видимая, но неактивная | Подсказка «Доступно после фазы 20» | |
| Скрыта до фазы 20 | Только список/пинг/выбор | |
| Симуляция подключения | Противоречит «без симуляции» | |

**User's choice:** Запускает выбор сервера

### Q4. Какие элементы прототипа в шапке входят в фазу 19?

| Option | Description | Selected |
|--------|-------------|----------|
| Минимум + заглушки (Recommended) | greeting, статус, key pill, обновление; магазин/аватар/логика — заглушки; без нижней навигации | ✓ |
| Полный header + пустые шторки | «Как это работает» заполнена текстом | |
| Только tabs + list + connect | Без действий в шапке | |
| Всё, включая магазин и профиль | Выходит за фазу | |

**User's choice:** Минимум + заглушки
**Notes:** Сеть-чип read-only, без симуляции.

---

## Ключ и данные карточек

### Q1. Что делать без активного ключа и как гейтить `/api/mobile/servers`?

| Option | Description | Selected |
|--------|-------------|----------|
| Гейтинг по активному ключу (Recommended) | Без ключа `no_active_key` + пустой список; баннер + «Купить» (заглушка); пинг/выбор заблокированы | ✓ |
| Баннер + CTA в магазин | По сути то же | |
| Ошибка 403 + повтор | Менее дружелюбно | |
| Список без ключа | Невозможно без subscription-ссылки | |

**User's choice:** Гейтинг по активному ключу

### Q2. В фазе 19 `/subscription` отдаёт `keys: []`. Чем питать key pill «ключ · N дн.»?

| Option | Description | Selected |
|--------|-------------|----------|
| Метаданные ключа из `/servers` (Recommended) | `key.active`, `remainingDays`/`expireAt`, `subscriptionUrl`; `/subscription` в фазе 21 | ✓ |
| Заполнить `/subscription` сейчас | `keys` реальные в фазе 19 | |
| Заглушка до фазы 21 | Нейтральная метка | |
| Убрать key pill | Без ключа в шапке | |

**User's choice:** Метаданные ключа из `/servers`

---

## the agent's Discretion

- Точный ffigen-контракт libbox, имя нативного модуля, сборка sing-box артефактов.
- Точная freezed-модель `Server`/`PingResult`; имена Riverpod-провайдеров.
- HTTP-URL `libbox.urltest` (`generate_204`-эквивалент), имя outbound; парсер share-ссылок.
- Словарь emoji-флагов → cc; вторичная строка host; имена полей.
- Какие заглушки для магазина/профиля/логики.
- Подключение шрифтов (`google_fonts` vs бандл).

## Deferred Ideas

- REQ-POOL-04 load-бар — до реальной метрики `load`.
- VPN-туннель / Connection FSM / kill switch / реконнект / cancel — фаза 20; кнопка в 19 только выбирает сервер.
- Магазин/покупка + key gating UX — фаза 21; 19 показывает баннер + заглушку.
- `/subscription.keys`, профиль, устройства, subscription link — фаза 21.
- Прототип `Math.random` ping / fake IP / `sleep` / confetti / hardcoded servers — симуляция, заменяется реальными API; не переносить.
- Ручной network-chip (симуляция) — продакшн реагирует только на `connectivity_plus`.
- Static catalog — отклонён в пользу парсинга subscription (D-01); пересмотр при недостаточных remark.
- SNI allowlist — отклонён; remark-метка + Reality fallback (D-02).
- Light-theme toggle — отклонён; тёмная прототипа app-wide (D-16).
- Bottom nav — отклонён; полный макет (D-15).
- Android VPN/BIND_VPN_SERVICE, `VPN_MANAGE` fix — фаза 20; NetworkExtension entitlement, GPL-3.0 — внешние блокеры.
- Min password 8 (фаза 18); prototype «минимум 6» игнорируется.
- Нет folded/reviewed todos (`todo.match-phase` пусто).
