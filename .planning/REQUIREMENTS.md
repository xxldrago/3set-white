# Requirements: 3set-white VPN

**Defined:** 2026-09-30
**Core Value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.

## v1 Requirements

### Trial / Onboarding

- [ ] **TRIAL-01**: Пользователь может получить trial-ключ в один тап (1 день / 2 устройства) из бота и из кабинета, повторный trial заблокирован сервером
- [ ] **TRIAL-02**: Пользователь может выбрать тариф 7/30/90 дней и число устройств 1–10 с живой ценой через `GET /pricing`
- [ ] **TRIAL-03**: Пользователь видит инструкции по подключению (v2rayNG / Streisand / Hiddify) в боте и кабинете

### Purchase / Payments (Platega → ARTEMIDA)

- [ ] **PAY-01**: Пользователь оплачивает выбранный тариф через Platega (карты МИР / СБП) и мгновенно получает subscription-ссылку + QR после `CONFIRMED`
- [ ] **PAY-02**: Пользователь может продлить не-trial ключ (`POST /keys/{id}/renew`) с оплатой разницы через тот же pipeline
- [ ] **PAY-03**: Пользователь может докупить устройства (`POST /keys/{id}/upgrade`), на trial-ключах кнопки скрыты
- [ ] **PAY-04**: Пользователь видит историю своих платежей (транзакции Platega: сумма, статус, дата)
- [ ] **PAY-05**: Пользователь получает push-напоминание в Telegram за 3 дня до истечения с кнопкой продления

### Cabinet PWA

- [ ] **CAB-01**: Пользователь видит список «Мои подписки» со статусом, сроком, лимитами в боте и в PWA
- [ ] **CAB-02**: Пользователь входит в PWA через Telegram Login Widget, аккаунт един (ключ `telegram-id`), сессии бот ↔ сайт синхронизированы
- [ ] **CAB-03**: Пользователь управляет устройствами ключа (список, удаление одного, сброс всех)
- [ ] **CAB-04**: Пользователь получает актуальные конфиги VLESS/Trojan + `subscriptionUrl` (`GET /keys/{id}/subscription-links`), видит расход трафика
- [ ] **CAB-05**: PWA-кабинет устанавливается на устройство (manifest + Serwist), мобильный фокус, RU-интерфейс

### Support / Tickets

- [ ] **SUP-01**: Пользователь создает обращение в поддержку из бота и из кабинета, все падают в единую очередь со статусами open/answered/closed
- [ ] **SUP-02**: Пользователь может прикрепить фото/скриншот к тикету из обоих каналов
- [ ] **SUP-03**: Ответ поддержки доставляется и в бот, и в кабинет (fan-out по `chat_id`)

### Admin

- [ ] **ADM-01**: Админ-панель с ролями: администратор (всё), техподдержка (тикеты + просмотр ключей), менеджер (финансы + статистика)
- [ ] **ADM-02**: Админ ищет пользователя по telegram-id / ключу (`q`, `customerRef`), видит его ключи и платежи
- [ ] **ADM-03**: Админ видит статистику выручки/пользователей и делает broadcast-рассылку
- [ ] **ADM-04**: Админ видит всю статистику из ARTEMIDA API (баланс `GET /balance`, ключи, устройства) + алерты о низком балансе

### Ops / Deploy

- [ ] **OPS-01**: Весь стек деплоится на один сервер 64.188.97.106 (Docker Compose + Nginx + HTTPS), webhooks Platega и Telegram на `my.3set.online`
- [ ] **OPS-02**: Subscription-ссылки используют White Label домен `my.3set.online` (настройки бренда ARTEMIDA)
- [ ] **OPS-03**: Код хранится в GitHub `3set-white`, все изменения коммитятся и пушатся, затем деплой на сервер

## v2 Requirements

### Growth

- **GRO-01**: Реферальная программа (награда после CONFIRMED-платежа реферала)
- **GRO-02**: Промокоды и подарочные подписки
- **GRO-03**: Автопродление (Platega recurrent + dunning)

### Expansion

- **EXP-01**: Английская локализация (ключи i18n заложить в v1)
- **EXP-02**: Оплата криптой
- **EXP-03**: Страница статуса серверов

## Out of Scope

| Feature | Reason |
|---------|--------|
| Внутренний баланс/кошелек юзера | Удваивает платежные состояния, оплата сразу за ключ |
| Лимитные тарифы трафика в v1 | Споры по учету = нагрузка на поддержку, по умолчанию безлимит |
| Ручные переводы карта-карта со скриншотом | Нет мгновенной выдачи, убивает core value |
| Безлимит устройств по умолчанию | Абуз шеринга, прайсинг ARTEMIDA per-device |
| Renew/upgrade trial-ключей в UI | API запрещает (409), только CTA «купить полный» |
| Self-service permanent delete ключа юзером | Необратимо без возврата, только админ с подтверждением |
| Нативные мобильные приложения | Весь рынок CIS живет на sub-link + сторонние клиенты |
| EN в v1 | Только RU/RUB, EN позже |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRIAL-01 | TBD | Pending |
| TRIAL-02 | TBD | Pending |
| TRIAL-03 | TBD | Pending |
| PAY-01 | TBD | Pending |
| PAY-02 | TBD | Pending |
| PAY-03 | TBD | Pending |
| PAY-04 | TBD | Pending |
| PAY-05 | TBD | Pending |
| CAB-01 | TBD | Pending |
| CAB-02 | TBD | Pending |
| CAB-03 | TBD | Pending |
| CAB-04 | TBD | Pending |
| CAB-05 | TBD | Pending |
| SUP-01 | TBD | Pending |
| SUP-02 | TBD | Pending |
| SUP-03 | TBD | Pending |
| ADM-01 | TBD | Pending |
| ADM-02 | TBD | Pending |
| ADM-03 | TBD | Pending |
| ADM-04 | TBD | Pending |
| OPS-01 | TBD | Pending |
| OPS-02 | TBD | Pending |
| OPS-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 0
- Unmapped: 23 ⚠️

---
*Requirements defined: 2026-09-30*
*Last updated: 2026-09-30 after initial definition*
