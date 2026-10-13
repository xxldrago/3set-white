'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { t } from '@/lib/i18n';

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

// Cabinet nav — shown to every signed-in identity (email-only included).
// The home page IS the subscriptions view, so there is no separate "Подписки"
// item; the logo links home. Payments history lives on /payments (reached
// from the payments page itself, not the header).
const NAV_ITEMS: NavItem[] = [
  { href: '/subscription', label: 'Мои ключи' },
  { href: '/faq', label: 'FAQ' },
  { href: '/support', label: 'Поддержка' },
];

const STAFF_ROLES = new Set(['administrator', 'support', 'manager', 'partner']);

function displayName(user: NavUser | null): string {
  if (!user) return '?';
  const name = user.firstName ?? user.username ?? user.email ?? '';
  return (name.trim()[0] ?? '?').toUpperCase();
}

export default function Nav({ user }: { user: NavUser | null }) {
  const pathname = usePathname();
  const [staff, setStaff] = useState(false);
  // Profile is reachable only via the avatar icon (no text link).
  const items = NAV_ITEMS;

  // Staff shortcut: resolved client-side from the caller's own role so every
  // page keeps passing only the display identity. A failed read hides the
  // shortcut — never blocks navigation.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetch('/api/admin/me')
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { role?: unknown };
        if (typeof body.role === 'string' && STAFF_ROLES.has(body.role) && !cancelled) {
          setStaff(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-line bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-1 px-4 py-2 sm:gap-4 sm:px-6 md:h-16 md:flex-row md:items-center md:justify-between md:py-0">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="3set — на главную" className="shrink-0">
            <Logo />
          </Link>

          <div className="flex shrink-0 items-center gap-2 md:hidden">
            {staff && (
              <Link
                href="/admin"
                className="whitespace-nowrap rounded-lg bg-foreground px-3 py-1.5 text-sm font-bold text-lime transition-colors"
              >
                {t('admin.title')}
              </Link>
            )}
            <Link
              href="/profile"
              aria-label="Профиль"
              title={user?.email ?? user?.username ?? 'Профиль'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel-2 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              {displayName(user)}
            </Link>
          </div>
        </div>

        <ul className="flex min-w-0 flex-wrap items-center gap-1">
          {items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className={`block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
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

          {staff && (
            <li className="hidden shrink-0 md:list-item">
              <Link
                href="/admin"
                className="block whitespace-nowrap rounded-lg bg-foreground px-3 py-1.5 text-sm font-bold text-lime transition-colors"
              >
                {t('admin.title')}
              </Link>
            </li>
          )}

          <li className="hidden shrink-0 md:list-item">
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
