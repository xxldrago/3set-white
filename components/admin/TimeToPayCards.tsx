// Admin analytics — block: time from order creation to payment (ANL-10,
// D-04/D-05/D-06). Async server component with its own try/catch (D-05).
// Windowed by ?period; meta reuses the shared «{n} дн. · МСК» key. Layout is
// the 2-up grid (the burn-block precedent), NOT GRID.
//
// Only SUCCESSFUL chains enter the sample (status provisioned + paidAt +
// provisioned key), so the sub always states the sample size — a median over
// three orders must never read like a median over three hundred. An empty
// sample renders «—» and says so instead of inventing a zero.
//
// formatDuration is exported from THIS file: the three duration keys' t()
// calls live here and the provisioning block imports the helper, so the
// literals exist exactly once.
import { t } from '@/lib/i18n';
import { loadTimeToPay, type TimingData } from '@/lib/analytics/service';
import { MetricCard, CARD } from './MetricCard';

const TWO_UP = 'grid grid-cols-1 gap-4 sm:grid-cols-2';

/** Human-readable duration from milliseconds, in three literal-key bands. */
export function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (ms < 60_000) return t('admin.analyticsDurationSec', { n: sec });
  if (ms < 3_600_000) return t('admin.analyticsDurationMinSec', { n: Math.floor(sec / 60), m: sec % 60 });
  const min = Math.floor(sec / 60);
  return t('admin.analyticsDurationHrMin', { n: Math.floor(min / 60), m: min % 60 });
}

export default async function TimeToPayCards({ period }: { period: 7 | 30 | 90 }) {
  let data: TimingData;
  try {
    data = await loadTimeToPay(period);
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
        {t('admin.analyticsTimingPayTitle')}
      </h3>
      <span className="text-xs text-muted">{t('admin.analyticsWindowDays', { n: period })}</span>
    </div>
  );

  const sub =
    data.orders === 0
      ? t('admin.analyticsTimingEmpty')
      : t('admin.analyticsTimingPaySub', { n: data.orders });

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className={TWO_UP}>
        <MetricCard
          size="compact"
          label={t('admin.analyticsTimingMedian')}
          value={data.medianMs === null ? '—' : formatDuration(data.medianMs)}
          sub={sub}
        />
        <MetricCard
          size="compact"
          label={t('admin.analyticsTimingMean')}
          value={data.meanMs === null ? '—' : formatDuration(data.meanMs)}
          sub={sub}
        />
      </div>
    </div>
  );
}
