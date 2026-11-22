import { redirect } from 'next/navigation';
import ReferralsClient from './ReferralsClient';
import { getSessionUser, requireSession, SessionError } from '@/lib/session';
import { getReferralSummary } from '@/lib/referrals';
import { getAdminRole } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Реферальная программа — 3set VPN',
  description:
    'Приглашайте друзей в 3set VPN и получайте дни подписки: ссылка, статистика, уровни, материалы и выплаты.',
};

export default async function ReferralsPage() {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const user = await getSessionUser();

  let summary: Awaited<ReturnType<typeof getReferralSummary>> | null = null;
  try {
    summary = await getReferralSummary(userId);
  } catch {
    logger.error({ route: 'referrals', outcome: 'referral_summary_failed' });
  }

  let isAdmin = false;
  if (user?.telegramId) {
    try {
      const role = await getAdminRole(user.telegramId);
      isAdmin = role !== null;
    } catch {
      // Cosmetic.
    }
  }

  const referralLink = summary ? `${env.APP_BASE_URL}/?ref=${summary.code}` : '';

  let displayName = 'друг';
  let userEmail: string | null = null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, username: true },
    });
    displayName = u?.firstName?.trim() || u?.username?.trim() || u?.email?.split('@')[0] || 'друг';
    userEmail = u?.email ?? null;
  } catch {
    // Cosmetic.
  }

  return (
    <ReferralsClient
      user={user}
      summary={summary}
      referralLink={referralLink}
      isAdmin={isAdmin}
      displayName={displayName}
      userEmail={userEmail}
    />
  );
}