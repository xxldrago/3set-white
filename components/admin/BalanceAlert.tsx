import { t } from '@/lib/i18n';
import type { BalanceStatus } from '@/lib/balance-alert';

export default function BalanceAlert({ status }: { status: BalanceStatus }) {
  if (status !== 'low' && status !== 'critical') return null;
  const critical = status === 'critical';
  return <div role="status" className={`rounded-2xl border p-4 text-sm ${critical ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
    {t(critical ? 'admin.balanceCriticalBody' : 'admin.balanceLowBody')}
  </div>;
}
