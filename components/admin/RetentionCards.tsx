// Admin analytics — block 6: renewal / logo churn / revenue churn
// (UI-SPEC §6.5). Async server component with its own try/catch (D-19).
// Windowed by ?period; meta «{n} дн. · МСК». Absolute counts are ALWAYS in the
// subs even when the rate is «—» (D-08): zero denominators produce «—» for the
// rate only, never 0%, while the count line stays truthful. No color semantics
// — a high churn is a number in text-foreground, not an error state.
import { t } from '@/lib/i18n';
import { loadRetention, type RetentionData } from '@/lib/analytics/service';
import { MetricCard, CARD, GRID } from './MetricCard';

const money = new Intl.NumberFormat('ru-RU');
const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export default async function RetentionCards({ period }: { period: 7 | 30 | 90 }) {
  let data: RetentionData;
  try {
    data = await loadRetention(period);
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold text-foreground">
        {t('admin.analyticsRetentionCardsTitle')}
      </h3>
      <span className="text-xs text-muted">{t('admin.analyticsWindowDays', { n: period })}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className={GRID}>
        <MetricCard
          size="compact"
          label={t('admin.analyticsRenewalRate')}
          value={data.renewalRate === null ? '—' : `${pct.format(data.renewalRate * 100)}%`}
          sub={t('admin.analyticsRenewalRateSub', {
            renewed: data.renewedKeys,
            expiring: data.expiringKeys,
          })}
        />
        <MetricCard
          size="compact"
          label={t('admin.analyticsLogoChurn')}
          value={data.logoChurnRate === null ? '—' : `${pct.format(data.logoChurnRate * 100)}%`}
          sub={t('admin.analyticsLogoChurnSub', {
            churned: data.churnedKeys,
            base: data.activeKeysAtStart,
          })}
        />
        <MetricCard
          size="compact"
          label={t('admin.analyticsRevenueChurn')}
          value={data.revenueChurnRate === null ? '—' : `${pct.format(data.revenueChurnRate * 100)}%`}
          sub={t('admin.analyticsRevenueChurnSub', {
            lost: money.format(Math.round(data.lostMrr)),
            base: money.format(Math.round(data.mrrAtStart)),
          })}
        />
      </div>
    </div>
  );
}