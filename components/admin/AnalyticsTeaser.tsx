// /admin MRR teaser card (D-09): the one analytics surface the overview shows.
// Anatomy per UI-SPEC §5.1 — CARD + the same responsive horizontal treatment
// as the analytics MRR hero: label + active-keys sub on the left, 30px value
// and the «Подробнее» link on the right. Own try/catch over loadKpis(30): a
// failing teaser must NEVER take the overview down — it renders the shared
// load-error copy inside a text-sm text-muted line instead.
import Link from 'next/link';
import { t, tp } from '@/lib/i18n';
import { loadKpis } from '@/lib/analytics/service';
import { CARD } from './MetricCard';

const money = new Intl.NumberFormat('ru-RU');

// The existing secondary-button recipe (UI-SPEC §5.1).
const SECONDARY_LINK =
  'flex h-11 items-center justify-center rounded-lg border border-line px-4 text-sm transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green';

export default async function AnalyticsTeaser() {
  let data: Awaited<ReturnType<typeof loadKpis>>;
  try {
    data = await loadKpis(30);
  } catch {
    return <p className="text-sm text-muted">{t('common.errorLoad')}</p>;
  }

  return (
    <div className={`${CARD} sm:flex-row sm:items-end sm:justify-between`}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm text-muted">{t('admin.analyticsMrr')}</span>
        <span className="text-xs text-muted">{tp('admin.analyticsActiveKeys', data.activeKeys)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-3xl font-semibold tabular-nums text-foreground">
          {money.format(Math.round(data.mrr))} ₽
        </span>
        <Link href="/admin/analytics" className={SECONDARY_LINK}>
          {t('admin.analyticsTeaserLink')}
        </Link>
      </div>
    </div>
  );
}
