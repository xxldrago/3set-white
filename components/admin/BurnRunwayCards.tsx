// Admin analytics — block 5: burn rate & runway (UI-SPEC §6.4). Async server
// component with its own try/catch (D-19). No props — fixed 30 MSK days (D-14),
// the meta always names «30 дн.». Layout is a 2-up grid, NOT GRID.
//
// The ONLY balance consumer on the page: the live balance arrives inside the
// loadBurnRunway payload (one provider getBalance call in the loader, caught
// to null — D-15), never re-fetched here and no provider module import.
// Runway sub states drive the auditable derivation:
// balance ≠ null && burn > 0 → «баланс X ₽ ÷ расход Y ₽/день»; burn null/≤0 →
// «расхода нет»; balance null → «баланс недоступен». runwayDays is already
// floored by the loader on the exact burn.
import { t } from '@/lib/i18n';
import { loadBurnRunway, type BurnRunwayData } from '@/lib/analytics/service';
import { MetricCard, CARD } from './MetricCard';

const money = new Intl.NumberFormat('ru-RU');

const TWO_UP = 'grid grid-cols-1 gap-4 sm:grid-cols-2';

export default async function BurnRunwayCards() {
  let data: BurnRunwayData;
  try {
    data = await loadBurnRunway();
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const meta =
    data.burnTotalOrders > 0
      ? t('admin.analyticsWindowCoverage', {
          n: 30,
          known: data.burnCostedOrders,
          total: data.burnTotalOrders,
        })
      : t('admin.analyticsWindowCoverageNoOrders', { n: 30 });

  const runwaySub =
    data.runwayReason === 'no-burn'
      ? t('admin.analyticsRunwayNoBurn')
      : data.runwayReason === 'no-balance'
        ? t('admin.analyticsRunwayNoBalance')
        : t('admin.analyticsRunwaySub', {
            balance: money.format(data.balance as number),
            burn: money.format(Math.round(data.burnPerDay as number)),
          });

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold text-foreground">{t('admin.analyticsBurnTitle')}</h3>
      <span className="text-xs text-muted">{meta}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className={TWO_UP}>
        <MetricCard
          size="compact"
          label={t('admin.analyticsBurnRate')}
          value={data.burnPerDay === null ? '—' : `${money.format(Math.round(data.burnPerDay))} ₽/день`}
          sub={t('admin.analyticsBurnRateSub')}
        />
        <MetricCard
          size="compact"
          label={t('admin.analyticsRunway')}
          value={data.runwayDays === null ? '—' : `${data.runwayDays} дн.`}
          sub={runwaySub}
        />
      </div>
    </div>
  );
}