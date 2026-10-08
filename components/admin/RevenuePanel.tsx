// Admin revenue dashboard (overview extension). Server-rendered from
// `loadRevenue(period)` — captured cash only (post-promo, post-balance).
// Degrades to the shared load-error copy, never a raw DB string.
import { loadRevenue } from '@/lib/revenue';
import { t } from '@/lib/i18n';

const CARD = 'flex flex-col gap-2 rounded-2xl border border-line p-6 border-line';
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
const money = new Intl.NumberFormat('ru-RU');

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={CARD}>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

export default async function RevenuePanel({ period }: { period: 7 | 30 | 90 }) {
  let data;
  try {
    data = await loadRevenue(period);
  } catch {
    return (
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-semibold text-foreground">{t('admin.revenueTitle')}</h3>
        <p className="text-sm text-muted">{t('common.errorLoad')}</p>
      </div>
    );
  }
  const conversion =
    data.trialConversion.trials === 0
      ? '—'
      : `${Math.round((data.trialConversion.converted / data.trialConversion.trials) * 100)}%`;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xl font-semibold text-foreground">{t('admin.revenueTitle')}</h3>
      <div className={GRID}>
        <MetricCard label={t('admin.revenueTotal')} value={`${money.format(data.revenue)} ₽`} sub={`${data.orders} ${t('admin.revenueOrders')}`} />
        <MetricCard label={t('admin.revenueAvgCheck')} value={`${money.format(data.avgCheck)} ₽`} />
        <MetricCard label={t('admin.revenueChurn')} value={String(data.churnedKeys)} />
        <MetricCard
          label={t('admin.revenueTrialConv')}
          value={conversion}
          sub={`${data.trialConversion.converted} / ${data.trialConversion.trials}`}
        />
        <MetricCard
          label={t('admin.revenueWithdrawn')}
          value={`${money.format(data.withdrawalsApproved)} ₽`}
        />
        <MetricCard
          label={t('admin.revenueByKind')}
          value={data.byKind.map((row) => `${row.kind}: ${money.format(row.revenue)} ₽`).join(' · ') || '—'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <span className="text-sm text-muted">{t('admin.revenueTopPromos')}</span>
          {data.topPromos.length === 0 ? (
            <span className="text-sm text-muted">—</span>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {data.topPromos.map((row) => (
                <li key={row.code} className="flex justify-between gap-2 tabular-nums">
                  <span className="font-mono">{row.code}</span>
                  <span>
                    {money.format(row.revenue)} ₽ · {row.orders}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={CARD}>
          <span className="text-sm text-muted">{t('admin.revenueTopReferrers')}</span>
          {data.topReferrers.length === 0 ? (
            <span className="text-sm text-muted">—</span>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {data.topReferrers.map((row) => (
                <li key={row.userId} className="flex justify-between gap-2 tabular-nums">
                  <span>#{row.userId} · {row.referrals}</span>
                  <span>{money.format(row.earned)} ₽</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
