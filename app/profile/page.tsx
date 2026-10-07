import Link from 'next/link';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Профиль — 3set VPN',
};

const SECONDARY =
  'flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const name = user.firstName ?? user.username ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <Nav user={user} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/15 dark:bg-zinc-900">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Профиль</h1>
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-zinc-500">Имя</h3>
              <p className="text-black dark:text-zinc-100">{name ?? '—'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-500">Email</h3>
              <p className="text-black dark:text-zinc-100">{user.email ?? '—'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-zinc-500">Telegram</h3>
              <p className="text-black dark:text-zinc-100">
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
