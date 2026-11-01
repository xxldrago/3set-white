# Deploy Runbook — Milestone v1.2 «Стабилизация и качество»

**Date:** 2026-11-02  
**Server:** 81.90.31.102  
**Domain:** dash.3set.online  
**Version:** v1.2 (Phases 12-16)

---

## 📦 Что включено в релиз

### Phase 12: Period Comparison & Data-Quality Foundation
- WoW/MoM сравнение для каждой метрики (дельта + %)
- Data-quality флаги (degraded ARTEMIDA исключаются)
- Сбор кликов для промокодов (`promo_clicks`)
- `User.signupIpHash` для fraud-детекции

### Phase 13: Anomaly Alerts
- 4 типа алертов: payment_drop, failed_spike, ticket_spike, runway_low
- Доставка через outbox/Telegram админам
- Quiet hours 22:00–09:00 MSK (отложенная доставка)
- Daily DM limit ≤3/админ
- Admin UI: `/admin/alerts` с историей и mute toggle
- Тестовый алерт кнопка

### Phase 14: Promo & Referral Quality + Fraud
- Воронка click→register→pay для всех промокодов
- Promo ROI (discount cost vs revenue)
- Partner ROI: Accrual ROI + Cash Position (с учётом выплат)
- Fraud signals: self-dealing, mutual pairs, IP clusters, trial→no-pay
- Admin UI: `/admin/promos/quality`, `/admin/referrals/quality`, `/admin/fraud`

### Phase 15: Expiry Save-List & Upsell Radar
- Save-list истекающих ключей (≤7 дней)
- Upsell radar тяжёлых пользователей на низком тарифе
- Reminders T-7/T-3/T-1 (scaffolding)

### Phase 16: CSV Export & Metric Dictionary
- CSV экспорт с UTF-8 BOM, RFC4180, formula injection protection
- Metric dictionary (scaffolding)

---

## 🚀 Deploy Commands

```bash
# 1. SSH на сервер
ssh root@81.90.31.102

# 2. Перейти в директорию
cd /opt/3set-white

# 3. BACKUP FIRST (обязательно!)
./scripts/backup.sh

# 4. Deploy
./scripts/deploy.sh

# 5. Verify health
curl -f https://dash.3set.online/api/health

# 6. Check worker status (должен быть true)
curl -s https://dash.3set.online/api/health | jq .

# 7. Проверить миграции
docker compose -f docker-compose.prod.yml logs web | grep -i migrate

# 8. Проверить контейнеры
docker compose -f docker-compose.prod.yml ps
```

---

## ✅ Post-Deploy Checklist

### Health Checks
- [ ] `GET /api/health` → `{ status: "ok", worker: true }`
- [ ] Worker запущен (outbox/broadcast/reminder drain)
- [ ] ARTEMIDA баланс > 0 (не critical)

### Phase 13 Verification
- [ ] Cron analytics работает: `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://dash.3set.online/api/cron/analytics`
- [ ] `/admin/alerts` страница доступна
- [ ] Тестовый алерт отправляется в Telegram

### Phase 14 Verification
- [ ] `/admin/promos/quality` показывает воронку
- [ ] `/admin/referrals/quality` показывает ROI
- [ ] `/admin/fraud` показывает сигналы

### Phase 15/16 Verification
- [ ] `/admin/retention/save-list` доступна
- [ ] `/admin/retention/upsell` доступен
- [ ] `/admin/analytics/dictionary` доступен
- [ ] CSV экспорт работает: `https://dash.3set.online/api/admin/export/analytics`

### Logs
```bash
# Web logs
docker compose -f docker-compose.prod.yml logs -f web

# Worker logs (reminder scan, alerts)
docker compose -f docker-compose.prod.yml logs -f web | grep -E "reminder|alert|fraud"

# Nginx logs
docker logs $(docker ps -q -f name=nginx) --tail 50 -f
```

---

## 🔧 Configuration Required

### Environment Variables (server .env)
```bash
# Phase 13 thresholds (optional, defaults exist)
ALERT_THRESHOLD_PAYMENT_DROP_PERCENT=30
ALERT_THRESHOLD_FAILED_PAYMENT_RATIO=15
ALERT_THRESHOLD_TICKET_SPIKE_PERCENT=50
ALERT_THRESHOLD_RUNWAY_DAYS=3

# Phase 14-16: no new env vars required
```

### Cron Jobs (verify in crontab)
```bash
# Analytics rollup 03:05 MSK
5 3 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://dash.3set.online/api/cron/analytics

# RFM recompute 03:10 MSK
10 3 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://dash.3set.online/api/cron/rfm
```

---

## 🔄 Rollback Plan

```bash
# 1. Restore DB from backup
./scripts/rollback.sh /opt/3set-white/backups/db-<pre-deploy>.sql.gz

# 2. Checkout previous commit
cd /opt/3set-white
git checkout <previous-commit>

# 3. Redeploy
./scripts/deploy.sh
```

**Note:** Prisma migrations are forward-only. DB restore only works if backup predates the migration.

---

## 📊 Monitoring

### Key Metrics
- **Health:** `curl -f https://dash.3set.online/api/health`
- **Worker:** должен быть `true`
- **ARTEMIDA balance:** `/admin` balance chip
- **Disk:** `docker system df`
- **Cert renewals:** `docker compose -f docker-compose.prod.yml logs certbot`

### Alert Monitoring
- Watch `/admin/alerts` for anomaly detections
- Check Telegram DMs for alert delivery
- Verify quiet hours deferral (22:00–09:00 MSK)

---

## 📝 Known Issues / Caveats

1. **Phase 15 reminders:** Scaffolding only — full T-7/T-3/T-1 implementation pending
2. **Phase 16 dictionary:** Scaffolding only — metric definitions pending
3. **IP hash coverage:** Forward-only — "IP доступен для N из M аккаунтов" в UI
4. **Fraud signals:** Observation only — no auto-blocks

---

## 📞 Contacts

- **Dev:** @dev
- **Ops:** @ops
- **On-call:** @oncall

---

**Deploy approved by:** ___  
**Deploy date:** ___  
**Rollback tested:** ___
