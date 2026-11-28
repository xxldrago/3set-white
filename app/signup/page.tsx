import { redirect } from 'next/navigation';
import LoginClient from '@/app/login/LoginClient';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { pinReferrer } from '@/lib/referrals';
import { env } from '@/lib/env';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('auth.modeRegister')} — ${t('app.name')}`,
  description: t('login.text'),
};

// External-traffic entry: same island as /login, only the register segment
// opens first. Login stays one tap away — same routes, same behaviour.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  const user = await getSessionUser();
  if (user) {
    // A signed-in visitor cannot register, but an invited account that has not
    // been pinned yet still deserves attribution — pin once, best-effort.
    if (ref) await pinReferrer(user.userId, ref).catch(() => null);
    redirect('/');
  }

  let activeKeys = 0;
  try {
    activeKeys = await prisma.keyCache.count({
      where: { isTrial: false, expiresAt: { gt: new Date() } },
    });
  } catch {
    // Cosmetic counters only — never fail the page on a count query.
  }

  return (
    <LoginClient
      initialMode="register"
      referralCode={ref ?? null}
      activeKeys={activeKeys}
      legalBaseUrl={env.LEGAL_BASE_URL}
    />
  );
}
