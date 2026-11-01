'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';

const ALERT_TYPES = [
  { key: 'payment_drop', label: () => t('admin.alertsTypePaymentDrop') },
  { key: 'failed_spike', label: () => t('admin.alertsTypeFailedSpike') },
  { key: 'ticket_spike', label: () => t('admin.alertsTypeTicketSpike') },
  { key: 'runway_low', label: () => t('admin.alertsTypeRunwayLow') },
];

export default function AlertToggle({ mutedTypes = [] }: { mutedTypes?: string[] }) {
  const [muted, setMuted] = useState<Set<string>>(new Set(mutedTypes));
  const [loading, setLoading] = useState<string | null>(null);

  async function toggle(type: string) {
    setLoading(type);
    try {
      const res = await fetch('/api/admin/alerts/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, muted: !muted.has(type) }),
      });
      if (res.ok) {
        setMuted((prev) => {
          const next = new Set(prev);
          if (next.has(type)) {
            next.delete(type);
          } else {
            next.add(type);
          }
          return next;
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-solid border-line p-4">
      <h3 className="text-sm font-semibold text-foreground">Настройки алертов</h3>
      <div className="flex flex-wrap gap-2">
        {ALERT_TYPES.map((alertType) => {
          const isMuted = muted.has(alertType.key);
          return (
            <button
              key={alertType.key}
              onClick={() => toggle(alertType.key)}
              disabled={loading === alertType.key}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isMuted
                  ? 'border border-solid border-line text-muted hover:bg-foreground/5'
                  : 'bg-foreground text-lime hover:opacity-90'
              }`}
            >
              {alertType.label()} {isMuted ? t('admin.alertsUnmute') : t('admin.alertsMute')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
