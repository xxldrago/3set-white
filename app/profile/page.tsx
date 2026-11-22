// Profile page (SUP-06). Session-gated RSC that loads the caller's real
// identity and referral summary, then hands provider-free props to the
// `ProfileClient` client island rendered in the keys.html visual template.
// Nothing client-supplied is trusted — the session telegram id / userId is
// the only scope (T-04-20). Load failures degrade gracefully, never raw DB
// strings.
import { redirect } from 'next/navigation';
import ProfileClient from './ProfileClient';
import { getSessionUser, requireSession, SessionError } from '@/lib/session';
import { getReferralSummary } from '@/lib/referrals';
import { getAdminRole } from '@/lib/admin-auth';
import { listKeysByUserId } from '@/lib/keys-service';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Профиль — 3set VPN',
  description:
    'Профиль, безопасность аккаунта и реферальная программа 3set VPN. Управляйте именем, email, паролем, сессиями и приглашайте друзей.',
};

export default async function ProfilePage() {
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
    logger.error({ route: 'profile', outcome: 'referral_summary_failed' });
  }

  // Honest badges: admin role + active subscription status.
  let isAdmin = false;
  let hasActiveSub = false;
  try {
    if (user?.telegramId) {
      const role = await getAdminRole(user.telegramId);
      isAdmin = role !== null;
    }
  } catch {
    // Cosmetic — never fail the page on a role lookup.
  }
  try {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const keys = await listKeysByUserId(userId);
    hasActiveSub = keys.some((k) => !k.isTrial && k.expiresAt && new Date(k.expiresAt).getTime() > now);
  } catch {
    // Cosmetic.
  }

  const referralLink = summary ? `${env.APP_BASE_URL}/?ref=${summary.code}` : '';

  return <ProfileClient user={user} summary={summary} referralLink={referralLink} isAdmin={isAdmin} hasActiveSub={hasActiveSub} />;
}
