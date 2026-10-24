// Admin analytics — block 7: the 6-MSK-month churn table (UI-SPEC §6.6).
// Async server component with its own try/catch (D-19). No props — ignores
// ?period. Month slots come from the shared trailingMonthLabels derivation,
// so this block and MrrWaterfall can never disagree about how much history
// exists. The window label is derived from the RENDERED slot count (reused
// Phase 7 keys — a young install is never told «6 мес.»).
//
// Empty = every rendered month has expiring === 0 (no paid term ever ended):
// heading + window label survive, body is a bordered panel with
// analyticsChurnEmpty. A single empty month INSIDE a populated window keeps
// its row. «Продление, %» renders «—» when expiring === 0 (never 0%) while
// the absolute cells render real zeros. Six columns, MM.YYYY month axis,
// visible table with an accessible scroll region.
import { t } from '@/lib/i18n';
import { loadChurnTable, type ChurnTableData } from '@/lib/analytics/service';
import { CARD } from './MetricCard';

const money = new Intl.NumberFormat('ru-RU');
const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** "2026-07-01" → "07.2026" (MM.YYYY — the MrrWaterfall monthFull shape). */
function mmYYYY(label: string): string {
  return `${label.slice(5, 7)}.${label.slice(0, 4)}`;
}

export default async function ChurnTable() {
  let data: ChurnTableData;
  try {
    data = await loadChurnTable();
  } catch {
    return (
      <div className={CARD}>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }

  const { months } = data;

  const windowLabel =
    months.length === 1
      ? t('admin.analyticsWaterfallWindowSingle')
      : t('admin.analyticsWaterfallWindowMonths', { n: months.length });

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-base font-semibold text-foreground">{t('admin.analyticsChurnTitle')}</h3>
      <span className="text-xs text-muted">{windowLabel}</span>
    </div>
  );

  const empty = months.every((m) => m.expiring === 0);
  if (empty) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <div className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-sm text-muted">{t('admin.analyticsChurnEmpty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {header}
      <div
        role="region"
        tabIndex={0}
        aria-label={t('admin.analyticsChurnTitle')}
        className="overflow-x-auto rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
      >
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">{t('admin.analyticsChurnCaption')}</caption>
          <thead className="bg-panel text-xs uppercase text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('admin.analyticsTableMonth')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('admin.analyticsColExpiring')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('admin.analyticsColRenewed')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('admin.analyticsColRenewalPct')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('admin.analyticsColChurned')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('admin.analyticsColLostMrr')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {months.map((row) => (
              <tr key={row.month}>
                <th scope="row" className="px-4 py-3 font-normal text-muted">
                  {mmYYYY(row.month)}
                </th>
                <td className="px-4 py-3 text-right tabular-nums">{money.format(row.expiring)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money.format(row.renewed)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {row.renewalRate === null ? '—' : `${pct.format(row.renewalRate * 100)}%`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{money.format(row.churned)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money.format(Math.round(row.lostMrr))} ₽
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}