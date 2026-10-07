// Presentational subscription card — restyled to the ARTΞMIDA "Мои ключи"
// key-card layout (name + status pill, metrics row, subscription-link box with
// copy, actions) in 3set branding. No data fetching: the server page passes a
// `RenderedKey` whose `statusKind` was derived from `expiresAt`.
import Link from 'next/link';
import CopyButton from './CopyButton';
import DeviceListModal from './DeviceListModal';
import RenewPanel from './RenewPanel';
import { formatKeyDate, statusLabel, type RenderedKey, type StatusKind } from '@/lib/keys-service';
import { t } from '@/lib/i18n';

const DAY_MS = 86_400_000;

// App-locked device bounds (mirror lib/orders-service MIN/MAX_DEVICES).
const MIN_DEVICES = 2;
const MAX_DEVICES = 10;

const PRIMARY =
  'flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 font-display text-sm font-medium tracking-wide text-lime transition-colors hover:opacity-90';
const SECONDARY =
  'flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm text-muted transition-colors hover:bg-foreground/5';

const STATUS_PILL: Record<StatusKind, string> = {
  active: 'bg-green/10 text-green',
  expiring: 'bg-amber-500/15 text-amber-600',
  expired: 'bg-foreground/10 text-dim',
  pending: 'bg-foreground/10 text-dim',
  unknown: 'bg-foreground/10 text-dim',
};

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l9 9M17 17l2-2M14 14l2-2" strokeLinecap="round" />
    </svg>
  );
}

export default function SubscriptionCard({ item }: { item: RenderedKey }) {
  const expiry = item.expiresAt ? formatKeyDate(item.expiresAt) : '—';
  const daysLeft = item.expiresAt
    ? Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / DAY_MS))
    : null;
  const deviceLimit = Math.max(
    MIN_DEVICES,
    Math.min(MAX_DEVICES, item.deviceLimit ?? item.devices ?? MIN_DEVICES),
  );
  const devicesText =
    item.devices !== null ? `${item.devices}/${item.deviceLimit ?? deviceLimit}` : '—';

  return (
    <article className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime/20 text-green">
            <KeyIcon />
          </span>
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate font-semibold text-foreground" title={item.name ?? item.id}>
              {item.name ?? item.id}
            </h3>
            <p className="font-mono text-[11px] uppercase tracking-widest text-dim">3set VPN</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {item.isTrial && (
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600">
              {t('trial.badge')}
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_PILL[item.statusKind]}`}
          >
            {statusLabel(item.statusKind, item.expiresAt)}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-panel-2 p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">Осталось</span>
          <b className="text-sm text-foreground">
            {daysLeft === null ? '—' : `${daysLeft} дн.`}
          </b>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-panel-2 p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">Устройства</span>
          <b className="text-sm tabular-nums text-foreground">{devicesText}</b>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-line bg-panel-2 p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">До даты</span>
          <b className="text-sm text-foreground">{expiry}</b>
        </div>
      </div>

      {/* Subscription link */}
      {item.subscriptionUrl && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
              {t('key.linkTitle')}
            </span>
            <CopyButton value={item.subscriptionUrl} />
          </div>
          <code className="block truncate font-mono text-xs text-muted" title={item.subscriptionUrl}>
            {item.subscriptionUrl}
          </code>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Link href={`/install?key=${encodeURIComponent(item.id)}`} className={PRIMARY}>
          {t('key.connectCta')}
        </Link>
        {item.isTrial ? (
          <Link href="/#tariff" className={SECONDARY}>
            {t('key.buyCta')}
          </Link>
        ) : (
          <RenewPanel keyId={item.id} deviceLimit={deviceLimit} />
        )}
        <DeviceListModal keyId={item.id} deviceLimit={deviceLimit} />
      </div>
    </article>
  );
}
