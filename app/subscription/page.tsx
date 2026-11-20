// /subscription — the keys.html prototype template, wired to real data.
// Keys come from the ownership-scoped, cache-first mirror; QR SVGs are rendered
// locally on the server; every write from the client island goes through the
// existing session-gated BFF routes. Nothing here is mock data.
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import SubscriptionDashboard, {
  type SubscriptionKeyView,
} from '@/components/cabinet/SubscriptionDashboard';
import { getAdminRole } from '@/lib/admin-auth';
import { ArtemidaError } from '@/lib/artemida';
import {
  daysUntilExpiry,
  listKeys,
  listKeysByUserId,
  manageableDeviceCounts,
  revalidateKeys,
  revalidateKeysByUserId,
  type RenderedKey,
} from '@/lib/keys-service';
import { logger } from '@/lib/logger';
import { renderSubscriptionQr } from '@/lib/qr';
import { getSessionUser, requireSession, requireTelegramSession, SessionError } from '@/lib/session';
import { unreadTicketCountForUser } from '@/lib/tickets-service';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Мои ключи — 3set VPN',
};

function loadNotice(error: unknown): string {
  if (error instanceof ArtemidaError) {
    if (error.code === 'rate_limited') {
      return `Слишком много запросов к провайдеру. Повторите через ${error.retryAfterSec ?? 60} с — пока показываем сохранённые данные.`;
    }
    if (error.code === 'bad_gateway' || error.code === 'unavailable') {
      return 'Провайдер временно недоступен. Показываем сохранённые данные — попробуйте обновить страницу позже.';
    }
  }
  return 'Не удалось обновить список подписок. Показываем сохранённые данные.';
}

async function toView(
  key: RenderedKey,
  manageable: Map<string, number | null>,
): Promise<SubscriptionKeyView> {
  let qrSvg: string | null = null;
  if (key.subscriptionUrl) {
    try {
      qrSvg = await renderSubscriptionQr(key.subscriptionUrl);
    } catch {
      // The QR is an enhancement — a failed render never hides the key itself.
    }
  }
  return {
    id: key.id,
    providerName: key.name,
    label: key.label ?? null,
    statusKind: key.statusKind,
    isTrial: key.isTrial,
    expiresAt: key.expiresAt,
    daysLeft: daysUntilExpiry(key.expiresAt) ?? 0,
    devices: manageable.get(key.id) ?? key.devices ?? 0,
    deviceLimit: key.deviceLimit ?? key.devices ?? 1,
    subscriptionUrl: key.subscriptionUrl,
    qrSvg,
  };
}

export default async function SubscriptionPage() {
  let telegramId: number | null = null;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
  }

  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const navUser = await getSessionUser();
  if (!navUser) redirect('/login');

  let keys: RenderedKey[] = [];
  let notice: string | null = null;
  try {
    keys = telegramId !== null ? await listKeys(BigInt(telegramId)) : await listKeysByUserId(userId);
  } catch (err) {
    notice = loadNotice(err);
    logger.warn({
      route: 'subscription',
      outcome: 'keys_load_failed',
      code: err instanceof ArtemidaError ? err.code : undefined,
    });
  }

  const owner =
    telegramId !== null ? { telegramId: BigInt(telegramId) } : { userId };
  const manageable = await manageableDeviceCounts(
    owner,
    keys.map((item) => item.id),
  );

  // D-29: refresh the mirror after the response is sent, never in the critical path.
  after(async () => {
    try {
      if (telegramId !== null) await revalidateKeys(BigInt(telegramId));
      else await revalidateKeysByUserId(userId);
    } catch (err) {
      logger.warn({
        route: 'subscription',
        outcome: 'revalidate_failed',
        code: err instanceof ArtemidaError ? err.code : undefined,
      });
    }
  });

  let isStaff = false;
  if (telegramId !== null) {
    try {
      isStaff = (await getAdminRole(telegramId)) !== null;
    } catch {
      // Staff badge is cosmetic — a failed lookup must not break the page.
    }
  }

  let unread = 0;
  try {
    unread = await unreadTicketCountForUser(navUser.userId);
  } catch {
    // The island refreshes the badge on mount anyway.
  }

  const displayName =
    navUser.firstName?.trim() || navUser.username?.trim() || navUser.email?.split('@')[0] || 'друг';

  const views = await Promise.all(keys.map((key) => toView(key, manageable)));

  return (
    <SubscriptionDashboard
      name={displayName}
      email={navUser.email}
      isStaff={isStaff}
      unread={unread}
      keys={views}
      notice={notice}
    />
  );
}
