// Admin analytics — block 4: margin & cost-per-key (UI-SPEC §6.3). Async
// server component with its own try/catch (D-19). Windowed by ?period like
// loadKpis. The block meta IS the coverage badge — «30 дн. · МСК · покрытие
// N из M заказов» when orders exist, the no-orders sentence when none.
// Costed subset only (D-11): orders without known cost are never zero-filled,
// the meta states the denominator. Negative margin is legal — rendered via the
// Intl minus sign in text-foreground, never red (UI-SPEC §Color).
import { t } from '@/lib/i18n';
import { loadMargin, type MarginData } from '@/lib/analytics/service';
import { MetricCard, CARD, GRID } from './MetricCard';

const money = new Intl.NumberFormat('ru-RU');
const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export default async function MarginCards({ period }: { period: 7 | 30 | 90 }) {
  let data: MarginData;
  try {
    data = await loadMargin(period);
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const meta =
    data.totalOrders > 0
      ? t('admin.analyticsWindowCoverage', {
          n: period,
          known: data.costedOrders,
          total: data.totalOrders,
        })
      : t('admin.analyticsWindowCoverageNoOrders', { n: period });

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold text-foreground">{t('admin.analyticsMarginTitle')}</h3>
      <span className="text-xs text-muted">{meta}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className={GRID}>
        <MetricCard
          size="compact"
          label={t('admin.analyticsGrossMargin')}
          value={data.grossMargin === null ? '—' : `${money.format(Math.round(data.grossMargin))} ₽`}
          sub={t('admin.analyticsGrossMarginSub')}
        />
        <MetricCard
          size="compact"
          label={t('admin.analyticsMarginPct')}
          value={data.marginPct === null ? '—' : `${pct.format(data.marginPct * 100)}%`}
          sub={t('admin.analyticsMarginPctSub')}
        />
        <MetricCard
          size="compact"
          label={t('admin.analyticsCostPerKey')}
          value={data.costPerKey === null ? '—' : `${money.format(Math.round(data.costPerKey))} ₽`}
          sub={t('admin.analyticsCostPerKeySub')}
        />
      </div>
    </div>
  );
}