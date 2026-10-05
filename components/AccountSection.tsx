import Link from 'next/link';
import { t } from '@/lib/i18n';
import { prisma } from '@/lib/prisma';
import { SessionError, requireSession, requireTelegramSession } from '@/lib/session';
import ChangePasswordForm from './ChangePasswordForm';
import LinkTelegramRow from './LinkTelegramRow';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15';

/** Section-scoped loading fallback (SkeletonRows discipline, UI-SPEC §3). */
export function AccountSectionSkeleton() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      <div className="h-7 w-40 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
      <div className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
      <div className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
    </section>
  );
}

/** Section-scoped error: keys/payments/tickets render independently (UI-SPEC §3). */
function AccountSectionError() {
  return (
    <section className={CARD} role="alert">
      <p className="text-zinc-600 dark:text-zinc-400">{t('common.errorLoad')}</p>
      <Link
        href="/"
        className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        {t('common.retry')}
      </Link>
    </section>
  );
}

// «Аккаунт» card group (Phase 6 UI-SPEC §3, D-92): login-methods list (email
// + Telegram rows) + change-password slot. Server-rendered from the session
// identity — never client-supplied. Email has no change/remove affordance
// (absence is the contract); no email-verified indicator (no verification in
// Phase 6); no trial/key/payment/ticket surface is touched here.
export default async function AccountSection() {
  let userId: number | null = null;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
    // Legacy tid-only session without a users row: resolve the account by
    // telegram id so TG users keep their Account section.
    try {
      const telegramId = await requireTelegramSession();
      const row = await prisma.user.findUnique({
        where: { telegramId: BigInt(telegramId) },
        select: { id: true },
      });
      if (!row) return null;
      userId = row.id;
    } catch (err2) {
      if (err2 instanceof SessionError) return null;
      throw err2;
    }
  }

  let user: { email: string | null; telegramId: bigint | null; passwordHash: string | null } | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, telegramId: true, passwordHash: true },
    });
  } catch {
    return <AccountSectionError />;
  }
  if (!user) return null;

  const linked = user.telegramId !== null;

  return (
    <section id="account" className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          {t('auth.accountTitle')}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('auth.accountIntro')}</p>
      </div>

      {user.email && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-base text-black dark:text-zinc-50">{t('auth.methodEmail')}</span>
            <span
              className="truncate text-sm tabular-nums text-zinc-600 dark:text-zinc-400"
              title={user.email}
            >
              {user.email}
            </span>
          </div>
        </div>
      )}

      <LinkTelegramRow linked={linked} telegramId={linked ? Number(user.telegramId) : null} />

      {user.passwordHash && <ChangePasswordForm />}
    </section>
  );
}
