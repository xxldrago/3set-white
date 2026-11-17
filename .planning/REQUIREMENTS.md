# Requirements: 3set-white — v1.2 Стабилизация и качество

**Defined:** 2026-10-31
**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.

## v1.2 Requirements

### ALR — Period comparison & anomaly alerts

- [x] **ALR-01**: WoW/MoM-сравнение для каждой метрики (дельта и %)
- [x] **ALR-02**: Алерты: падение оплат, рост `failed`, всплеск тикетов
- [x] **ALR-03**: Алерт на runway баланса ниже порога
- [x] **ALR-04**: Доставка алертов админам через существующий outbox/Telegram

### PRM — Promo / referral quality & fraud

- [x] **PRM-01**: Воронка click → register → pay по каждому коду и партнёру
- [x] **PRM-02**: Стоимость скидки против выручки и ROI по каждому промокоду
- [x] **PRM-03**: Partner ROI с учётом выплат (`Withdrawal`)
- [x] **PRM-04**: Fraud-сигналы: self-dealing промокод, mutual referral pairs, кластеры заблокированных регистраций по email, trial→no-pay ratio по источнику (наблюдение, без авто-банов). IP-кластеры по `signupIpHash` — P2, после накопления данных (сбор начинается в Phase 12)

### EXT — Extra analytics

- [x] **EXT-01**: Save-list истекающих ключей (≤7 дней без продления) с push-напоминанием T-7 / T-3 / T-1 через `cron/remind` (MSK-ключ дня, стадийная идемпотентность)
- [x] **EXT-02**: Upsell-radar — тяжёлые по трафику/устройствам пользователи на низком тарифе
- [x] **EXT-05**: Data-quality флаги (degraded-ответы ARTEMIDA исключаются из агрегатов; degraded-прогон rollup не перезаписывает здоровые значения)
- [x] **EXT-06**: CSV-экспорт по каждому отчёту
- [x] **EXT-07**: Metric dictionary — страница с определением каждой формулы

## Milestone Decisions (owner, 2026-10-31)

- **D1**: собираем клики и для generic-, и для партнёрских кодов (`promo_clicks` + beacon в Phase 12) — воронка честная для всех кодов
- **D2**: собираем `User.signupIpHash` (sha256, сырой IP не храним, литерал `"direct"` исключён) с Phase 12; история только вперёд
- **D3**: алерты получает только `administrator`
- **D4**: fraud P1 (self-dealing, mutual pairs, trial→no-pay) в Phase 14; IP-кластеры — P2
- **D5**: каденция T-7 / T-3 / T-1, MSK-ключ дня; `autorenew.ts` не трогаем
- **D6**: 4 алерта с фиксированными дефолтами в `Setting`, без per-rule overrides

## Out of Scope (v1.2)

- Pre-existing failing tests (analytics-mrr.test.ts:190, auth-widget/auth-flow) — отдельный техдолг-трек, не в scope этого milestone
- Multi-server / очередь / мониторинг инфра — отдельный milestone
- Английская локализация — только RU/RUB
- Лимитные тарифы трафика — по умолчанию безлимит

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ALR-01 | 12 | Complete |
| ALR-02 | 13 | Complete |
| ALR-03 | 13 | Complete |
| ALR-04 | 13 | Complete |
| PRM-01 | 14 | Complete |
| PRM-02 | 14 | Complete |
| PRM-03 | 14 | Complete |
| PRM-04 | 14 | Complete |
| EXT-01 | 15 | Complete |
| EXT-02 | 15 | Complete |
| EXT-05 | 12 | Complete |
| EXT-06 | 16 | Complete |
| EXT-07 | 16 | Complete |

---
*Last updated: 2026-10-31 — v1.2 requirements defined*
