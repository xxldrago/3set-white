import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { pinReferrer } from '@/lib/referrals';
import { env } from '@/lib/env';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('login.title')} — ${t('app.name')}`,
  description: t('login.text'),
};

// Signed-out entry point. A signed-in visitor has no business on the auth
// page, so the session gate sends them straight to the cabinet instead of
// showing a second login form (same discipline as /support's reverse gate).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; ref?: string }>;
}) {
  const { mode, ref } = await searchParams;

  const user = await getSessionUser();
  if (user) {
    // Legacy `/?ref=` links land here too: pin an unpinned signed-in account
    // before bouncing it to the cabinet.
    if (ref) await pinReferrer(user.userId, ref).catch(() => null);
    redirect('/');
  }

  const initialMode = mode === 'register' ? 'register' : 'login';

  // Real numbers only — the template's invented stats are replaced by live
  // counts of paid keys the cabinet actually holds.
  let activeKeys = 0;
  try {
    activeKeys = await prisma.keyCache.count({
      where: { isTrial: false, expiresAt: { gt: new Date() } },
    });
  } catch {
    // Counters are cosmetic proof-of-life: a DB hiccup must not 500 the page.
  }

  return (
    <LoginClient
      initialMode={initialMode}
      referralCode={ref ?? null}
      activeKeys={activeKeys}
      legalBaseUrl={env.LEGAL_BASE_URL}
    />
  );
}
