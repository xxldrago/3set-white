import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import { listKeys, listKeysByUserId } from '@/lib/keys-service';
import { getSessionUser, requireSession, requireTelegramSession, SessionError } from '@/lib/session';
import InstallClient, { type InstallKey } from './InstallClient';

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

  const navUser = await getSessionUser();
  const { key: initialKeyId } = await searchParams;

  let keys: InstallKey[] = [];
  try {
    const rendered =
      telegramId !== null ? await listKeys(BigInt(telegramId)) : await listKeysByUserId(userId);
    keys = rendered.map((k) => ({
      id: k.id,
      name: k.name ?? k.id,
      daysLeft: k.expiresAt
        ? Math.max(0, Math.ceil((new Date(k.expiresAt).getTime() - Date.now()) / DAY_MS))
        : null,
      devices: k.devices,
      subscriptionUrl: k.subscriptionUrl,
    }));
  } catch {
    keys = [];
  }

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <Nav user={navUser} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <section className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
            Подключение за 3 минуты
          </span>
          <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
            Выберите устройство.
            <br />
            <span className="text-green">Остальное уже готово.</span>
          </h1>
          <p className="max-w-2xl text-muted">
            Система покажет подходящие приложения, официальные ссылки и кнопку импорта вашей ссылки
            подписки.
          </p>
        </section>

        <InstallClient keys={keys} initialKeyId={initialKeyId} />
      </main>
    </div>
  );
}
