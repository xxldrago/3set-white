// /admin/partner — partner-only dashboard (the single section the partner
// role holds). Enforcement lives HERE (layouts are not a boundary —
// T-05-01): signed-out → /login, any non-partner role → 404. Shows the
// caller's own code/link, rate, stats, personal promos, and payout history.
// Withdrawals go through the cabinet ReferralSection (same wallet); support
// stays in the cabinet (/support) — the shared queue is never exposed.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import FunnelCharts from '@/components/admin/FunnelCharts';
import ReferralSection from '@/components/ReferralSection';
import { requireRole } from '@/lib/admin-auth';
import { env } from '@/lib/env';
import { t } from '@/lib/i18n';
import { prisma } from '@/lib/prisma';
import { listPromosByOwner } from '@/lib/promo';
import {
  getReferralSettings,
  getReferralSummary,
  listOwnWithdrawals,
} from '@/lib/referrals';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-3 rounded-2xl border border-line p-6 border-line';

export default async function AdminPartnerPage() {
  // The admin shell (and requireRole) is Telegram-session based: a partner
  // without a linked Telegram cannot open this page and uses the cabinet
  // ReferralSection instead. The users row is resolved server-side — never
  // from client input.
  let telegramId: number;
  try {
    ({ telegramId } = await requireRole('partner'));
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }
  const row = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true },
  });
  if (!row) notFound();
  const userId = row.id;

  const [summary, settings, promos, withdrawals] = await Promise.all([
    getReferralSummary(userId),
    getReferralSettings(),
    listPromosByOwner(userId),
    listOwnWithdrawals(userId),
  ]);
  const link = `${env.APP_BASE_URL}/?ref=${summary.code}`;
  const rate =
    settings.inviterKind === 'fixed'
      ? `${settings.inviterValue} ₽`
      : `${settings.inviterValue}%`;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">{t('admin.partnerTitle')}</h2>
        <p className="text-sm text-muted">{t('admin.partnerSubtitle')}</p>
      </div>

      <div className={CARD}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted">{t('auth.refYourLink')}</span>
          <code className="break-all font-mono text-sm text-foreground">{link}</code>
        </div>
        <p className="text-sm text-muted">
          {t('admin.partnerRate')}: <span className="font-semibold text-foreground">{rate}</span>{' '}
          <span className="text-xs">({t('admin.partnerRateGlobal')})</span>
        </p>
        <dl className="grid grid-cols-3 gap-2 text-center min-w-0">
          <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
            <dt className="text-xs text-muted">{t('auth.refStatsInvited')}</dt>
            <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
              {summary.referrals}
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
            <dt className="text-xs text-muted">{t('auth.refStatsEarned')}</dt>
            <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
              {summary.earned} ₽
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
            <dt className="text-xs text-muted">{t('auth.refStatsBalance')}</dt>
            <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
              {summary.balance} ₽
            </dd>
          </div>
        </dl>
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">
          {t('admin.partnerPromoTitle')}
        </h3>
        {promos.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.partnerPromoEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {promos.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 tabular-nums">
                <span className="font-mono">{row.code}</span>
                <span>
                  {row.type === 'fixed' ? `${row.discount} ₽` : `${row.discount}%`} ·{' '}
                  {row.usedCount}
                  {row.maxUses === null ? '' : `/${row.maxUses}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {withdrawals.length > 0 && (
        <div className={CARD}>
          <h3 className="text-base font-semibold text-foreground">
            {t('admin.refWithdrawalsTitle')}
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {withdrawals.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 tabular-nums">
                <span>{row.amount} ₽</span>
                <span className="text-muted">{row.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">
          {t('admin.funnelTitle')}
        </h3>
        <FunnelCharts endpoint="/api/referrals/stats" />
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">
          {t('admin.partnerSupportTitle')}
        </h3>
        <p className="text-sm text-muted">{t('admin.partnerSupportBody')}</p>
        <Link
          href="/support"
          className="flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5"
        >
          {t('admin.partnerSupportCta')}
        </Link>
      </div>

      <ReferralSection />
    </section>
  );
}
