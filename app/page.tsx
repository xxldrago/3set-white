import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookOpen, LogIn, RotateCcw, Send, UserRound } from 'lucide-react';
import { after } from 'next/server';
import InstallPrompt from '@/components/InstallPrompt';
import Nav from '@/components/Nav';
import RefCapture from '@/components/RefCapture';
import ReferralLinkBox from '@/components/ReferralLinkBox';
import SubscriptionCard from '@/components/SubscriptionCard';
import TariffPicker from '@/components/TariffPicker';
import TrialButton from '@/components/TrialButton';
import { ArtemidaError } from '@/lib/artemida';
import { t, tp } from '@/lib/i18n';
import { listKeys, listKeysByUserId, manageableDeviceCounts, revalidateKeys, revalidateKeysByUserId, type RenderedKey } from '@/lib/keys-service';
import { logger } from '@/lib/logger';
import { getReferralSettings } from '@/lib/referrals';
import { getSessionUser, requireSession, requireTelegramSession, SessionError } from '@/lib/session';
import { listTicketsForUser } from '@/lib/tickets-service';
import { env } from '@/lib/env';
import { ensureReferralCode } from '@/lib/referrals';

// Personalised, cache-backed page — never statically rendered.
export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6';
const PRIMARY =
  'flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-sm font-bold tracking-wide text-lime transition-colors hover:opacity-90';
const SECONDARY =
  'flex h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold border border-line px-5 transition-colors hover:bg-foreground/5';

/** Loading fallback while the cache read resolves (UI-SPEC loading state). */
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      <div className="h-7 w-40 animate-pulse rounded-full bg-foreground/5" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-2xl bg-foreground/5" />
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
      <p className="text-muted">{message}</p>
      <Link href="/" className={SECONDARY}>
        <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
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

  const manageable = await manageableDeviceCounts(
    { telegramId: BigInt(telegramId) },
    cached.map((item) => item.id),
  );
  const body = <SubscriptionsBody cached={cached} manageable={manageable} />;

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

  return body;
}

/**
 * Email-only cabinet reader (G-06-9): the userId-keyed mirror of
 * `SubscriptionsSection`. Same body/empty/error copy — only the scope and the
 * `after()` revalidate target differ, so the email landing is the real keys
 * dashboard, not a profile view.
 */
async function SubscriptionsSectionByUserId({ userId }: { userId: number }) {
  let cached: RenderedKey[];
  try {
    cached = await listKeysByUserId(userId);
  } catch (err) {
    return <SubscriptionsError error={err} />;
  }

  const manageable = await manageableDeviceCounts(
    { userId },
    cached.map((item) => item.id),
  );
  const body = <SubscriptionsBody cached={cached} manageable={manageable} />;

  after(async () => {
    try {
      await revalidateKeysByUserId(userId);
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

  return body;
}

/** Shared subscription list rendering for both session scopes (same copy). */
function SubscriptionsBody({
  cached,
  manageable,
}: {
  cached: RenderedKey[];
  manageable?: Map<string, number | null>;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">{t('subs.title')}</h2>
        {cached.length >= 2 && (
          <span className="text-sm text-muted">
            {tp('subs.count', cached.length)}
          </span>
        )}
      </div>

      {cached.length === 0 ? (
        <div className={CARD}>
          <h3 className="text-xl font-semibold text-foreground">
            {t('subs.emptyHeading')}
          </h3>
          <p className="text-muted">{t('subs.emptyBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cached.map((item) => (
            <SubscriptionCard
              key={item.id}
              item={item}
              manageableDevices={manageable?.get(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  let telegramId: number | null = null;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
  }

  // Display identity for the cabinet nav (null when anonymous).
  const navUser = await getSessionUser();

  // Signed-out visitors go straight to login (attribution-safe: the landing
  // ref code travels along so register still attributes).
  if (!navUser) {
    const { ref } = await searchParams;
    const target =
      typeof ref === 'string' && ref.trim().length > 0
        ? `/login?ref=${encodeURIComponent(ref.trim())}`
        : '/login';
    redirect(target);
  }

  // Teaser amounts follow the live settings (a settings failure falls back
  // to the documented 5/5 economics, never a blank teaser).
  let refDays = { user: 5, invitee: 5 };
  try {
    const settings = await getReferralSettings();
    refDays = { user: settings.userDays, invitee: settings.inviteeDays };
  } catch {
    // Fall through to the fallback above.
  }

  // Absolute referral link for the home teaser (signed-in only — guests get
  // the login CTA). The code is ensured lazily; a failure hides the box,
  // never the page.
  let referralLink: string | null = null;
  if (navUser) {
    try {
      const code = await ensureReferralCode(navUser.userId);
      referralLink = `${env.APP_BASE_URL}/?ref=${code}`;
    } catch {
      logger.warn({ route: 'home', outcome: 'ref_link_failed' });
    }
  }

  // Email-only session (no linked Telegram): capture the server-resolved
  // userId so the cabinet can read keys/trial through the userId-keyed path
  // (G-06-9). TG-keyed sections (tariff/payments/support) stay TG-gated — a
  // linked Telegram is still required for order/ticket surfaces.
  let emailUserId: number | null = null;
  if (telegramId === null) {
    try {
      ({ userId: emailUserId } = await requireSession());
    } catch (err) {
      if (!(err instanceof SessionError)) throw err;
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <RefCapture />
      <Nav user={navUser} />
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            {t('app.name')}
          </h1>
          <p className="text-base leading-6 text-muted">{t('app.tagline')}</p>
        </header>

        {telegramId !== null ? (
          <>
            <Suspense fallback={<SkeletonRows />}>
              <SubscriptionsSection telegramId={telegramId} />
            </Suspense>
            <TrialButton />
            <TariffPicker />
          </>
        ) : emailUserId !== null ? (
          <>
            <Suspense fallback={<SkeletonRows />}>
              <SubscriptionsSectionByUserId userId={emailUserId} />
            </Suspense>
            <TrialButton />
            <TariffPicker />
          </>
        ) : (
          <section className={CARD}>
            <h2 className="text-xl font-semibold text-foreground">
              {t('home.loginTitle')}
            </h2>
            <p className="text-muted">{t('home.loginText')}</p>
            <nav className="flex flex-col gap-2 sm:flex-row">
              <Link href="/login" className={PRIMARY}>
                <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                {t('home.loginCta')}
              </Link>
              <Link href="/guides" className={SECONDARY}>
                <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
                {t('home.guidesCta')}
              </Link>
            </nav>
          </section>
        )}
        {/* Email-only: the Telegram link prompt sits above the install prompt. */}
        {telegramId === null && emailUserId !== null && (
          <section className={CARD}>
            <p className="text-muted">{t('auth.linkBanner')}</p>
            <Link href="/profile" className={PRIMARY}>
              <Send className="h-4 w-4 shrink-0" aria-hidden />
              {t('auth.linkCta')}
            </Link>
          </section>
        )}
        {/* Referral program teaser — sits after the tariffs for every visitor.
            Day amounts come from the live referral settings (not hardcoded)
            so the copy always matches the actual economics. */}
        <section className={CARD}>
          <h2 className="text-xl font-semibold text-foreground">
            {t('home.refTitle', {
              n: refDays.user,
              days: tp('home.refDay', refDays.user),
            })}
          </h2>
          <p className="text-muted">
            {t('home.refText', {
              m: refDays.invitee,
              friendDays: tp('home.refDay', refDays.invitee),
            })}
          </p>
          <ol className="flex flex-col gap-2 text-sm text-muted">
            <li>1. {t('home.refStep1')}</li>
            <li>2. {t('home.refStep2')}</li>
            <li>3. {t('home.refStep3')}</li>
          </ol>
          {referralLink ? (
            <ReferralLinkBox link={referralLink} />
          ) : (
            <nav className="flex flex-col gap-2 sm:flex-row">
              <Link
                href={navUser ? '/profile#referrals' : '/login'}
                className={PRIMARY}
              >
                {navUser ? (
                  <UserRound className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <LogIn className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {navUser ? t('home.refCtaAuthed') : t('home.refCtaGuest')}
              </Link>
            </nav>
          )}
        </section>
        <InstallPrompt />
      </main>
    </div>
  );
}
