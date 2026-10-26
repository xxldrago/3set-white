// Admin analytics — block: expired payments (ANL-11, D-01/D-06). Async server
// component with its own try/catch (D-05). POINT-IN-TIME: takes NO props and
// ignores ?period — a report window would hide today's stuck orders, so the
// meta says «сейчас · не зависит от периода». The «{hours}» in the card label
// comes from the loader payload, which derives it from the single hardcoded
// payment-window constant — never a literal here. A zero count renders
// truthfully; there is no null state for a count.
import { t } from '@/lib/i18n';
import { loadExpired, type ExpiredData } from '@/lib/analytics/service';
import { MetricCard, CARD, GRID } from './MetricCard';

const countFmt = new Intl.NumberFormat('ru-RU');

export default async function ExpiredCards() {
  let data: ExpiredData;
  try {
    data = await loadExpired();
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold text-foreground">{t('admin.analyticsExpiredTitle')}</h3>
      <span className="text-xs text-muted">{t('admin.analyticsExpiredMeta')}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div className={GRID}>
        <MetricCard
          size="compact"
          label={t('admin.analyticsExpiredLabel', { hours: data.windowHours })}
          value={countFmt.format(data.count)}
          sub={t('admin.analyticsExpiredSub')}
        />
      </div>
    </div>
  );
}
