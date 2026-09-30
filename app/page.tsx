import Link from 'next/link';
import { cookies } from 'next/headers';

// Session-aware shell skeleton. Session verification itself is owned by
// plan 01-03 (POST /api/auth/telegram); here we only branch on cookie
// presence so the page stays decoupled and runnable in parallel.
export default async function Home() {
  const store = await cookies();
  const session = store.get('3set_session')?.value;
  const loggedIn = Boolean(session);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            3set VPN
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            VPN-подписки: покупка и управление ключами
          </p>
        </header>

        {loggedIn ? (
          <section className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15">
            <h2 className="text-xl font-medium">Мои ключи</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Кабинет-скелет: список ключей появится в следующих фазах.
            </p>
            <nav className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/guides"
                className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Инструкции по подключению
              </Link>
            </nav>
          </section>
        ) : (
          <section className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15">
            <h2 className="text-xl font-medium">Вход в кабинет</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Войдите через Telegram, чтобы управлять подпиской.
            </p>
            <nav className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/login"
                className="flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Войти через Telegram
              </Link>
              <Link
                href="/guides"
                className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                Инструкции по подключению
              </Link>
            </nav>
          </section>
        )}
      </main>
    </div>
  );
}
