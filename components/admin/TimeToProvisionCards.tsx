// Admin analytics — block: time from payment to key provisioning (ANL-10,
// D-04/D-05/D-06). Async server component with its own try/catch (D-05).
// Windowed by ?period; meta reuses the shared «{n} дн. · МСК» key. Same 2-up
// grid and same «—»-on-empty contract as the payment block; the sample size
// is always stated because the sample is successful chains only.
//
// The duration formatter is imported from the payment block so the three
// duration literals exist in exactly one source file.
import { t } from '@/lib/i18n';
import { loadTimeToProvision, type TimingData } from '@/lib/analytics/service';
import { MetricCard, CARD } from './MetricCard';
import { formatDuration } from './TimeToPayCards';

const TWO_UP = 'grid grid-cols-1 gap-4 sm:grid-cols-2';

export default async function TimeToProvisionCards({ period }: { period: 7 | 30 | 90 }) {
  let data: TimingData;
  try {
    data = await loadTimeToProvision(period);
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
        {t('admin.analyticsTimingProvisionTitle')}
      </h3>
      <span className="text-xs text-muted">{t('admin.analyticsWindowDays', { n: period })}</span>
    </div>
  );

  const sub =
    data.orders === 0
      ? t('admin.analyticsTimingEmpty')
      : t('admin.analyticsTimingProvisionSub', { n: data.orders });

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
