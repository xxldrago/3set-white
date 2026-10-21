// Admin analytics — block 1: the KPI row (UI-SPEC §5.3). Server component
// with its own try/catch, so a failing KPI row never takes the waterfall or
// sparkline down (§5.2 degradation; no retry button, force-dynamic reload).
//
// Value rules: whole rubles via Intl('ru-RU') + ₽ (Math.round on derived
// ratios — MRR equivalents are exact rationals); «—» is a RENDER DECISION on
// a null ratio / zero denominator, never 0 ₽ / 0%; MRR/ARR render 0 ₽ when
// genuinely zero. Cost coverage is the only cost-derived figure — «—» when
// known = 0 ("no cost data" must not look like "cost data sums to zero").
// No cost/provider field ever enters the props here — this component reads
// only the §5.6 KpisData (Pitfall 5: the RSC payload is the leak surface).
import { t, tp } from '@/lib/i18n';
import { computeCoverage } from '@/lib/analytics/mrr';
import { loadKpis, type KpisData } from '@/lib/analytics/service';
import { MetricCard, CARD, GRID } from './MetricCard';

const money = new Intl.NumberFormat('ru-RU');

export default async function AnalyticsKpi({ period }: { period: 7 | 30 | 90 }) {
  let data: KpisData;
  try {
    data = await loadKpis(period);
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  // Coverage states (§5.3): total = 0 → no orders at all; known = 0 →
  // orders exist but no cost data (—% that would lie); otherwise the ratio.
  // loadKpis returns raw sums; «—» is decided here.
  const coverage =
    data.coverageTotal === 0
      ? { value: '—', sub: t('admin.analyticsCoverageNoOrders') }
      : data.coverageKnown === 0
        ? { value: '—', sub: t('admin.analyticsCoverageSub', { known: 0, total: data.coverageTotal }) }
        : {
            value: `${Math.round((computeCoverage(data.coverageKnown, data.coverageTotal) ?? 0) * 100)}%`,
            sub: t('admin.analyticsCoverageSub', { known: data.coverageKnown, total: data.coverageTotal }),
          };

  return (
    <div className={GRID}>
      {/* D-10 order: MRR is the only 30px hero on the page. */}
      <MetricCard
        size="hero"
        label={t('admin.analyticsMrr')}
        value={`${money.format(Math.round(data.mrr))} ₽`}
        sub={tp('admin.analyticsActiveKeys', data.activeKeys)}
      />
      <MetricCard
        size="compact"
        label={t('admin.analyticsArr')}
        value={`${money.format(Math.round(data.arr))} ₽`}
        sub={t('admin.analyticsArrSub')}
      />
      <MetricCard
        size="compact"
        label={t('admin.analyticsArpu')}
        value={data.arpu === null ? '—' : `${money.format(Math.round(data.arpu))} ₽`}
        sub={t('admin.analyticsArpuSub', { n: data.arpuDenominator })}
      />
      <MetricCard
        size="compact"
        label={t('admin.analyticsArppu')}
        value={data.arppu === null ? '—' : `${money.format(Math.round(data.arppu))} ₽`}
        sub={t('admin.analyticsArppuSub', { n: data.arppuDenominator })}
      />
      <MetricCard size="compact" label={t('admin.analyticsCoverage')} value={coverage.value} sub={coverage.sub} />
    </div>
  );
}
