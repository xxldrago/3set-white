// Admin analytics — block 3: LTV (UI-SPEC §6.2). Async server component with
// its own try/catch, so a failing LTV block never takes margin/burn/retention
// or the Phase 7 first screen down (D-19; no retry button, force-dynamic
// reload). No props — LTV ignores ?period (D-04): the window is per card and
// the block meta says so. Three windows, three labels, «—» on any null.
//
// Card 1 sub switches to the D-01 under-amortization marker when any payer's
// term is still open (activePayers > 0). Card 2's divisor is the monthly logo
// churn rate — «—» when null, never «∞». Card 3's date comes from the loader's
// data-derived coverageFrom label (DD.MM.YYYY), never fabricated (A4).
import { t } from '@/lib/i18n';
import { loadLtv, type LtvData } from '@/lib/analytics/service';
import { MetricCard, CARD, GRID } from './MetricCard';

const money = new Intl.NumberFormat('ru-RU');
const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** "2026-10-21" → "21.10.2026" (DD.MM.YYYY — the LTV net window date). */
function ddmmyyyy(label: string): string {
  return `${label.slice(8, 10)}.${label.slice(5, 7)}.${label.slice(0, 4)}`;
}

export default async function LtvCards() {
  let data: LtvData;
  try {
    data = await loadLtv();
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold text-foreground">{t('admin.analyticsLtvTitle')}</h3>
      <span className="text-xs text-muted">{t('admin.analyticsLtvMeta')}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className={GRID}>
        <MetricCard
          size="compact"
          label={t('admin.analyticsLtvGrossHist')}
          value={data.grossHistorical === null ? '—' : `${money.format(Math.round(data.grossHistorical))} ₽`}
          sub={
            data.activePayers > 0
              ? t('admin.analyticsLtvGrossHistSubActive', {
                  n: data.grossHistoricalPayers,
                  active: data.activePayers,
                })
              : t('admin.analyticsLtvGrossHistSub', { n: data.grossHistoricalPayers })
          }
        />
        <MetricCard
          size="compact"
          label={t('admin.analyticsLtvGrossPred')}
          value={data.grossPredictive === null ? '—' : `${money.format(Math.round(data.grossPredictive))} ₽`}
          sub={t('admin.analyticsLtvGrossPredSub', {
            value: data.predictiveChurnRate === null ? '—' : pct.format(data.predictiveChurnRate * 100),
          })}
        />
        <MetricCard
          size="compact"
          label={t('admin.analyticsLtvNet')}
          value={data.net === null ? '—' : `${money.format(Math.round(data.net))} ₽`}
          sub={
            data.net === null
              ? t('admin.analyticsLtvNetNoCost')
              : t('admin.analyticsLtvNetSub', {
                  date: ddmmyyyy(data.coverageFrom as string),
                  n: data.netPayers,
                })
          }
        />
      </div>
    </div>
  );
}