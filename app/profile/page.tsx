import Link from 'next/link';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Профиль — 3set VPN',
};

const SECONDARY =
  'flex h-12 items-center justify-center rounded-lg border border-line px-5 transition-colors hover:bg-foreground/5';

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const name = user.firstName ?? user.username ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <Nav user={user} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-line bg-panel p-6">
          <h1 className="text-2xl font-semibold text-foreground">Профиль</h1>
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="font-mono text-xs uppercase tracking-widest text-dim">Имя</h3>
              <p className="text-foreground">{name ?? '—'}</p>
            </div>
            <div>
              <h3 className="font-mono text-xs uppercase tracking-widest text-dim">Email</h3>
              <p className="text-foreground">{user.email ?? '—'}</p>
            </div>
            <div>
              <h3 className="font-mono text-xs uppercase tracking-widest text-dim">Telegram</h3>
              <p className="text-foreground">
                {user.telegramId != null ? `@id_${user.telegramId}` : 'Не привязан'}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-2 sm:flex-row">
          <Link href="/" className={SECONDARY}>
            Назад к подпискам
          </Link>
        </nav>
      </main>
    </div>
  );
}
