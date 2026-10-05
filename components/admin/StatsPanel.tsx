import { t } from '@/lib/i18n';
import { loadArtemidaStats, loadDbStats, type ArtemidaStats, type DbStats } from '@/lib/admin-stats';
import { Suspense } from 'react';
import PeriodSelector from './PeriodSelector';

const CARD = 'flex flex-col gap-2 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
const money = new Intl.NumberFormat('ru-RU');

function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className={CARD}><p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p><p className="text-3xl font-semibold tabular-nums text-black dark:text-zinc-50">{value}</p></div>;
}

function DbCards({ stats }: { stats: DbStats }) {
  return <div className={GRID}>
    <MetricCard label={t('admin.statsRevenue')} value={`${money.format(stats.revenue)} ₽`} />
    <MetricCard label={t('admin.statsUsers')} value={money.format(stats.users)} />
    <MetricCard label={t('admin.statsOrders')} value={money.format(stats.orders)} />
  </div>;
}

function ArtemidaCards({ stats }: { stats: ArtemidaStats }) {
  const balance = stats.balance ? (stats.balance.unlimited ? t('admin.statsUnlimited') : `${money.format(stats.balance.balance)} ₽`) : '—';
  return <div className={GRID}>
    <MetricCard label={t('admin.statsKeys')} value={stats.keys === null ? '—' : money.format(stats.keys)} />
    <MetricCard label={t('admin.statsDevices')} value={stats.devices === null ? '—' : money.format(stats.devices)} />
    <MetricCard label={t('admin.statsBalance')} value={balance} />
  </div>;
}

export async function DbStatsGroup({ from }: { from: Date }) {
  try { return <DbCards stats={await loadDbStats(from)} />; } catch { return <MetricCard label={t('admin.statsRevenue')} value="—" />; }
}

export async function ArtemidaStatsGroup() {
  try { return <ArtemidaCards stats={await loadArtemidaStats()} />; } catch { return <ArtemidaCards stats={{ balance: null, keys: null, devices: null, degraded: true }} />; }
}

export default function StatsPanel({ period }: { period: number }) {
  const from = new Date(Date.now() - period * 86_400_000);
  const fallback = <div className={`${GRID} aria-hidden`}><div className="h-24 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" /><div className="h-24 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" /><div className="h-24 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" /></div>;
  return <div className="flex flex-col gap-4">
    <PeriodSelector selected={period} />
    <Suspense fallback={fallback}><DbStatsGroup from={from} /></Suspense>
    <Suspense fallback={fallback}><ArtemidaStatsGroup /></Suspense>
  </div>;
}
