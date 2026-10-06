import { t } from '@/lib/i18n';
import type { BalanceStatus } from '@/lib/balance-alert';

const TINT: Record<BalanceStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  low: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  unknown: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
};

export default function BalanceChip({ status }: { status: BalanceStatus }) {
  const label = status === 'ok' ? t('admin.balanceOk') : status === 'low' ? t('admin.balanceLow') : status === 'critical' ? t('admin.balanceCritical') : t('admin.balanceUnknown');
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${TINT[status]}`}>{label}</span>;
}
