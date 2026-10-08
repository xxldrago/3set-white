'use client';

// Role-filtered admin top nav (UI-SPEC §1). The server layout resolves the role
// and passes only the permitted sections, so an unpermitted section is ABSENT
// from the DOM (not disabled, not greyed, no lock icon). The active item uses
// the accent pill. `can()` stays server-side (it pulls the DB-backed
// admin-auth module); this island only renders what it is given and reads the
// pathname for the active state.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t } from '@/lib/i18n';
import type { AdminSection } from '@/lib/admin-auth';

type NavSection = Extract<
  AdminSection,
  'overview' | 'users' | 'tickets' | 'broadcast' | 'pricing' | 'promos' | 'referrals' | 'roles'
>;

const ITEMS: { section: NavSection; href: string }[] = [
  { section: 'overview', href: '/admin' },
  { section: 'users', href: '/admin/users' },
  { section: 'tickets', href: '/admin/tickets' },
  { section: 'broadcast', href: '/admin/broadcast' },
  { section: 'pricing', href: '/admin/pricing' },
  { section: 'promos', href: '/admin/promos' },
  { section: 'referrals', href: '/admin/referrals' },
  { section: 'roles', href: '/admin/roles' },
];

const ITEM_BASE = 'flex h-11 items-center justify-center rounded-full px-4 text-sm transition-colors';
const ACTIVE = `${ITEM_BASE} bg-foreground text-lime`;
const INACTIVE = `${ITEM_BASE} border border-solid border-line hover:bg-foreground/5 border-line `;

/** Literal keyed label for a nav section — never an interpolated key. */
function itemLabel(section: NavSection): string {
  switch (section) {
    case 'overview':
      return t('admin.navOverview');
    case 'users':
      return t('admin.navUsers');
    case 'tickets':
      return t('admin.navTickets');
    case 'broadcast':
      return t('admin.navBroadcast');
    case 'pricing':
      return t('admin.navPricing');
    case 'promos':
      return t('admin.navPromos');
    case 'referrals':
      return t('admin.navReferrals');
    case 'roles':
      return t('admin.navRoles');
  }
}

/** Exact match for the overview index; prefix match for nested section routes. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav({ sections }: { sections: AdminSection[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {ITEMS.filter((item) => sections.includes(item.section)).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={isActive(pathname, item.href) ? ACTIVE : INACTIVE}
        >
          {itemLabel(item.section)}
        </Link>
      ))}
    </nav>
  );
}