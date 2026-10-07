'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Serializable display identity passed from the server (see getSessionUser). */
export interface NavUser {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  telegramId: number | null;
}

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

// Always available to any signed-in identity.
const BASE_ITEMS: NavItem[] = [{ href: '/', label: 'Подписки', exact: true }];
// Telegram-gated surfaces (orders/tickets key by telegram id) — hidden for
// email-only accounts so the nav never links to a page that redirects to /login.
const TG_ITEMS: NavItem[] = [
  { href: '/payments', label: 'История платежей' },
  { href: '/support', label: 'Поддержка' },
];
const PROFILE_ITEM: NavItem = { href: '/profile', label: 'Профиль' };

function displayName(user: NavUser | null): string {
  if (!user) return '?';
  const name = user.firstName ?? user.username ?? user.email ?? '';
  return (name.trim()[0] ?? '?').toUpperCase();
}

export default function Nav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const items = [
    ...BASE_ITEMS,
    ...(user?.telegramId != null ? TG_ITEMS : []),
    PROFILE_ITEM,
  ];

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-black/10 bg-white/80 backdrop-blur dark:border-white/15 dark:bg-black/80">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="3set" className="h-8 w-auto" />
          <span className="text-lg font-semibold text-black dark:text-zinc-50">3set</span>
        </Link>

        <ul className="flex items-center gap-1.5">
          {items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'text-zinc-600 hover:bg-black/5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}

          <li>
            <Link
              href="/profile"
              aria-label="Профиль"
              title={user?.email ?? user?.username ?? 'Профиль'}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-xs font-medium text-zinc-900 transition-colors hover:bg-black/5 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-white/10"
            >
              {displayName(user)}
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
