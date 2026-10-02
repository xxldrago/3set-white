// Key detail (CAB-04 / D-30/D-31): subscription link + locally rendered QR +
// traffic + the guides deep-link (TRIAL-03).
//
// Async RSC modeled on app/guides/page.tsx. Every read is scoped by the session
// telegram id through the ownership-joined service functions (T-02-17): a key
// the caller does not own renders the same 404 as a missing one. The QR is
// produced server-side by lib/qr.ts and injected as an inert SVG (T-02-19) —
// never a third-party image URL. A valid response with no link degrades to
// `key.linkUnavailable`; a fetch failure renders `key.linkError` + retry.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import ConfirmPanel from '@/components/ConfirmPanel';
import CopyButton from '@/components/CopyButton';
import InstallPrompt from '@/components/InstallPrompt';
import QrSvg from '@/components/QrSvg';
import { ArtemidaError, type Device } from '@/lib/artemida';
import { t } from '@/lib/i18n';
import {
  formatKeyDate,
  getKeyForUser,
  getSubscriptionForUser,
  listDevices,
  statusLabel,
  type SubscriptionForUser,
} from '@/lib/keys-service';
import { logger } from '@/lib/logger';
import { renderSubscriptionQr } from '@/lib/qr';
import { requireSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('key.linkTitle')} — ${t('app.name')}`,
};

const CARD = 'flex flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const PRIMARY =
  'flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

/** Humanize bytes to GB (one decimal) or MB (UI-SPEC formatting rules). */
function humanizeBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** Unlimited (no/zero limit) → "{used} использовано"; otherwise "из {limit}". */
function trafficLine(traffic: { usedBytes: number | null; limitBytes: number | null }): string {
  if (traffic.usedBytes === null) return '—';
  const used = humanizeBytes(traffic.usedBytes);
  if (traffic.limitBytes === null || traffic.limitBytes <= 0) {
    return t('key.trafficUsed', { used });
  }
  return t('key.trafficOf', { used, limit: humanizeBytes(traffic.limitBytes) });
}

export default async function KeyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let telegramId: number;
  try {
    telegramId = await requireSession();
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const { id } = await params;
  const key = await getKeyForUser(BigInt(telegramId), id);
  if (!key) notFound();

  let subscription: SubscriptionForUser | null = null;
  let linkError = false;
  try {
    subscription = await getSubscriptionForUser(BigInt(telegramId), id);
  } catch (err) {
    if (err instanceof ArtemidaError) {
      linkError = true;
    } else {
      throw err;
    }
  }

  // Device list is best-effort: the provider shape for `GET /keys/{id}/devices`
  // is UNKNOWN (02-01 0-key probe), so a fetch failure or an unaddressable
  // payload degrades to the `devices.empty` RU fallback — never a fabricated
  // device row (02-01 KEY CONTRACT).
  let devices: Device[] = [];
  try {
    devices = (await listDevices(BigInt(telegramId), id)) ?? [];
  } catch (err) {
    if (err instanceof ArtemidaError) {
      logger.warn({
        route: 'keys-detail',
        code: err.code,
        requestId: err.requestId,
        outcome: 'devices_unavailable',
      });
    } else {
      throw err;
    }
  }

  const subscriptionUrl = subscription?.subscriptionUrl ?? null;
  const qr = subscriptionUrl ? await renderSubscriptionQr(subscriptionUrl) : null;
  // Fall back to the cache mirror for traffic when the link fetch failed.
  const traffic = subscription?.traffic ?? {
    usedBytes: key.trafficUsedBytes,
    limitBytes: key.trafficLimitBytes,
  };
  const expiry = key.expiresAt ? formatKeyDate(key.expiresAt) : '—';

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight break-all text-black dark:text-zinc-50">
            {key.name ?? key.id}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('key.expires', { date: expiry })} · {statusLabel(key.statusKind, key.expiresAt)}
          </p>
        </header>

        <section className={CARD}>
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            {t('key.linkTitle')}
          </h2>

          {linkError ? (
            <>
              <p role="alert" className="text-zinc-600 dark:text-zinc-400">
                {t('key.linkError')}
              </p>
              <Link href={`/keys/${encodeURIComponent(id)}`} className={SECONDARY}>
                {t('common.retry')}
              </Link>
            </>
          ) : subscriptionUrl ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="line-clamp-2 max-w-full break-all text-sm text-zinc-700 dark:text-zinc-300">
                  {subscriptionUrl}
                </code>
                <CopyButton value={subscriptionUrl} />
              </div>
              {qr && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <QrSvg svg={qr} />
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t('key.qrCaption')}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">{t('key.linkUnavailable')}</p>
          )}
        </section>

        <section className={CARD}>
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            {t('key.trafficLabel')}
          </h2>
          <p className="text-base tabular-nums text-zinc-700 dark:text-zinc-300">
            {trafficLine(traffic)}
          </p>
        </section>

        <section className={CARD}>
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            {t('key.devicesTitle')}
          </h2>

          {devices.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">{t('devices.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {devices.map((device) => {
                const label = device.name ?? device.token;
                return (
                  <li
                    key={device.token}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-base text-zinc-700 dark:text-zinc-300"
                      title={label}
                    >
                      {label}
                    </span>
                    <ConfirmPanel
                      kind="delete"
                      method="DELETE"
                      deviceName={label}
                      url={`/api/keys/${encodeURIComponent(id)}/devices/${encodeURIComponent(device.token)}`}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {devices.length > 0 && (
            <ConfirmPanel
              kind="clear"
              method="POST"
              deviceCount={devices.length}
              url={`/api/keys/${encodeURIComponent(id)}/devices/clear`}
            />
          )}
        </section>

        <nav className="flex flex-col gap-2 sm:flex-row">
          <Link href="/guides" className={PRIMARY}>
            {t('key.guidesCta')}
          </Link>
          <Link href="/" className={SECONDARY}>
            {t('guides.back')}
          </Link>
        </nav>

        <InstallPrompt />
      </main>
    </div>
  );
}
