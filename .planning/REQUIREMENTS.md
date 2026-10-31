# Requirements: 3set-white — v1.2 Стабилизация и качество

**Defined:** 2026-10-31
**Core value:** Пользователь за пару кликов покупает или продлевает VPN-подписку через бота или кабинет и сразу получает рабочую ссылку подписки.

## v1.2 Requirements

### ALR — Period comparison & anomaly alerts

- [ ] **ALR-01**: WoW/MoM-сравнение для каждой метрики (дельта и %)
- [ ] **ALR-02**: Алерты: падение оплат, рост `failed`, всплеск тикетов
- [ ] **ALR-03**: Алерт на runway баланса ниже порога
- [ ] **ALR-04**: Доставка алертов админам через существующий outbox/Telegram

### PRM — Promo / referral quality & fraud

- [ ] **PRM-01**: Воронка click → register → pay по каждому коду и партнёру
- [ ] **PRM-02**: Стоимость скидки против выручки и ROI по каждому промокоду
- [ ] **PRM-03**: Partner ROI с учётом выплат (`Withdrawal`)
- [ ] **PRM-04**: Fraud-сигналы: trial-фермы по `ipHash`/`emailCanonical`, self-cycles, trial→no-pay ratio по источнику

### EXT — Extra analytics

- [ ] **EXT-01**: Save-list истекающих ключей (≤7 дней без продления) с push-напоминанием через `cron/remind`
- [ ] **EXT-02**: Upsell-radar — тяжёлые по трафику/устройствам пользователи на низком тарифе
- [ ] **EXT-05**: Data-quality флаги (degraded-ответы ARTEMIDA исключаются из агрегатов)
- [ ] **EXT-06**: CSV-экспорт по каждому отчёту
- [ ] **EXT-07**: Metric dictionary — страница с определением каждой формулы

## Out of Scope (v1.2)

- Pre-existing failing tests (analytics-mrr.test.ts:190, auth-widget/auth-flow) — отдельный техдолг-трек, не в scope этого milestone
- Multi-server / очередь / мониторинг инфра — отдельный milestone
- Английская локализация — только RU/RUB
- Лимитные тарифы трафика — по умолчанию безлимит

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ALR-01 | 12 | Pending |
| ALR-02 | 13 | Pending |
| ALR-03 | 13 | Pending |
| ALR-04 | 13 | Pending |
| PRM-01 | 14 | Pending |
| PRM-02 | 14 | Pending |
| PRM-03 | 14 | Pending |
| PRM-04 | 14 | Pending |
| EXT-01 | 15 | Pending |
| EXT-02 | 15 | Pending |
| EXT-05 | 12 | Pending |
| EXT-06 | 16 | Pending |
| EXT-07 | 16 | Pending |

---
*Last updated: 2026-10-31 — v1.2 requirements defined*
