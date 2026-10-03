// Presentational subscription card (CAB-01 / UI-SPEC key card).
//
// No data fetching here: the server page passes a `RenderedKey` whose
// `statusKind` was already derived from `expiresAt` (never the stored status
// string). Trial keys carry a distinct amber `trial.badge` chip so they can
// never be mistaken for paid keys. Badges are tinted text chips, never
// icon-only.
import RenewPanel from './RenewPanel';
import UpgradePanel from './UpgradePanel';
import { formatKeyDate, statusLabel, type RenderedKey, type StatusKind } from '@/lib/keys-service';
import { t } from '@/lib/i18n';

const BADGE_BASE = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold';
const PRIMARY =
  'flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]';

// App-locked device bounds (mirror lib/orders-service MIN/MAX_DEVICES).
const MIN_DEVICES = 2;
const MAX_DEVICES = 10;

const STATUS_BADGE: Record<StatusKind, string> = {
  active: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  expiring: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
  expired: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400',
  pending: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400',
  unknown: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400',
};

const TRIAL_BADGE = 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400';

export default function SubscriptionCard({ item }: { item: RenderedKey }) {
  const expiry = item.expiresAt ? formatKeyDate(item.expiresAt) : '—';
  const devices =
    item.devices !== null && item.deviceLimit !== null
      ? t('key.devicesCount', { n: item.devices, max: item.deviceLimit })
      : '—';
  const deviceLimit = Math.max(
    MIN_DEVICES,
    Math.min(MAX_DEVICES, item.deviceLimit ?? item.devices ?? MIN_DEVICES),
  );

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold break-all text-black dark:text-zinc-50">
          {item.name ?? item.id}
        </h3>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {item.isTrial && <span className={`${BADGE_BASE} ${TRIAL_BADGE}`}>{t('trial.badge')}</span>}
          <span className={`${BADGE_BASE} ${STATUS_BADGE[item.statusKind]}`}>
            {statusLabel(item.statusKind, item.expiresAt)}
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="flex gap-2">
          <dd>{t('key.expires', { date: expiry })}</dd>
        </div>
        <div className="flex gap-2">
          <dd>{devices}</dd>
        </div>
      </dl>

      {/* D-44: a trial key has NO renew/upgrade in the DOM — only the funding
          CTA deep-linking to the tariff section. Non-trial keys get the
          renew/upgrade entry points (the panels stay collapsed until tapped). */}
      {item.isTrial ? (
        <a href="#tariff" className={PRIMARY}>
          {t('key.buyCta')}
        </a>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <RenewPanel keyId={item.id} deviceLimit={deviceLimit} />
          <UpgradePanel keyId={item.id} deviceLimit={deviceLimit} />
        </div>
      )}
    </article>
  );
}
