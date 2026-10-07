'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';

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

function displayName(user: NavUser | null): string {
  if (!user) return '?';
  const name = user.firstName ?? user.username ?? user.email ?? '';
  return (name.trim()[0] ?? '?').toUpperCase();
}

export default function Nav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  // Profile is reachable only via the avatar icon (no text link).
  const items = [...BASE_ITEMS, ...(user?.telegramId != null ? TG_ITEMS : [])];

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="3set — на главную">
          <Logo />
        </Link>

        <ul className="flex items-center gap-1">
          {items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-foreground text-lime'
                      : 'text-muted hover:bg-foreground/5 hover:text-foreground'
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
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel-2 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              {displayName(user)}
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
