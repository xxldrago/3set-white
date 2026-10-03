import { Suspense } from 'react';
import Link from 'next/link';
import { after } from 'next/server';
import InstallPrompt from '@/components/InstallPrompt';
import SubscriptionCard from '@/components/SubscriptionCard';
import SupportEntry from '@/components/SupportEntry';
import TariffPicker from '@/components/TariffPicker';
import TrialButton from '@/components/TrialButton';
import { ArtemidaError } from '@/lib/artemida';
import { t, tp } from '@/lib/i18n';
import { listKeys, revalidateKeys, type RenderedKey } from '@/lib/keys-service';
import { logger } from '@/lib/logger';
import { requireSession, SessionError } from '@/lib/session';
import { listTicketsForUser } from '@/lib/tickets-service';

// Personalised, cache-backed page — never statically rendered.
export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const PRIMARY =
  'flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

/** Loading fallback while the cache read resolves (UI-SPEC loading state). */
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      <div className="h-7 w-40 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
      ))}
    </section>
  );
}

/** UI-SPEC error state: mapped copy + retry, never raw provider text (D-19/D-24). */
function SubscriptionsError({ error }: { error: unknown }) {
  const message =
    error instanceof ArtemidaError
      ? error.code === 'rate_limited'
        ? t('common.errorRateLimit', { seconds: error.retryAfterSec ?? 60 })
        : error.code === 'bad_gateway' || error.code === 'unavailable'
          ? t('common.errorUnavailable')
          : t('common.errorLoad')
      : t('common.errorLoad');

  return (
    <section className={CARD} role="alert">
      <p className="text-zinc-600 dark:text-zinc-400">{message}</p>
      <Link href="/" className={SECONDARY}>
        {t('common.retry')}
      </Link>
    </section>
  );
}

async function SubscriptionsSection({ telegramId }: { telegramId: number }) {
  let cached: RenderedKey[];
  try {
    cached = await listKeys(BigInt(telegramId));
  } catch (err) {
    return <SubscriptionsError error={err} />;
  }

  // D-29: schedule the ARTEMIDA refresh after the response is sent so cabinet
  // open is instant yet the mirror catches up. Never throw into the render.
  after(async () => {
    try {
      await revalidateKeys(BigInt(telegramId));
    } catch (err) {
      if (err instanceof ArtemidaError) {
        logger.warn({
          route: 'home',
          code: err.code,
          requestId: err.requestId,
          outcome: 'revalidate_failed',
        });
      } else {
        logger.warn({ route: 'home', outcome: 'revalidate_failed' });
      }
    }
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">{t('subs.title')}</h2>
        {cached.length >= 2 && (
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {tp('subs.count', cached.length)}
          </span>
        )}
      </div>

      {cached.length === 0 ? (
        <div className={CARD}>
          <h3 className="text-xl font-semibold text-black dark:text-zinc-50">
            {t('subs.emptyHeading')}
          </h3>
          <p className="text-zinc-600 dark:text-zinc-400">{t('subs.emptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cached.map((item) => (
            <SubscriptionCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function Home() {
  let telegramId: number | null = null;
  try {
    telegramId = await requireSession();
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
  }

  // Unread parity (SUP-03): sum the caller's per-ticket unread counters through
  // the session-scoped service. A read failure degrades to no badge — the home
  // page never breaks because support is unavailable.
  let unreadCount = 0;
  if (telegramId !== null) {
    try {
      const tickets = await listTicketsForUser(BigInt(telegramId));
      unreadCount = tickets.reduce((sum, ticket) => sum + ticket.unreadForUser, 0);
    } catch {
      logger.warn({ route: 'home', outcome: 'support_unread_failed' });
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            {t('app.name')}
          </h1>
          <p className="text-base leading-6 text-zinc-600 dark:text-zinc-400">{t('app.tagline')}</p>
        </header>

        {telegramId !== null ? (
          <>
            <Suspense fallback={<SkeletonRows />}>
              <SubscriptionsSection telegramId={telegramId} />
            </Suspense>
            <TrialButton />
            <div id="tariff">
              <TariffPicker />
            </div>
            <nav className="flex flex-col gap-2 sm:flex-row">
              <Link href="/payments" className={SECONDARY}>
                {t('pay.toHistory')}
              </Link>
              <SupportEntry unreadCount={unreadCount} />
            </nav>
          </>
        ) : (
          <section className={CARD}>
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              {t('home.loginTitle')}
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">{t('home.loginText')}</p>
            <nav className="flex flex-col gap-2 sm:flex-row">
              <Link href="/login" className={PRIMARY}>
                {t('home.loginCta')}
              </Link>
              <Link href="/guides" className={SECONDARY}>
                {t('home.guidesCta')}
              </Link>
            </nav>
          </section>
        )}
        <InstallPrompt />
      </main>
    </div>
  );
}
