import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
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
  if (user) redirect('/');

  const initialMode = mode === 'register' ? 'register' : 'login';

  // Real numbers only — the template's invented stats are replaced by live
  // counts of the accounts and paid keys the cabinet actually holds.
  let userCount = 0;
  let activeKeys = 0;
  try {
    [userCount, activeKeys] = await Promise.all([
      prisma.user.count(),
      // "Active" = paid and not yet expired, matching deriveStatusKind.
      prisma.keyCache.count({
        where: { isTrial: false, expiresAt: { gt: new Date() } },
      }),
    ]);
  } catch {
    // Counters are cosmetic proof-of-life: a DB hiccup must not 500 the page.
  }

  return (
    <LoginClient
      initialMode={initialMode}
      ref={ref ?? null}
      userCount={userCount}
      activeKeys={activeKeys}
      legalBaseUrl={env.LEGAL_BASE_URL}
    />
  );
}
