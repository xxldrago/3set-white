'use client';

import { t } from '@/lib/i18n';

type AlertEvent = {
  id: string;
  type: string;
  status: string;
  windowLabel: string;
  severity: string;
  message: string;
  firedAt: Date;
  resolvedAt: Date | null;
  thresholdAtFiring: string | null;
  actualValue: string | null;
};

const TYPE_LABELS: Record<string, () => string> = {
  payment_drop: () => t('admin.alertsTypePaymentDrop'),
  failed_spike: () => t('admin.alertsTypeFailedSpike'),
  ticket_spike: () => t('admin.alertsTypeTicketSpike'),
  runway_low: () => t('admin.alertsTypeRunwayLow'),
};

const STATUS_LABELS: Record<string, () => string> = {
  firing: () => t('admin.alertsStatusFiring'),
  sent: () => t('admin.alertsStatusSent'),
  resolved: () => t('admin.alertsStatusResolved'),
  muted: () => t('admin.alertsStatusMuted'),
};

export default function AlertTable({ alerts }: { alerts: AlertEvent[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-solid border-line p-6 text-center text-sm text-muted">
        {t('admin.alertsEmpty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-solid border-line">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-foreground/5">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-foreground">{t('admin.alertsColType')}</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">{t('admin.alertsColStatus')}</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">{t('admin.alertsColWindow')}</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">{t('admin.alertsColFiredAt')}</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">{t('admin.alertsColResolvedAt')}</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">{t('admin.alertsColSeverity')}</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">{t('admin.alertsColMessage')}</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr key={alert.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 text-foreground">
                {TYPE_LABELS[alert.type]?.() || alert.type}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                    alert.status === 'firing'
                      ? 'bg-amber-500/10 text-amber-500'
                      : alert.status === 'resolved'
                        ? 'bg-green-500/10 text-green-500'
                        : alert.status === 'muted'
                          ? 'bg-foreground/5 text-muted'
                          : 'bg-blue-500/10 text-blue-500'
                  }`}
                >
                  {STATUS_LABELS[alert.status]?.() || alert.status}
                </span>
              </td>
              <td className="px-4 py-3 text-foreground">{alert.windowLabel}</td>
              <td className="px-4 py-3 text-muted">
                {new Date(alert.firedAt).toLocaleString('ru-RU')}
              </td>
              <td className="px-4 py-3 text-muted">
                {alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleString('ru-RU') : '-'}
              </td>
              <td className="px-4 py-3 text-foreground">{alert.severity}</td>
              <td className="px-4 py-3 text-foreground">{alert.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
