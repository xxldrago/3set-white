// Personal cabinet (dark redesign). Everything the dashboard shows is real:
// keys come from the ownership-scoped mirror, prices from the session-gated
// BFF, the referral link from the settings, and the unread badge from the
// ticket aggregate. The layout is a client island (`CabinetDashboard`) so the
// tariff calculator / device modal can be interactive without a page reload.
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import CabinetDashboard, { type CabinetKeyView } from '@/components/cabinet/CabinetDashboard';
import RefCapture from '@/components/RefCapture';
import { ArtemidaError } from '@/lib/artemida';
import { getAdminRole } from '@/lib/admin-auth';
import { env } from '@/lib/env';
import { getSessionUser, requireSession, requireTelegramSession, SessionError } from '@/lib/session';
import { unreadTicketCountForUser } from '@/lib/tickets-service';
import {
  listKeys,
  listKeysByUserId,
  revalidateKeys,
  revalidateKeysByUserId,
  type RenderedKey,
} from '@/lib/keys-service';
import { getReferralSettings, ensureReferralCode } from '@/lib/referrals';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

function daysLeftOf(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / DAY_MS)) : 0;
}

function toView(key: RenderedKey): CabinetKeyView {
  return {
    id: key.id,
    name: key.label ?? key.name ?? key.id,
    statusKind: key.statusKind,
    daysLeft: daysLeftOf(key.expiresAt),
    expiresAt: key.expiresAt,
    devices: key.devices,
    deviceLimit: key.deviceLimit,
    subscriptionUrl: key.subscriptionUrl,
    label: key.label ?? null,
  };
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

  const navUser = await getSessionUser();
  if (!navUser) {
    const { ref } = await searchParams;
    const target =
      typeof ref === 'string' && ref.trim().length > 0
        ? `/login?ref=${encodeURIComponent(ref.trim())}`
        : '/login';
    redirect(target);
  }

  let emailUserId: number | null = null;
  if (telegramId === null) {
    try {
      ({ userId: emailUserId } = await requireSession());
    } catch (err) {
      if (!(err instanceof SessionError)) throw err;
    }
  }

  // Keys (ownership-scoped, cache-backed).
  let keys: RenderedKey[] = [];
  try {
    keys = telegramId !== null ? await listKeys(BigInt(telegramId)) : await listKeysByUserId(emailUserId!);
  } catch (err) {
    logger.warn({ route: 'home', outcome: 'keys_load_failed', code: err instanceof ArtemidaError ? err.code : undefined });
  }

  after(async () => {
    try {
      if (telegramId !== null) await revalidateKeys(BigInt(telegramId));
      else if (emailUserId !== null) await revalidateKeysByUserId(emailUserId);
    } catch (err) {
      logger.warn({ route: 'home', outcome: 'revalidate_failed', code: err instanceof ArtemidaError ? err.code : undefined });
    }
  });

  // Referral economics + absolute link.
  let refDays = { user: 5, invitee: 5 };
  try {
    const settings = await getReferralSettings();
    refDays = { user: settings.userDays, invitee: settings.inviteeDays };
  } catch {
    // documented fallback
  }
  let referralLink: string | null = null;
  try {
    const code = await ensureReferralCode(navUser.userId);
    referralLink = `${env.APP_BASE_URL}/?ref=${code}`;
  } catch {
    logger.warn({ route: 'home', outcome: 'ref_link_failed' });
  }

  // Staff shortcut + unread badge initial value.
  let isStaff = false;
  if (telegramId !== null) {
    isStaff = (await getAdminRole(telegramId)) !== null;
  }
  let unread = 0;
  try {
    unread = await unreadTicketCountForUser(navUser.userId);
  } catch {
    // The client island refreshes on mount anyway.
  }

  const displayName =
    navUser.firstName?.trim() || navUser.username?.trim() || navUser.email?.split('@')[0] || 'друг';

  // Trial gate: the trial needs a confirmed email or a linked Telegram, and it
  // is available once per account. The dashboard uses this to show the trial
  // block instead of an empty "no subscription" alert.
  let trialUsed = false;
  try {
    const row = await prisma.user.findUnique({
      where: { id: navUser.userId },
      select: { trialUsed: true },
    });
    trialUsed = row?.trialUsed ?? false;
  } catch {
    // Cosmetic: default to hiding the trial block rather than offering a 409.
    trialUsed = true;
  }

  return (
    <>
      <RefCapture />
      <CabinetDashboard
        name={displayName}
        email={navUser.email}
        isStaff={isStaff}
        keys={keys.slice(0, 8).map(toView)}
        referralLink={referralLink}
        refDays={refDays}
        unreadInitial={unread}
        emailVerified={navUser.emailVerifiedAt !== null}
        telegramLinked={navUser.telegramId !== null}
        trialUsed={trialUsed}
      />
    </>
  );
}
