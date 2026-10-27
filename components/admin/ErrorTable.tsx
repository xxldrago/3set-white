// Admin analytics — block: error-code breakdown (ANL-09, D-03/D-05/D-06).
// Async server component with its own try/catch (D-05). Windowed by ?period;
// meta reuses the shared «{n} дн. · МСК» key. Rows arrive already grouped by
// the RAW stored error code, count-desc with the null group preserved — the
// grouping/sorting lives in the derivation core, this block only renders.
// A null code renders the «не указан» sentinel label; a non-null code renders
// verbatim (provider codes are never translated — including a literal
// 'unknown', which is emitted by lib/worker.ts and is a DISTINCT group from
// the null sentinel). Keys are prefixed and the null case gets its own opaque
// token so the two groups can never collide or reconcile into one row.
// «Доля» divides by the payload total (failed + canceled). No hover/zebra/sort
// affordance — the table is read-only and visually identical to the retention
// table recipe.
import { t } from '@/lib/i18n';
import { loadErrorBreakdown, type ErrorBreakdownData } from '@/lib/analytics/service';
import { CARD } from './MetricCard';

const countFmt = new Intl.NumberFormat('ru-RU');
const pct = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export default async function ErrorTable({ period }: { period: 7 | 30 | 90 }) {
  let data: ErrorBreakdownData;
  try {
    data = await loadErrorBreakdown(period);
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
        {t('admin.analyticsErrorTableTitle')}
      </h3>
      <span className="text-xs text-muted">{t('admin.analyticsWindowDays', { n: period })}</span>
    </div>
  );

  if (data.total === 0) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <div className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-sm text-muted">{t('admin.analyticsErrorEmpty')}</p>
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
        aria-label={t('admin.analyticsErrorTableTitle')}
        className="overflow-x-auto rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
      >
        <table className="w-full min-w-[24rem] text-left text-sm">
          <caption className="sr-only">{t('admin.analyticsErrorCaption')}</caption>
          <thead className="bg-panel text-xs uppercase text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('admin.analyticsErrorColCode')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                {t('admin.analyticsErrorColCount')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                {t('admin.analyticsErrorColPct')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.rows.map((row) => (
              <tr key={row.code === null ? 'code:__null__' : `code:${row.code}`}>
                <th scope="row" className="px-4 py-3 font-normal text-muted">
                  {row.code === null ? t('admin.analyticsErrorUnknown') : row.code}
                </th>
                <td className="px-4 py-3 text-right tabular-nums">{countFmt.format(row.count)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {pct.format((row.count / data.total) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
