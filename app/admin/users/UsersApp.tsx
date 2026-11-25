'use client';

// /admin/users — "Пользователи" (ADM-02). Template-faithful content surface:
// search + suggestions, quick-filter chips, stat cards, sortable paginated
// table with bulk selection, registration chart, user drawer, action modals,
// ⌘K palette and toasts.
//
// Every number and row comes from a real BFF: the list/search/filter/sort/
// pagination all read `/api/admin/users/directory`, the drawer reads
// `/api/admin/users/[id]` (profile / keys / payments / tickets), the role modal
// reads `/api/admin/roles` and posts role changes, and bonus days post to the
// ticket-compensation route of a real ticket. Actions that have no backend
// (block, delete, merge duplicates, create user, free-form email, unlink
// telegram) are rendered but DISABLED with an explicit note — never faked.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { AdminRole } from '@/lib/admin-auth';
import './users.css';

/* ------------------------------------------------------------------ types */

type Filter = 'all' | 'tg' | 'email' | 'new7' | 'keys' | 'staff' | 'test';
type SortKey = 'id' | 'created' | 'keys' | 'orders' | 'name';

interface Row {
  id: number;
  telegramId: string | null;
  email: string | null;
  username: string | null;
  displayName: string | null;
  keysCount: number;
  ordersCount: number;
  role: AdminRole | null;
  segment: string | null;
  createdAt: string;
  paidTotal: number;
  lastOrderAt: string | null;
  emailVerified: boolean;
  bonusDays: number;
  isTest: boolean;
}

interface Stats {
  total: number;
  telegram: number;
  emailOnly: number;
  new7: number;
  keys: number;
  staff: number;
  test: number;
}

interface SeriesPoint {
  date: string;
  count: number;
}

interface DirectoryResponse {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  stats: Stats;
  series: SeriesPoint[];
  truncated: boolean;
}

interface ProfileHeader {
  userId: number;
  telegramId: string | null;
  email: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: string;
  emailVerified: boolean;
  staffRole: AdminRole | null;
  referralCode: string | null;
  customInviterReward: number | null;
  customInviterKind: string | null;
  customSubdomain: string | null;
  passwordSet: boolean;
  trialUsed: boolean;
  bonusDays: number;
  paidOrders: number;
  paidTotal: number;
}

interface ProfileKey {
  id: string;
  name: string | null;
  isTrial: boolean;
  statusKind: 'active' | 'expiring' | 'expired' | 'pending' | 'unknown';
  expiresAt: string | null;
  devices: number | null;
  deviceLimit: number | null;
}

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  kind: string;
  keyId: string | null;
  createdAt: string;
  providerCost: number | null;
}

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  preview: string | null;
}

interface Profile {
  header: ProfileHeader;
  keys: { ok: true; rows: ProfileKey[] } | { ok: false };
  payments: { ok: true; rows: PaymentRow[] } | { ok: false };
  tickets: { ok: true; rows: TicketRow[] } | { ok: false };
}

interface RoleRow {
  name: string;
  description: string;
  users: number;
  maxUsers: number | null;
}

type DrawerTab = 'profile' | 'keys' | 'orders' | 'events';

/** Palette actions are declarative; the component dispatches them on click so
 *  no handler closure is built during render. */
type CmdAction = 'export' | 'tg' | 'email' | 'new7' | 'keys' | 'staff' | 'reset';

type ToastKind = '' | 'warn' | 'err';
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

/* ------------------------------------------------------------- formatting */

const nf = new Intl.NumberFormat('ru-RU');
const money = (n: number) => `${nf.format(Math.round(n))} ₽`;

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function shortDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

const ROLE_LABEL: Record<AdminRole, string> = {
  administrator: 'Администратор',
  manager: 'Менеджер',
  support: 'Поддержка',
  partner: 'Партнёр',
};

const ROLE_PILL: Record<AdminRole, string> = {
  administrator: 'pill role-admin',
  manager: 'pill info',
  support: 'pill ok',
  partner: 'pill role-partner',
};

const KEY_STATUS_LABEL: Record<ProfileKey['statusKind'], string> = {
  active: 'активен',
  expiring: 'истекает',
  expired: 'истёк',
  pending: 'ожидает',
  unknown: 'нет данных',
};

const KEY_STATUS_PILL: Record<ProfileKey['statusKind'], string> = {
  active: 'pill ok',
  expiring: 'pill warn',
  expired: 'pill bad',
  pending: 'pill info',
  unknown: 'pill dim',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'ожидает оплаты',
  paid: 'оплачен',
  provisioning: 'выдаётся',
  provisioned: 'выдан',
  failed: 'ошибка',
  canceled: 'отменён',
  refunded: 'возврат',
};

const ORDER_KIND_LABEL: Record<string, string> = {
  new: 'новый',
  renew: 'продление',
  upgrade: 'апгрейд',
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'открыт',
  answered: 'отвечен',
  closed: 'закрыт',
};

function titleOf(row: { displayName: string | null; email: string | null; id: number }): string {
  if (row.displayName) return row.displayName;
  if (row.email) return row.email.split('@')[0];
  return `Пользователь #${row.id}`;
}

function initialOf(text: string): string {
  return (text[0] ?? '?').toUpperCase();
}

/* ----------------------------------------------------------------- icons */

function Icon({ path, size = 16, width }: { path: string; size?: number; width?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={width ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g dangerouslySetInnerHTML={{ __html: path }} />
    </svg>
  );
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  user: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  tg: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m2 7 10 6 10-6"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  key: '<circle cx="15.5" cy="7.5" r="5.5"/><path d="m2 21 9.6-9.6"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  merge: '<path d="M8 3v4a2 2 0 0 0 2 2h9"/><path d="m17 5 4 4-4 4"/><path d="M16 21v-4a2 2 0 0 0-2-2H5"/><path d="m7 19-4-4 4-4"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
} as const;

/* --------------------------------------------------------------- helpers */

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows
    .map((cells) =>
      cells
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(';'),
    )
    .join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1600);
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim().replace(/^@/, '');
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
  );
}

/* ============================================================== component */

export default function UsersApp({
  initial,
  segment,
  callerTelegramId,
}: {
  initial: DirectoryResponse;
  segment?: string;
  callerTelegramId: number | null;
}) {
  const [data, setData] = useState<DirectoryResponse>(initial);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('id');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestSel, setSuggestSel] = useState(-1);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [modal, setModal] = useState<null | 'days' | 'role' | 'ticket'>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdSel, setCmdSel] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showTop, setShowTop] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const toastSeq = useRef(0);
  const queryRef = useRef<HTMLInputElement | null>(null);
  // Search is the only debounced trigger; every other control refetches at
  // once. The first render already has `initial`, so the mount effect is
  // skipped once to avoid a duplicate request on page load.
  const firstSearch = useRef(true);

  const toast = useCallback((message: string, kind: ToastKind = '') => {
    const id = (toastSeq.current += 1);
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  /* --------------------------------------------------------- data loading */

  const load = useCallback(
    async (options?: {
      q?: string; filter?: Filter; sort?: SortKey; dir?: 'asc' | 'desc';
      page?: number; pageSize?: number;
    }) => {
      const params = new URLSearchParams();
      const term = (options?.q ?? q).trim();
      if (term) params.set('q', term);
      const f = options?.filter ?? filter;
      if (f !== 'all') params.set('filter', f);
      params.set('sort', options?.sort ?? sort);
      params.set('dir', options?.dir ?? dir);
      params.set('page', String(options?.page ?? page));
      params.set('pageSize', String(options?.pageSize ?? pageSize));
      if (segment) params.set('segment', segment);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const next = await getJson<DirectoryResponse>(
        `/api/admin/users/directory?${params.toString()}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setLoading(false);
      if (!next) {
        toast('Не удалось загрузить список пользователей', 'err');
        return;
      }
      setData(next);
    },
    [filter, page, pageSize, q, segment, sort, dir, toast],
  );

  // Debounced search; filters/sort/page changes refetch immediately.
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void load({ q, page: 1 });
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
    // `load` is intentionally excluded: it already closes over the latest state
    // and re-running on its identity would double-fire every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const refetch = useCallback(
    (next?: Partial<{ filter: Filter; sort: SortKey; page: number; pageSize: number }>) => {
      void load(next);
    },
    [load],
  );

  function applyFilter(next: Filter) {
    setFilter(next);
    setPage(1);
    setSelected(new Set());
    void load({ filter: next, page: 1 });
  }

  // Clicking the active column flips the direction; a new column starts from
  // its natural order (names A→Z, everything else newest/largest first).
  function applySort(next: SortKey) {
    const nextDir: 'asc' | 'desc' =
      sort === next ? (dir === 'asc' ? 'desc' : 'asc') : next === 'name' ? 'asc' : 'desc';
    setSort(next);
    setDir(nextDir);
    setPage(1);
    void load({ sort: next, dir: nextDir, page: 1 });
  }

  function changePage(next: number) {
    setPage(next);
    void load({ page: next });
  }

  function resetAll() {
    setQ('');
    setFilter('all');
    setSort('id');
    setDir('desc');
    setPage(1);
    setSelected(new Set());
    setSuggestOpen(false);
    void load({ q: '', filter: 'all', sort: 'id', dir: 'desc', page: 1 });
    toast('Поиск и фильтры сброшены');
  }

  /* ------------------------------------------------------------- exporting */

  function exportRows(rows: Row[], name: string) {
    if (rows.length === 0) {
      toast('Нечего экспортировать', 'warn');
      return;
    }
    downloadCsv(name, [
      ['id', 'telegram_id', 'email', 'username', 'display_name', 'role', 'segment',
        'keys', 'orders', 'paid_total_rub', 'bonus_days', 'created_at', 'last_order_at'],
      ...rows.map((r) => [
        r.id, r.telegramId ?? '', r.email ?? '', r.username ?? '', r.displayName ?? '',
        r.role ?? 'клиент', r.segment ?? '', r.keysCount, r.ordersCount, r.paidTotal,
        r.bonusDays, r.createdAt.slice(0, 10), r.lastOrderAt?.slice(0, 10) ?? '',
      ]),
    ]);
    toast(`Экспортировано строк: ${rows.length}`);
  }

  /* ----------------------------------------------------------- selection */

  const selectedRows = useMemo(
    () => data.rows.filter((row) => selected.has(row.id)),
    [data.rows, selected],
  );

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const allSelected = data.rows.every((row) => prev.has(row.id));
      if (allSelected) return new Set();
      return new Set(data.rows.map((row) => row.id));
    });
  }

  /* -------------------------------------------------------------- ⌘K menu */

  // Command palette entries carry a `kind` only — the dispatch happens in the
  // click handler, so no ref-touching closure is created during render.
  const cmdTerm = cmdQuery.trim().toLowerCase();
  const allCmdActions: { kind: CmdAction; label: string; hint: string; icon: string }[] = [
    { kind: 'export', label: 'Экспорт текущей выборки', hint: `${data.rows.length} строк`, icon: 'download' },
    { kind: 'tg', label: 'Фильтр: с Telegram', hint: String(data.stats.telegram), icon: 'tg' },
    { kind: 'email', label: 'Фильтр: только email', hint: String(data.stats.emailOnly), icon: 'mail' },
    { kind: 'new7', label: 'Фильтр: новые за 7 дней', hint: String(data.stats.new7), icon: 'clock' },
    { kind: 'keys', label: 'Фильтр: с ключами', hint: String(data.stats.keys), icon: 'key' },
    { kind: 'staff', label: 'Фильтр: с ролью', hint: String(data.stats.staff), icon: 'shield' },
    { kind: 'reset', label: 'Показать всех', hint: 'сбросить', icon: 'refresh' },
  ];
  const cmdActions = allCmdActions.filter(
    (item) => !cmdTerm || item.label.toLowerCase().includes(cmdTerm),
  );

  const cmdUsers = data.rows
    .filter((row) => {
      if (!cmdTerm) return true;
      return [row.id, row.telegramId, row.email, row.displayName, row.username]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(cmdTerm.replace(/^@/, ''));
    })
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      label: titleOf(row),
      hint: row.telegramId ? `tg ${row.telegramId}` : (row.email ?? '—'),
    }));

  const flatCommands: number = cmdActions.length + cmdUsers.length;

  function runCommand(kind: CmdAction) {
    if (kind === 'export') exportRows(data.rows, '3set-users.csv');
    else if (kind === 'reset') resetAll();
    else applyFilter(kind);
  }

  /* keyboard: ⌘K / slash / escape */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdOpen((open) => !open);
        setCmdQuery('');
        setCmdSel(0);
        return;
      }
      if (event.key === '/' && !typing && !cmdOpen && drawerId === null && modal === null) {
        event.preventDefault();
        queryRef.current?.focus();
        return;
      }
      if (event.key === 'Escape') {
        setCmdOpen(false);
        setSuggestOpen(false);
        setModal(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cmdOpen, drawerId, modal]);

  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > 420);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (drawerId !== null || modal !== null || cmdOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerId, modal, cmdOpen]);

  /* ------------------------------------------------------------ rendering */

  const suggestions = data.rows.slice(0, 6);
  const pageNumbers = useMemo(() => {
    const total = data.pageCount;
    const current = data.page;
    const window = 5;
    let start = Math.max(1, current - 2);
    const end = Math.min(total, start + window - 1);
    start = Math.max(1, end - window + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [data.page, data.pageCount]);

  const stats = data.stats;
  const rangeFrom = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const rangeTo = Math.min(data.page * data.pageSize, data.total);
  const allOnPageSelected = data.rows.length > 0 && data.rows.every((row) => selected.has(row.id));

  return (
    <div className="adm-users">
      <div className="bg-fx" aria-hidden="true">
        <div className="grid" />
        <div className="blob b1" />
        <div className="blob b2" />
      </div>

      <div className="content">
        {/* ------------------------------------------------ header + search */}
        <div className="sec-head reveal in">
          <div className="t">
            <span className="kick">Управление доступом</span>
            <h2 className="st">Поиск пользователя</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13.4, maxWidth: '70ch' }}>
              Введите <span className="mono" style={{ color: 'var(--lime)' }}>@username</span>, email,
              Telegram ID или идентификатор ключа. Клик по строке открывает карточку пользователя.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" type="button" onClick={() => exportRows(data.rows, '3set-users.csv')}>
              <Icon path={ICONS.download} /> Экспорт
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => toast('Создание пользователя из панели не подключено: аккаунты регистрируются в кабинете или боте', 'warn')}
            >
              <Icon path={ICONS.plus} /> Добавить пользователя
            </button>
          </div>
        </div>

        {segment && (
          <div className="card reveal in" style={{ padding: '12px 16px' }}>
            <span className="hint">
              Показаны аккаунты сегмента <b className="mono" style={{ color: 'var(--lime)' }}>{segment}</b>.{' '}
              <Link href="/admin/users" style={{ color: 'var(--lime)' }}>Сбросить сегмент</Link>
            </span>
          </div>
        )}

        <div className="card reveal in" style={{ ['--d' as string]: '60ms' }}>
          <div className={`search-wrap${q ? ' has-q' : ''}`}>
            <div className="search-big">
              <Icon path={ICONS.search} size={20} width={2} />
              <input
                ref={queryRef}
                type="search"
                autoComplete="off"
                spellCheck={false}
                value={q}
                placeholder="@username, email, Telegram ID или ключ"
                aria-label="Поиск пользователя"
                onChange={(event) => {
                  const value = event.target.value;
                  setQ(value);
                  setSuggestOpen(value.trim().length > 0);
                  setSuggestSel(-1);
                }}
                onFocus={() => {
                  if (q.trim()) setSuggestOpen(true);
                }}
                onKeyDown={(event) => {
                  if (!suggestOpen) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setSuggestSel((i) => Math.min(suggestions.length - 1, i + 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setSuggestSel((i) => Math.max(0, i - 1));
                  } else if (event.key === 'Enter' && suggestSel >= 0) {
                    event.preventDefault();
                    const row = suggestions[suggestSel];
                    if (row) {
                      setDrawerId(row.id);
                      setSuggestOpen(false);
                    }
                  } else if (event.key === 'Escape') {
                    setSuggestOpen(false);
                  }
                }}
              />
              <span className="kbd mono">/</span>
              <button
                className="clr"
                type="button"
                aria-label="Очистить"
                onClick={() => {
                  setQ('');
                  setSuggestOpen(false);
                  queryRef.current?.focus();
                }}
              >
                <Icon path={ICONS.close} />
              </button>
            </div>

            {suggestOpen && (
              <div className="suggest open" role="listbox" aria-label="Подсказки">
                {suggestions.length === 0 ? (
                  <div className="sg-empty">
                    Совпадений нет. Проверьте @username, email, Telegram ID или ключ.
                  </div>
                ) : (
                  suggestions.map((row, index) => {
                    const title = titleOf(row);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={`sg${index === suggestSel ? ' sel' : ''}`}
                        role="option"
                        aria-selected={index === suggestSel}
                        onClick={() => {
                          setDrawerId(row.id);
                          setSuggestOpen(false);
                        }}
                      >
                        <span className={`sav${row.telegramId ? '' : ' no'}`}>{initialOf(title)}</span>
                        <span className="stx">
                          <b>{highlight(title, q)}</b>
                          <span>
                            {row.telegramId ? `tg ${row.telegramId}` : (row.email ?? '—')}
                          </span>
                        </span>
                        <span className="sid mono">#{row.id}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <div className="chips">
              {([
                ['all', 'Все', stats.total],
                ['tg', 'С Telegram', stats.telegram],
                ['email', 'Только email', stats.emailOnly],
                ['new7', 'Новые за 7 дней', stats.new7],
                ['keys', 'С ключами', stats.keys],
                ['staff', 'С ролью', stats.staff],
                ['test', 'Похожие на тестовые', stats.test],
              ] as [Filter, string, number][]).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className={`chip${filter === id ? ' on' : ''}`}
                  onClick={() => applyFilter(id)}
                >
                  {label} <span>{count}</span>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="select"
                value={sort}
                aria-label="Сортировка"
                onChange={(event) => applySort(event.target.value as SortKey)}
              >
                <option value="id">Сортировка: новые ID</option>
                <option value="created">По дате регистрации</option>
                <option value="keys">По числу ключей</option>
                <option value="orders">По заказам</option>
                <option value="name">По имени</option>
              </select>
              <select
                className="select"
                value={String(pageSize)}
                aria-label="Строк на странице"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setPageSize(next);
                  setPage(1);
                  void load({ pageSize: next, page: 1 });
                }}
              >
                <option value="10">10 строк</option>
                <option value="25">25 строк</option>
                <option value="50">50 строк</option>
                <option value="100">100 строк</option>
              </select>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------- stats */}
        <div className="stats reveal in" style={{ ['--d' as string]: '100ms' }}>
          {([
            ['Всего пользователей', stats.total, 'all', ICONS.user] as const,
            ['С Telegram', stats.telegram, 'tg', ICONS.tg] as const,
            ['Только email', stats.emailOnly, 'email', ICONS.mail] as const,
            ['Новые за 7 дней', stats.new7, 'new7', ICONS.clock] as const,
            ['Выдано ключей', stats.keys, 'keys', ICONS.key] as const,
            ['Похожие на тестовые', stats.test, 'test', ICONS.flask] as const,
          ]).map(([label, value, target, icon]) => (
            <div
              key={label}
              className={`mini${filter === target ? ' on' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => applyFilter(target as Filter)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') applyFilter(target as Filter);
              }}
            >
              <span className="ic">
                <Icon path={icon} size={22} width={1.8} />
              </span>
              <span className="lbl">{label}</span>
              <b>{value}</b>
              <div className="bar">
                <i style={{ width: `${stats.total === 0 ? 0 : Math.round((value / stats.total) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* ---------------------------------------------------------- table */}
        <div className="card reveal in" style={{ ['--d' as string]: '140ms' }}>
          <div className="tbl-tools">
            <div>
              <h3 className="sub">Найденные пользователи</h3>
              <p className="hint" style={{ margin: '4px 0 0' }}>
                {data.total === 0
                  ? 'Ничего не найдено'
                  : `Показано ${rangeFrom}–${rangeTo} из ${data.total}${q ? ` · запрос «${q}»` : ''}`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-quiet sm" type="button" onClick={resetAll}>
                <Icon path={ICONS.refresh} /> Сбросить
              </button>
              <button
                className="btn btn-ghost sm"
                type="button"
                disabled
                title="Слияние дублей требует отдельного подтверждённого бэкенда — не подключено"
              >
                <Icon path={ICONS.merge} /> Объединить дубли
              </button>
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 38 }}>
                    <input
                      type="checkbox"
                      className="cbx"
                      aria-label="Выбрать все на странице"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className={`sortable${sort === 'id' ? ' act' : ''}`} onClick={() => applySort('id')}>
                    ID<span className="ar">{sort === 'id' ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th className={`sortable${sort === 'name' ? ' act' : ''}`} onClick={() => applySort('name')}>
                    Пользователь<span className="ar">{sort === 'name' ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th>Telegram</th>
                  <th>Email</th>
                  <th className={`sortable${sort === 'keys' ? ' act' : ''}`} onClick={() => applySort('keys')}>
                    Ключи<span className="ar">{sort === 'keys' ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th className={`sortable${sort === 'orders' ? ' act' : ''}`} onClick={() => applySort('orders')}>
                    Заказы<span className="ar">{sort === 'orders' ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th>Роль</th>
                  <th>Сегмент</th>
                  <th className={`sortable${sort === 'created' ? ' act' : ''}`} onClick={() => applySort('created')}>
                    Создан<span className="ar">{sort === 'created' ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </th>
                  <th style={{ textAlign: 'right' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const title = titleOf(row);
                  const isSelected = selected.has(row.id);
                  const isSelf = callerTelegramId !== null && row.telegramId === String(callerTelegramId);
                  return (
                    <tr
                      key={row.id}
                      className={isSelected ? 'sel' : undefined}
                      onClick={() => setDrawerId(row.id)}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="cbx"
                          aria-label={`Выбрать ${title}`}
                          checked={isSelected}
                          onChange={() => toggleSelect(row.id)}
                        />
                      </td>
                      <td>
                        <span className="mono num" style={{ fontSize: 12, color: 'var(--lime)' }}>
                          {row.id}
                        </span>
                      </td>
                      <td>
                        <span className="who">
                          <span className={`av${row.telegramId ? ' tg' : ''}${row.displayName ? '' : ' no'}`}>
                            {initialOf(title)}
                          </span>
                          <span>
                            <b>{highlight(title, q)}</b>
                            <span>
                              {row.displayName
                                ? (row.email ? highlight(row.email, q) : (row.username ? `@${row.username}` : 'только Telegram'))
                                : `#${row.id} · без имени`}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        {row.telegramId ? (
                          <span className="mono" style={{ fontSize: 12 }}>{highlight(row.telegramId, q)}</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                      <td style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.email ? highlight(row.email, q) : <span className="dim">—</span>}
                      </td>
                      <td className="num">{row.keysCount}</td>
                      <td className="num">{row.ordersCount}</td>
                      <td>
                        {row.role ? (
                          <span className={ROLE_PILL[row.role]} style={{ padding: '3px 9px', fontSize: 10.6 }}>
                            {ROLE_LABEL[row.role]}
                          </span>
                        ) : (
                          <span className="dim">клиент</span>
                        )}
                        {isSelf && (
                          <span className="pill dim" style={{ padding: '3px 9px', fontSize: 10.6, marginLeft: 4 }}>
                            вы
                          </span>
                        )}
                      </td>
                      <td>
                        {row.segment ? (
                          <span className="pill dim" style={{ padding: '3px 9px', fontSize: 10.6 }}>
                            {row.segment}
                          </span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                        {row.isTest && (
                          <span className="pill warn" style={{ padding: '3px 9px', fontSize: 10.6, marginLeft: 4 }}>
                            тест
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="dim mono" style={{ fontSize: 11.5 }}>{fmtDate(row.createdAt)}</span>
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <span className="acts">
                          <button
                            className="ibtn"
                            type="button"
                            title="Открыть карточку"
                            aria-label="Открыть карточку"
                            onClick={() => setDrawerId(row.id)}
                          >
                            <Icon path={ICONS.eye} size={15} />
                          </button>
                          <button
                            className="ibtn"
                            type="button"
                            title="Начислить дни — через обращение пользователя"
                            aria-label="Начислить дни"
                            onClick={() => {
                              setSelected(new Set([row.id]));
                              setModal('days');
                            }}
                          >
                            <Icon path={ICONS.plus} size={15} />
                          </button>
                          <button
                            className="ibtn"
                            type="button"
                            title="Создать обращение от имени пользователя"
                            aria-label="Создать обращение"
                            onClick={() => {
                              setSelected(new Set([row.id]));
                              setModal('ticket');
                            }}
                          >
                            <Icon path={ICONS.chat} size={15} />
                          </button>
                          <button
                            className="ibtn dgr"
                            type="button"
                            disabled
                            title="Блокировка аккаунта не реализована в бэкенде"
                            aria-label="Заблокировать"
                          >
                            <Icon path={ICONS.ban} size={15} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {loading && (
            <p className="hint" style={{ marginTop: 10 }}>Обновляем список…</p>
          )}
          {data.truncated && (
            <p className="hint" style={{ marginTop: 10 }}>
              Размер страницы ограничен сверху — увеличьте значение до 100 строк.
            </p>
          )}

          {data.rows.length === 0 && !loading && (
            <div className="empty show">
              <span className="eic">
                <Icon path={ICONS.search} size={23} />
              </span>
              <b>Пользователь не найден</b>
              <p>
                Проверьте запрос: поддерживаются @username, email, Telegram ID и идентификаторы
                ключей вида <span className="mono">key_…</span>.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button className="btn btn-ghost sm" type="button" onClick={resetAll}>Сбросить фильтры</button>
              </div>
            </div>
          )}

          {selected.size > 0 && (
            <div className="bulk show">
              <b style={{ fontSize: 12.4 }}>Выбрано: {selected.size}</b>
              <button className="btn btn-quiet xs" type="button" onClick={() => setModal('days')}>
                Начислить дни
              </button>
              <button className="btn btn-quiet xs" type="button" onClick={() => setModal('role')}>
                Назначить роль
              </button>
              <button
                className="btn btn-quiet xs"
                type="button"
                onClick={() => exportRows(selectedRows, '3set-users-selected.csv')}
              >
                Экспорт выбранных
              </button>
              <button
                className="btn btn-danger xs"
                type="button"
                disabled
                title="Блокировка аккаунта не реализована в бэкенде"
              >
                Заблокировать
              </button>
              <button
                className="btn btn-quiet xs"
                type="button"
                style={{ marginLeft: 'auto' }}
                onClick={() => setSelected(new Set())}
              >
                Снять выделение
              </button>
            </div>
          )}

          <div className="pager">
            <span className="hint">
              {data.total === 0
                ? 'Нет строк'
                : `Страница ${data.page} из ${data.pageCount} · по ${data.pageSize}`}
            </span>
            <div className="pg">
              <button
                type="button"
                disabled={data.page === 1}
                onClick={() => changePage(data.page - 1)}
                aria-label="Предыдущая страница"
              >
                ←
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === data.page ? 'on' : undefined}
                  onClick={() => changePage(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={data.page === data.pageCount}
                onClick={() => changePage(data.page + 1)}
                aria-label="Следующая страница"
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------ chart */}
        <div className="card reveal in" style={{ ['--d' as string]: '60ms' }}>
          <div className="card-h">
            <div>
              <span className="kick">Активность</span>
              <h3 className="sub" style={{ marginTop: 6 }}>Регистрации за {data.series.length} дней</h3>
              <p>Столбцы — новые аккаунты по дням (UTC). Наведите, чтобы увидеть дату и количество.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="pill ok">
                <i />
                {data.series.reduce((sum, point) => sum + point.count, 0)} за период
              </span>
              <span className="pill dim">
                пик: <b style={{ marginLeft: 4 }}>{peakLabel(data.series)}</b>
              </span>
            </div>
          </div>
          <RegistrationChart series={data.series} />
        </div>
      </div>

      {/* -------------------------------------------------------- drawer */}
      {drawerId !== null && (
        <UserDrawer
          key={drawerId}
          userId={drawerId}
          callerTelegramId={callerTelegramId}
          onClose={() => setDrawerId(null)}
          onToast={toast}
          onOpenModal={(kind, id) => {
            setSelected(new Set([id]));
            setModal(kind);
          }}
        />
      )}

      {/* --------------------------------------------------------- modal */}
      {modal !== null && (
        <ActionModal
          kind={modal}
          rows={selectedRows.length > 0 ? selectedRows : data.rows}
          callerTelegramId={callerTelegramId}
          onClose={() => setModal(null)}
          onToast={toast}
          onDone={() => {
            setModal(null);
            setSelected(new Set());
            void refetch();
          }}
        />
      )}

      {/* ---------------------------------------------------------- ⌘K */}
      {cmdOpen && (
        <div className="cmdk open" onClick={(event) => event.target === event.currentTarget && setCmdOpen(false)}>
          <div className="cmdk-box">
            <div className="cmdk-in">
              <Icon path={ICONS.search} size={18} />
              <input
                autoFocus
                value={cmdQuery}
                placeholder="Поиск пользователя, команды, фильтры…"
                aria-label="Командная строка"
                onChange={(event) => {
                  setCmdQuery(event.target.value);
                  setCmdSel(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCmdSel((i) =>
                      Math.max(0, Math.min(flatCommands - 1, i + (event.key === 'ArrowDown' ? 1 : -1))),
                    );
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const action = cmdActions[cmdSel];
                    if (action) {
                      runCommand(action.kind);
                      setCmdOpen(false);
                    } else {
                      const user = cmdUsers[cmdSel - cmdActions.length];
                      if (user) {
                        setDrawerId(user.id);
                        setCmdOpen(false);
                      }
                    }
                  } else if (event.key === 'Escape') {
                    setCmdOpen(false);
                  }
                }}
              />
              <span className="kbd mono">esc</span>
            </div>
            <div className="cmdk-list">
              {flatCommands === 0 && <div className="cmdk-empty">Ничего не найдено</div>}
              {cmdActions.length > 0 && <div className="cmdk-g">Действия</div>}
              {cmdActions.map((item, index) => (
                <div
                  key={item.kind}
                  className={`cmdk-i${index === cmdSel ? ' on' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    runCommand(item.kind);
                    setCmdOpen(false);
                  }}
                >
                  <Icon path={ICONS[item.icon as keyof typeof ICONS] ?? ICONS.arrowUp} size={15} />
                  {item.label}
                  <span className="h">{item.hint}</span>
                </div>
              ))}
              {cmdUsers.length > 0 && <div className="cmdk-g">Пользователи</div>}
              {cmdUsers.map((item, index) => {
                const position = cmdActions.length + index;
                return (
                  <div
                    key={item.id}
                    className={`cmdk-i${position === cmdSel ? ' on' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setDrawerId(item.id);
                      setCmdOpen(false);
                    }}
                  >
                    <span className="cav">{initialOf(item.label)}</span>
                    {item.label}
                    <span className="h">{item.hint}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- toasts */}
      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast show${item.kind ? ` ${item.kind}` : ''}`}>
            <span className="ti">
              <Icon
                path={item.kind === 'err' ? ICONS.close : item.kind === 'warn' ? ICONS.warn : ICONS.check}
                size={14}
                width={2.4}
              />
            </span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>

      <button
        className={`to-top${showTop ? ' show' : ''}`}
        type="button"
        aria-label="Наверх"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <Icon path={ICONS.arrowUp} size={19} width={2.2} />
      </button>
    </div>
  );
}

function peakLabel(series: SeriesPoint[]): string {
  if (series.length === 0) return '—';
  let best = series[0];
  for (const point of series) if (point.count > best.count) best = point;
  return best.count === 0 ? '—' : `${shortDay(best.date)} · ${best.count}`;
}

/* ------------------------------------------------------------- chart */

function RegistrationChart({ series }: { series: SeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;
  const height = 190;
  const padLeft = 26;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 24;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const max = Math.max(1, ...series.map((point) => point.count));
  const slot = series.length === 0 ? innerW : innerW / series.length;
  const barWidth = slot * 0.66;

  if (series.length === 0) {
    return <p className="hint">Нет данных о регистрациях за период.</p>;
  }

  const gridLines = [0, 1, 2, 3].map((step) => {
    const y = padTop + (innerH * step) / 3;
    return { y, value: Math.round(max * (1 - step / 3)) };
  });
  const labelEvery = Math.max(1, Math.round(series.length / 9));

  return (
    <div className="chart-box">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ height: 190 }}
        role="img"
        aria-label="Регистрации по дням"
      >
        <g className="grid-l">
          {gridLines.map((line) => (
            <g key={line.y}>
              <line x1={padLeft} y1={line.y} x2={width - padRight} y2={line.y} />
              <text className="axis" x={padLeft - 6} y={line.y + 3.4} textAnchor="end">
                {line.value}
              </text>
            </g>
          ))}
        </g>
        {series.map((point, index) => {
          const cx = padLeft + slot * index + slot / 2;
          const barHeight = point.count ? Math.max(3, (point.count / max) * innerH) : 0;
          return (
            <g key={point.date}>
              {barHeight > 0 && (
                <rect
                  className="cbar"
                  x={cx - barWidth / 2}
                  y={padTop + innerH - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                >
                  <title>{`${shortDay(point.date)}: ${point.count}`}</title>
                </rect>
              )}
              {(index % labelEvery === 0 || index === series.length - 1) && (
                <text className="axis" x={cx} y={height - 7} textAnchor="middle">
                  {shortDay(point.date)}
                </text>
              )}
              <rect
                x={padLeft + slot * index}
                y={padTop}
                width={slot}
                height={innerH}
                fill="transparent"
                onPointerEnter={() => setHover(index)}
                onPointerLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        {hover !== null && (
          <line
            className="guide on"
            x1={padLeft + slot * hover + slot / 2}
            y1={padTop}
            x2={padLeft + slot * hover + slot / 2}
            y2={padTop + innerH}
          />
        )}
      </svg>
      {hover !== null && series[hover] && (
        <div
          className="tip show"
          style={{
            left: `${((padLeft + slot * hover + slot / 2) / width) * 100}%`,
            top: `${((padTop + innerH * 0.4) / height) * 100}%`,
          }}
        >
          {series[hover].count} рег.
          <span>{shortDay(series[hover].date)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- drawer */

function UserDrawer({
  userId,
  callerTelegramId,
  onClose,
  onToast,
  onOpenModal,
}: {
  userId: number;
  callerTelegramId: number | null;
  onClose: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onOpenModal: (kind: 'days' | 'role' | 'ticket', id: number) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>('profile');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  // The parent remounts this component per user (`key={userId}`), so `profile`
  // starts null and only ever moves forward here — no state reset in the body.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const body = await getJson<{ profile: Profile }>(`/api/admin/users/${userId}`);
      if (!alive) return;
      if (!body?.profile) {
        setFailed(true);
        return;
      }
      setProfile(body.profile);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const header = profile?.header ?? null;
  const title = header
    ? (header.displayName ?? header.email?.split('@')[0] ?? `Пользователь #${userId}`)
    : `Пользователь #${userId}`;
  const isSelf = callerTelegramId !== null && header?.telegramId === String(callerTelegramId);
  const keys = profile?.keys.ok ? profile.keys.rows : [];
  const payments = profile?.payments.ok ? profile.payments.rows : [];

  const events = useMemo(() => {
    if (!profile) return [] as { label: string; date: string }[];
    const head = profile.header;
    const keyRows = profile.keys.ok ? profile.keys.rows : [];
    const paymentRows = profile.payments.ok ? profile.payments.rows : [];
    const ticketRows = profile.tickets.ok ? profile.tickets.rows : [];
    const list: { label: string; date: string }[] = [
      { label: 'Регистрация аккаунта', date: head.createdAt },
    ];
    if (head.telegramId) list.push({ label: `Telegram ID ${head.telegramId} привязан`, date: head.createdAt });
    if (head.email && head.emailVerified) list.push({ label: `Email ${head.email} подтверждён`, date: head.createdAt });
    for (const key of keyRows) {
      list.push({
        label: `Ключ ${key.name ?? key.id} — ${KEY_STATUS_LABEL[key.statusKind]}`,
        date: key.expiresAt ?? head.createdAt,
      });
    }
    for (const payment of paymentRows.slice(0, 5)) {
      list.push({
        label: `Заказ ${payment.id.slice(0, 10)} · ${ORDER_STATUS_LABEL[payment.status] ?? payment.status} · ${money(payment.amount)}`,
        date: payment.createdAt,
      });
    }
    for (const ticket of ticketRows.slice(0, 5)) {
      list.push({
        label: `Обращение «${ticket.subject}» — ${TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}`,
        date: ticket.lastMessageAt,
      });
    }
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [profile]);

  return (
    <>
      <div
        className="scrim on"
        style={{ position: 'fixed', inset: 0, zIndex: 128 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="drawer open" role="dialog" aria-modal="true" aria-labelledby="admu-dr-title">
        <div className="dr-head">
          <span className="dr-av">{initialOf(title)}</span>
          <div className="dr-t">
            <h3 id="admu-dr-title">{title}</h3>
            <div className="dr-badges">
              <span className="pill dim mono">#{userId}</span>
              {header?.staffRole ? (
                <span className={ROLE_PILL[header.staffRole]}>{ROLE_LABEL[header.staffRole]}</span>
              ) : (
                <span className="pill dim">клиент</span>
              )}
              {header?.telegramId && <span className="pill info">Telegram</span>}
              {header?.email && <span className="pill info">Email</span>}
              {header?.bonusDays ? <span className="pill ok">+{header.bonusDays} бонусных дней</span> : null}
              {isSelf && <span className="pill warn">это вы</span>}
            </div>
          </div>
          <button className="icon-btn" type="button" aria-label="Закрыть" onClick={onClose}>
            <Icon path={ICONS.close} />
          </button>
        </div>

        <div className="dr-tabs">
          {(['profile', 'keys', 'orders', 'events'] as DrawerTab[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`dr-tab${tab === id ? ' on' : ''}`}
              onClick={() => setTab(id)}
            >
              {id === 'profile' ? 'Профиль' : id === 'keys' ? `Ключи${keys.length ? ` · ${keys.length}` : ''}` : id === 'orders' ? `Заказы${payments.length ? ` · ${payments.length}` : ''}` : 'События'}
            </button>
          ))}
        </div>

        <div className="dr-body">
          {failed && (
            <div className="empty show" style={{ padding: 26 }}>
              <span className="eic"><Icon path={ICONS.warn} size={22} /></span>
              <b>Не удалось загрузить карточку</b>
              <p>Профиль недоступен. Закройте и откройте карточку повторно.</p>
            </div>
          )}

          {!failed && !profile && <p className="hint">Загружаем карточку…</p>}

          {profile && tab === 'profile' && (
            <div className="dr-pane on">
              <div className="g3">
                <div className="stat-mini"><b>{keys.length}</b><span>ключей</span></div>
                <div className="stat-mini"><b>{header?.paidOrders ?? 0}</b><span>оплаченных заказов</span></div>
                <div className="stat-mini"><b>{money(header?.paidTotal ?? 0)}</b><span>выручка</span></div>
              </div>
              <div>
                <Kv k="ID" v={String(userId)} />
                <Kv k="Telegram ID" v={header?.telegramId ? <span className="mono">{header.telegramId}</span> : '—'} />
                <Kv k="Email" v={header?.email ?? '—'} />
                <Kv k="Email подтверждён" v={header?.email ? (header.emailVerified ? 'да' : 'нет') : '—'} />
                <Kv k="Username" v={header?.username ? <span className="mono">@{header.username}</span> : '—'} />
                <Kv k="Роль" v={header?.staffRole ? ROLE_LABEL[header.staffRole] : 'клиент'} />
                <Kv k="Пароль в кабинете" v={header?.passwordSet ? 'задан' : 'не задан'} />
                <Kv k="Пробный период" v={header?.trialUsed ? 'использован' : 'доступен'} />
                <Kv k="Бонусные дни" v={String(header?.bonusDays ?? 0)} />
                <Kv k="Реферальный код" v={header?.referralCode ? <span className="mono">{header.referralCode}</span> : '—'} />
                <Kv k="Личный поддомен" v={header?.customSubdomain ? `${header.customSubdomain}.3set.online` : '—'} />
                <Kv
                  k="Ставка рефералов"
                  v={header?.customInviterReward === null || header?.customInviterReward === undefined
                    ? 'глобальная'
                    : `${header.customInviterReward}${header.customInviterKind === 'percent' ? '%' : ' ₽'}`}
                />
                <Kv k="Регистрация" v={fmtDate(header?.createdAt ?? null)} />
                <Kv k="Последний заказ" v={fmtDate(payments[0]?.createdAt ?? null)} />
              </div>
              {!profile.keys.ok && <p className="hint bad">Список ключей недоступен — данные провайдера не ответили.</p>}
              {!profile.payments.ok && <p className="hint bad">История заказов недоступна.</p>}
              {!profile.tickets.ok && <p className="hint bad">Обращения недоступны.</p>}
            </div>
          )}

          {profile && tab === 'keys' && (
            <div className="dr-pane on">
              {!profile.keys.ok ? (
                <p className="hint bad">Список ключей недоступен — данные провайдера не ответили.</p>
              ) : keys.length === 0 ? (
                <div className="empty show" style={{ padding: 26 }}>
                  <span className="eic"><Icon path={ICONS.key} size={22} /></span>
                  <b>Ключей нет</b>
                  <p>У пользователя нет кэшированных ключей подписки.</p>
                </div>
              ) : (
                keys.map((key) => (
                  <div className="lrow" key={key.id}>
                    <span className="lic"><Icon path={ICONS.key} size={16} /></span>
                    <span className="lt">
                      <b>{key.name ?? 'Ключ без названия'}</b>
                      <span className="mono">{key.id}</span>
                      <span>
                        {key.expiresAt ? `до ${fmtDate(key.expiresAt)}` : 'без срока'} · устройств {key.devices ?? 0}/{key.deviceLimit ?? '—'}
                        {key.isTrial ? ' · пробный' : ''}
                      </span>
                    </span>
                    <span className={KEY_STATUS_PILL[key.statusKind]}>{KEY_STATUS_LABEL[key.statusKind]}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {profile && tab === 'orders' && (
            <div className="dr-pane on">
              {!profile.payments.ok ? (
                <p className="hint bad">История заказов недоступна.</p>
              ) : payments.length === 0 ? (
                <div className="empty show" style={{ padding: 26 }}>
                  <span className="eic"><Icon path={ICONS.card} size={22} /></span>
                  <b>Заказов нет</b>
                  <p>Пользователь ещё ничего не оплачивал.</p>
                </div>
              ) : (
                <div className="tbl-wrap" style={{ border: 'none' }}>
                  <table className="tbl" style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>Заказ</th>
                        <th>Дата</th>
                        <th>Тип</th>
                        <th>Статус</th>
                        <th style={{ textAlign: 'right' }}>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id} style={{ cursor: 'default' }}>
                          <td className="mono" style={{ fontSize: 11.5 }}>{payment.id.slice(0, 12)}</td>
                          <td className="dim">{fmtDate(payment.createdAt)}</td>
                          <td>{ORDER_KIND_LABEL[payment.kind] ?? payment.kind}</td>
                          <td>
                            <span className={`pill ${payment.status === 'provisioned' ? 'ok' : payment.status === 'failed' || payment.status === 'canceled' || payment.status === 'refunded' ? 'bad' : 'warn'}`}>
                              <i />
                              {ORDER_STATUS_LABEL[payment.status] ?? payment.status}
                            </span>
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>{money(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {profile && tab === 'events' && (
            <div className="dr-pane on">
              {events.length === 0 ? (
                <p className="hint">Событий нет.</p>
              ) : (
                <div className="tl">
                  {events.map((event, index) => (
                    <div className="tl-i" key={`${event.label}-${index}`}>
                      {event.label}
                      <span>{fmtDate(event.date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <button
              className="btn btn-primary sm block"
              type="button"
              onClick={() => onOpenModal('days', userId)}
            >
              <Icon path={ICONS.plus} /> Начислить дни подписки
            </button>
            <div className="g2">
              <button
                className="btn btn-ghost sm"
                type="button"
                disabled
                title="Роль выдаётся по Telegram ID на странице «Роли»"
                onClick={() => onToast('Смена роли доступна на странице «Роли» — роли привязаны к Telegram ID', 'warn')}
              >
                <Icon path={ICONS.shield} /> Роль
              </button>
              <button
                className="btn btn-ghost sm"
                type="button"
                onClick={() => onOpenModal('ticket', userId)}
              >
                <Icon path={ICONS.chat} /> Обращение
              </button>
            </div>
            {isSelf ? (
              <button className="btn btn-quiet sm block" type="button" disabled>
                Это ваш аккаунт — действия ограничены
              </button>
            ) : (
              <div className="g2">
                <button
                  className="btn btn-danger sm"
                  type="button"
                  disabled
                  title="Блокировка аккаунта не реализована в бэкенде"
                >
                  Заблокировать
                </button>
                <button
                  className="btn btn-danger sm"
                  type="button"
                  disabled
                  title="Удаление аккаунта не реализовано в бэкенде"
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

/* ------------------------------------------------------------- modals */

function ActionModal({
  kind,
  rows,
  callerTelegramId,
  onClose,
  onToast,
  onDone,
}: {
  kind: 'days' | 'role' | 'ticket';
  rows: Row[];
  callerTelegramId: number | null;
  onClose: () => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="overlay open"
      role="dialog"
      aria-modal="true"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-h">
          <h3>
            {kind === 'days' ? 'Начислить дни подписки' : kind === 'role' ? 'Назначить роль' : 'Обращение от имени пользователя'}
          </h3>
          <button className="icon-btn" type="button" aria-label="Закрыть" onClick={onClose}>
            <Icon path={ICONS.close} />
          </button>
        </div>

        {kind === 'days' && (
          <DaysForm
            rows={rows}
            busy={busy}
            setBusy={setBusy}
            onToast={onToast}
            onDone={onDone}
          />
        )}

        {kind === 'role' && (
          <RoleForm
            rows={rows}
            callerTelegramId={callerTelegramId}
            busy={busy}
            setBusy={setBusy}
            onToast={onToast}
            onDone={onDone}
          />
        )}

        {kind === 'ticket' && <TicketForm rows={rows} onClose={onClose} />}
      </div>
    </div>
  );
}

/** Bonus days are granted through a real ticket compensation (server-side
 *  serializable transaction). Without an open ticket there is no legal path,
 *  so the form explains that instead of inventing a direct write. */
function DaysForm({
  rows,
  busy,
  setBusy,
  onToast,
  onDone,
}: {
  rows: Row[];
  busy: boolean;
  setBusy: (value: boolean) => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onDone: () => void;
}) {
  const [days, setDays] = useState(7);
  const [ticketId, setTicketId] = useState('');
  const [reason, setReason] = useState('goodwill');
  const [comment, setComment] = useState('');
  const [tickets, setTickets] = useState<{ id: string; subject: string; status: string }[] | null>(null);

  const target = rows[0] ?? null;
  const loading = tickets === null;

  // The open-ticket list is fetched once per target; `null` doubles as the
  // loading marker so nothing has to be reset synchronously in the effect.
  useEffect(() => {
    if (!target) return;
    let alive = true;
    void (async () => {
      const body = await getJson<{ profile: { tickets: { ok: boolean; rows?: { id: string; subject: string; status: string }[] } } }>(
        `/api/admin/users/${target.id}`,
      );
      if (!alive) return;
      const list = body?.profile?.tickets;
      if (list?.ok && Array.isArray(list.rows)) {
        const open = list.rows.filter((t) => t.status !== 'closed');
        setTickets(open);
        if (open[0]) setTicketId(open[0].id);
      } else {
        setTickets([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [target]);

  async function submit() {
    if (!ticketId) {
      onToast('Нужно открытое обращение — начисление идёт через компенсацию по тикету', 'err');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tickets/${encodeURIComponent(ticketId)}/compensate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days,
          reason,
          comment: comment.trim() ? comment.trim() : undefined,
          requestId: crypto.randomUUID(),
        }),
      });
      if (!res.ok) {
        onToast(
          res.status === 404
            ? 'Обращение не найдено или нет прав'
            : res.status === 400
              ? 'Проверьте количество дней'
              : 'Не удалось начислить дни',
          'err',
        );
        return;
      }
      onToast(`Начислено ${days} дн. · пользователь #${target?.id}`);
      onDone();
    } catch {
      onToast('Сеть недоступна — повторите', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="muted" style={{ margin: '0 0 13px', fontSize: 13 }}>
        Пользователь:{' '}
        <b style={{ color: 'var(--lime)' }}>
          #{target?.id} · {target ? titleOf(target) : '—'}
        </b>
      </p>
      {loading && <p className="hint">Ищем обращения…</p>}
      {!loading && tickets !== null && tickets.length === 0 && (
        <div className="preview" style={{ marginBottom: 13 }}>
          У пользователя нет открытых обращений. Дни начисляются как компенсация по тикету —
          попросите пользователя создать обращение в поддержке, чтобы начисление прошло
          аудируемым путём.
        </div>
      )}
      {tickets !== null && tickets.length > 0 && (
        <div className="field">
          <label htmlFor="admu-days-ticket">Обращение</label>
          <select
            className="select"
            id="admu-days-ticket"
            value={ticketId}
            onChange={(event) => setTicketId(event.target.value)}
          >
            {tickets.map((ticket) => (
              <option key={ticket.id} value={ticket.id}>
                {ticket.subject} · {TICKET_STATUS_LABEL[ticket.status] ?? ticket.status}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label>Количество дней</label>
        <div className="stepper">
          <button className="step-btn" type="button" onClick={() => setDays((d) => Math.max(1, d - 1))} aria-label="Меньше">
            <Icon path={ICONS.minus} />
          </button>
          <input
            className="step-val mono"
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(event) => setDays(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
          />
          <button className="step-btn" type="button" onClick={() => setDays((d) => Math.min(30, d + 1))} aria-label="Больше">
            <Icon path={ICONS.plus} />
          </button>
        </div>
        <span className="hint">Лимит 1–30 дней за раз, до 90 дней на одно обращение.</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 13 }}>
        {[7, 14, 30].map((d) => (
          <button key={d} className="btn btn-quiet xs" type="button" style={{ flex: 1 }} onClick={() => setDays(d)}>
            +{d}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="admu-days-reason">Причина</label>
        <select
          className="select"
          id="admu-days-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        >
          <option value="outage">Сбой сервиса</option>
          <option value="slow_response">Долгий ответ</option>
          <option value="key_issue">Проблема с ключом</option>
          <option value="goodwill">Жест доброй воли</option>
          <option value="other">Другое</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="admu-days-comment">Комментарий (виден в истории)</label>
        <input
          className="input"
          id="admu-days-comment"
          value={comment}
          maxLength={500}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Компенсация за сбой 22.11"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost" type="button" onClick={onDone}>Отмена</button>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy || !ticketId}
          onClick={() => void submit()}
        >
          {busy ? 'Начисляем…' : 'Начислить'}
        </button>
      </div>
    </>
  );
}

/** Roles are keyed by Telegram id (the admin panel is Telegram-gated), so an
 *  email-only account cannot receive one — stated, not silently skipped. */
function RoleForm({
  rows,
  callerTelegramId,
  busy,
  setBusy,
  onToast,
  onDone,
}: {
  rows: Row[];
  callerTelegramId: number | null;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onToast: (message: string, kind?: ToastKind) => void;
  onDone: () => void;
}) {
  const [role, setRole] = useState<'client' | AdminRole>('partner');
  const [roles, setRoles] = useState<RoleRow[]>([]);

  useEffect(() => {
    void (async () => {
      const body = await getJson<{ roles: RoleRow[] }>('/api/admin/roles');
      if (body?.roles) setRoles(body.roles);
    })();
  }, []);

  const targets = rows.filter(
    (row) => row.telegramId !== null && row.telegramId !== String(callerTelegramId),
  );
  const skipped = rows.length - targets.length;

  async function submit() {
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const row of targets) {
      try {
        const res = await fetch('/api/admin/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramId: row.telegramId, role }),
        });
        if (res.ok) ok += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (ok > 0) onToast(`Роль обновлена: ${ok}${failed ? `, ошибок: ${failed}` : ''}`);
    else onToast('Роль не изменена — проверьте права и Telegram ID', 'err');
    onDone();
  }

  return (
    <>
      <p className="muted" style={{ margin: '0 0 13px', fontSize: 13 }}>
        К назначению: <b style={{ color: 'var(--lime)' }}>{targets.length}</b>
        {skipped > 0 && ` · пропущено ${skipped} (нет Telegram ID или это ваш аккаунт)`}
      </p>
      <div className="field">
        <label htmlFor="admu-role">Роль</label>
        <select
          className="select"
          id="admu-role"
          value={role}
          onChange={(event) => setRole(event.target.value as 'client' | AdminRole)}
        >
          <option value="client">Без роли (обычный клиент)</option>
          <option value="partner">Партнёр</option>
          <option value="support">Поддержка</option>
          <option value="manager">Менеджер</option>
          <option value="administrator">Администратор</option>
        </select>
      </div>
      <div className="preview">
        Роли выдаются по Telegram ID и дают доступ к админ-панели по матрице прав.
        {roles.length > 0 && (
          <>
            {' '}Сейчас в системе:{' '}
            {roles.map((row) => `${row.name} — ${row.users}`).join(', ')}.
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost" type="button" onClick={onDone}>Отмена</button>
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy || targets.length === 0}
          onClick={() => void submit()}
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </>
  );
}

/** There is no admin "create ticket for user" endpoint; the honest path is a
 *  pre-filled support request opened by the user. Nothing is written here. */
function TicketForm({
  rows,
  onClose,
}: {
  rows: Row[];
  onClose: () => void;
}) {
  const target = rows[0] ?? null;
  return (
    <>
      <p className="muted" style={{ margin: '0 0 13px', fontSize: 13 }}>
        Пользователь:{' '}
        <b style={{ color: 'var(--lime)' }}>#{target?.id} · {target ? titleOf(target) : '—'}</b>
      </p>
      <div className="preview" style={{ marginBottom: 13 }}>
        Создание обращения от имени пользователя бэкендом не поддерживается: тикет всегда
        создаётся самим пользователем (кабинет или бот). Откройте очередь{' '}
        <Link href="/admin/tickets" style={{ color: 'var(--lime)' }}>«Обращения»</Link>, чтобы ответить
        на существующий тикет.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Понятно</button>
        <Link className="btn btn-primary" href="/admin/tickets">Перейти к обращениям</Link>
      </div>
    </>
  );
}
