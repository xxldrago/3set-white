import { redirect } from 'next/navigation';
import InstallClient, { type InstallKey } from './InstallClient';
import { listKeys, listKeysByUserId } from '@/lib/keys-service';
import { requireSession, requireTelegramSession, SessionError } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Подключение — 3set VPN',
};

const DAY_MS = 86_400_000;

export default async function InstallPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
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

  // Fetch the user's display name/email for the nav avatar.
  let userName: string | null = null;
  let userEmail: string | null = null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, username: true },
    });
    userName = u?.firstName ?? u?.username ?? null;
    userEmail = u?.email ?? null;
  } catch {
    // Cosmetic — never fail the page on a profile lookup.
  }

  const { key: initialKeyId } = await searchParams;

  let keys: InstallKey[] = [];
  try {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const rendered =
      telegramId !== null ? await listKeys(BigInt(telegramId)) : await listKeysByUserId(userId);
    keys = rendered.map((k) => ({
      id: k.id,
      name: k.name ?? k.id,
      daysLeft: k.expiresAt
        ? Math.max(0, Math.ceil((new Date(k.expiresAt).getTime() - now) / DAY_MS))
        : null,
      devices: k.devices,
      subscriptionUrl: k.subscriptionUrl,
    }));
  } catch {
    keys = [];
  }

  return (
    <InstallClient
      keys={keys}
      initialKeyId={initialKeyId}
      user={{ firstName: userName, email: userEmail }}
    />
  );
}