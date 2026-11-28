'use client';

// Admin shell (template layout): dark sidebar + sticky topbar + content.
//
// The server layout resolves the role and passes ONLY the permitted sections,
// so an unpermitted destination is absent from the DOM (never disabled, never
// greyed). Pages themselves re-check `requireRole` — this shell is UX only.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  ChevronRight,
  Command,
  CreditCard,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
  Server,
  Share2,
  Shield,
  ShieldAlert,
  Tag,
  Users,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';
import type { AdminSection } from '@/lib/admin-auth';

type NavItem = {
  section: AdminSection;
  href: string;
  label: string;
  icon: ReactNode;
};

type NavGroup = { title: string; items: NavItem[] };

const ICON = { size: 17, strokeWidth: 2 } as const;

const GROUPS: NavGroup[] = [
  {
    title: 'Основное',
    items: [
      { section: 'overview', href: '/admin', label: 'Обзор', icon: <LayoutDashboard {...ICON} /> },
      { section: 'analytics', href: '/admin/analytics', label: 'Аналитика', icon: <BarChart3 {...ICON} /> },
    ],
  },
  {
    title: 'Клиенты',
    items: [
      { section: 'users', href: '/admin/users', label: 'Пользователи', icon: <Users {...ICON} /> },
      { section: 'tickets', href: '/admin/tickets', label: 'Обращения', icon: <MessageSquare {...ICON} /> },
      { section: 'broadcast', href: '/admin/broadcast', label: 'Рассылка', icon: <Send {...ICON} /> },
      { section: 'segments', href: '/admin/segments', label: 'Сегменты', icon: <Layers {...ICON} /> },
    ],
  },
  {
    title: 'Монетизация',
    items: [
      { section: 'pricing', href: '/admin/pricing', label: 'Тарифы', icon: <CreditCard {...ICON} /> },
      { section: 'promos', href: '/admin/promos', label: 'Промокоды', icon: <Tag {...ICON} /> },
      { section: 'referrals', href: '/admin/referrals', label: 'Рефералы', icon: <UsersRound {...ICON} /> },
      { section: 'wallet', href: '/admin/wallet', label: 'Баланс API', icon: <Wallet {...ICON} /> },
    ],
  },
  {
    // Partner-only surfaces: the matrix gives these sections to `partner` and
    // to nobody else, so the whole group disappears for staff roles.
    title: 'Партнёрам',
    items: [
      { section: 'partner', href: '/admin/partner', label: 'Дашборд', icon: <LayoutDashboard {...ICON} /> },
      { section: 'partnerReferrals', href: '/admin/partner/referrals', label: 'Рефералы', icon: <UsersRound {...ICON} /> },
      { section: 'partnerPromos', href: '/admin/partner/promos', label: 'Промокоды', icon: <Tag {...ICON} /> },
      { section: 'partnerPayouts', href: '/admin/partner/payouts', label: 'Заработок', icon: <Wallet {...ICON} /> },
      { section: 'partnerLinks', href: '/admin/partner/links', label: 'Ссылки', icon: <Share2 {...ICON} /> },
      { section: 'partnerSupport', href: '/admin/partner/support', label: 'Поддержка', icon: <LifeBuoy {...ICON} /> },
    ],
  },
  {
    title: 'Система',
    items: [
      { section: 'roles', href: '/admin/roles', label: 'Роли', icon: <Shield {...ICON} /> },
      { section: 'alerts', href: '/admin/alerts', label: 'Алерты', icon: <Bell {...ICON} /> },
      { section: 'providers', href: '/admin/providers', label: 'Провайдеры', icon: <Server {...ICON} /> },
      { section: 'fraud', href: '/admin/fraud', label: 'Антифрод', icon: <ShieldAlert {...ICON} /> },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Администратор',
  manager: 'Менеджер',
  support: 'Поддержка',
  partner: 'Партнёр',
};

function activeHref(pathname: string): string {
  if (pathname === '/admin') return '/admin';
  const match = [...GROUPS]
    .flatMap((group) => group.items)
    .filter((item) => item.href !== '/admin')
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.href ?? '/admin';
}

export default function AdminShell({
  sections,
  role,
  unreadTickets,
  children,
}: {
  sections: AdminSection[];
  role: string;
  unreadTickets: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sideOpen, setSideOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdSelected, setCmdSelected] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const visibleGroups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => sections.includes(item.section)),
      })).filter((group) => group.items.length > 0),
    [sections],
  );

  const allItems = useMemo(() => visibleGroups.flatMap((group) => group.items), [visibleGroups]);
  const currentHref = activeHref(pathname);
  const currentItem = allItems.find((item) => item.href === currentHref) ?? allItems[0];
  const title = currentItem?.label ?? 'Админ-панель';

  const filteredCommands = useMemo(() => {
    const query = cmdQuery.trim().toLowerCase();
    if (!query) return allItems;
    return allItems.filter(
      (item) => item.label.toLowerCase().includes(query) || item.href.toLowerCase().includes(query),
    );
  }, [allItems, cmdQuery]);

  const go = useCallback(
    (href: string) => {
      setCmdOpen(false);
      setCmdQuery('');
      setCmdSelected(0);
      setSideOpen(false);
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdOpen((open) => !open);
        setCmdQuery('');
        setCmdSelected(0);
      }
      if (event.key === 'Escape') {
        setCmdOpen(false);
        setSideOpen(false);
      }
      if (!cmdOpen) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCmdSelected((index) => Math.min(filteredCommands.length - 1, index + 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCmdSelected((index) => Math.max(0, index - 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const item = filteredCommands[cmdSelected];
        if (item) go(item.href);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cmdOpen, cmdSelected, filteredCommands, go]);

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    // Client islands re-read their own window (e.g. the overview period).
    window.dispatchEvent(new Event('admin:refresh'));
    window.setTimeout(() => setRefreshing(false), 900);
  };

  return (
    <div className="admin">
      <div className={`admin-scrim${sideOpen ? ' on' : ''}`} onClick={() => setSideOpen(false)} aria-hidden="true" />

      <aside className={`admin-side${sideOpen ? ' open' : ''}`} aria-label="Разделы админ-панели">
        <Link className="admin-brand" href="/admin">
          <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
            <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" stroke="#b7ff45" strokeOpacity=".35" />
            <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            3<em>set</em>
            <span className="dom mono">.online</span>
          </span>
          <span className="adm">admin</span>
        </Link>

        <div className="admin-side-scroll">
          {visibleGroups.map((group) => (
            <div className="admin-nav-group" key={group.title}>
              <div className="admin-nav-title">{group.title}</div>
              {group.items.map((item) => {
                const on = item.href === currentHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`admin-nav-item${on ? ' on' : ''}`}
                    aria-current={on ? 'page' : undefined}
                    onClick={() => setSideOpen(false)}
                  >
                    {item.icon}
                    {item.label}
                    {item.section === 'tickets' && unreadTickets > 0 && (
                      <span className="cnt hot">{unreadTickets > 99 ? '99+' : unreadTickets}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="admin-side-foot">
          <div className="admin-me">
            <span className="av">{(ROLE_LABELS[role] ?? 'Без роли').slice(0, 1).toUpperCase()}</span>
            <span className="t">
              <b>{ROLE_LABELS[role] ?? 'Без роли'}</b>
              <span>3set VPN</span>
            </span>
            <span className="pill ok">staff</span>
          </div>
          <Link className="btn btn-quiet sm block" href="/">
            <LogOut size={16} />
            Выйти в кабинет
          </Link>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-burger"
            onClick={() => setSideOpen((open) => !open)}
            aria-label="Меню"
            aria-expanded={sideOpen}
          >
            {sideOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="admin-title">
            <h1>{title}</h1>
            <div className="admin-crumb">
              <span>Админ-панель</span>
              <span>/</span>
              <b>{title}</b>
            </div>
          </div>

          <div className="admin-tb-spacer" />

          <button type="button" className="admin-search-btn" onClick={() => setCmdOpen(true)}>
            <Search size={15} />
            <span className="lb">Поиск…</span>
            <span className="kbd mono">⌘K</span>
          </button>

          {unreadTickets > 0 && (
            <Link className="admin-live" href="/admin/tickets">
              <i />
              {unreadTickets} новых
            </Link>
          )}

          <button type="button" className="admin-tb-btn" onClick={refresh} aria-label="Обновить данные">
            <RotateCcw size={17} style={refreshing ? { animation: 'admin-spin .9s linear infinite' } : undefined} />
          </button>
        </header>

        <div className="admin-content">{children}</div>
      </div>

      <div
        className={`admin-cmdk${cmdOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Переход по разделам"
        onClick={(event) => {
          if (event.target === event.currentTarget) setCmdOpen(false);
        }}
      >
        <div className="admin-cmdk-box">
          <div className="admin-cmdk-in">
            <Command size={17} />
            <input
              value={cmdQuery}
              onChange={(event) => {
                setCmdQuery(event.target.value);
                setCmdSelected(0);
              }}
              placeholder="Разделы админ-панели…"
              aria-label="Поиск раздела"
              autoFocus={cmdOpen}
            />
            <span className="kbd mono">esc</span>
          </div>
          <div className="admin-cmdk-list">
            {filteredCommands.length === 0 && (
              <div className="admin-cmdk-empty">Ничего не найдено по запросу «{cmdQuery.trim()}»</div>
            )}
            {filteredCommands.map((item, index) => (
              <button
                key={item.href}
                type="button"
                className={`admin-cmdk-item${index === cmdSelected ? ' on' : ''}`}
                onMouseEnter={() => setCmdSelected(index)}
                onClick={() => go(item.href)}
              >
                {item.icon}
                {item.label}
                <span className="h mono">{item.href}</span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
