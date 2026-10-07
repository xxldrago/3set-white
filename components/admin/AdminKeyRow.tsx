// Read-only admin key row (ADM-02 / UI-SPEC §4).
//
// Copies `SubscriptionCard`'s card anatomy (name + status chip + `dl` meta) and
// DROPS the renew/upgrade panels entirely: admins view user keys, they never
// mutate them (those actions are user-initiated). There is deliberately NO
// mutation control and no `RenewPanel`/`UpgradePanel` import here.
import { formatKeyDate, statusLabel, type StatusKind } from '@/lib/keys-service';
import { t } from '@/lib/i18n';
import type { AdminKeyView } from '@/lib/admin-service';

const BADGE_BASE = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold';
const CARD = 'flex flex-col gap-3 rounded-2xl border border-line p-6 border-line';
const TRIAL_BADGE = 'bg-amber-600/10 text-amber-600';

const STATUS_TINT: Record<StatusKind, string> = {
  active: 'bg-green-600/10 text-green-600',
  expiring: 'bg-amber-600/10 text-amber-600',
  expired: 'bg-background0/10 text-dim',
  pending: 'bg-background0/10 text-dim',
  unknown: 'bg-background0/10 text-dim',
};

export default function AdminKeyRow({ item }: { item: AdminKeyView }) {
  const expiry = item.expiresAt ? formatKeyDate(item.expiresAt) : '—';
  const devices =
    item.devices !== null && item.deviceLimit !== null
      ? t('key.devicesCount', { n: item.devices, max: item.deviceLimit })
      : '—';

  return (
    <article className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold break-all text-foreground">
          {item.name ?? item.id}
        </h3>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {item.isTrial && (
            <span className={`${BADGE_BASE} ${TRIAL_BADGE}`}>{t('trial.badge')}</span>
          )}
          <span className={`${BADGE_BASE} ${STATUS_TINT[item.statusKind]}`}>
            {statusLabel(item.statusKind, item.expiresAt)}
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-sm text-muted">
        <div className="flex gap-2">
          <dd>{t('key.expires', { date: expiry })}</dd>
        </div>
        <div className="flex gap-2">
          <dd>{devices}</dd>
        </div>
      </dl>
    </article>
  );
}
