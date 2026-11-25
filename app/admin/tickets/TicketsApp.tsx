'use client';

// /admin/tickets — "Обращения" (ADM-01). Template-faithful content surface on
// real data only: KPI cards, 30-day activity chart, status donut, SLA panel,
// two-pane inbox (queue + thread), reply composer with canned templates, close
// and bonus-day compensation, ⌘K palette, toasts.
//
// Every number and row comes from a real BFF: the queue reads
// `/api/admin/tickets/directory`, the open thread reads
// `/api/admin/tickets/[id]`, and the writes go to the existing
// `/reply`, `/read`, `/close` and `/compensate` routes. Controls that have no
// backing endpoint (assign an agent, priority, internal notes, delete a ticket,
// create a ticket on a user's behalf, bulk actions) are rendered DISABLED with
// an explicit reason — never simulated.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  COMPENSATION_MAX_DAYS,
  COMPENSATION_REASONS,
  compensationReasonLabel,
  type CompensationReason,
} from '@/lib/ticket-compensation-reasons';
import { TICKET_TEMPLATES } from '@/lib/ticket-templates';
import './tickets.css';

/* ------------------------------------------------------------------ types */

type Filter = 'all' | 'unread' | 'open' | 'answered' | 'closed';
type SortKey = 'updated' | 'created' | 'sla' | 'alpha';
type ToastKind = '' | 'warn' | 'err';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface Requester {
  userId: number;
  displayName: string | null;
  username: string | null;
  email: string | null;
  telegramId: string | null;
}

interface TicketRow {
  id: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  unreadForAdmin: number;
  lastMessageAt: string;
  createdAt: string;
  preview: string | null;
  lastAuthor: 'user' | 'support';
  messageCount: number;
  waitingHours: number;
  firstResponseMinutes: number | null;
  requester: Requester;
}

interface Stats {
  total: number;
  open: number;
  answered: number;
  closed: number;
  unread: number;
  stale: number;
}

interface SeriesPoint {
  date: string;
  created: number;
  replies: number;
}

interface Sla {
  avgFirstResponseMinutes: number | null;
  medianFirstResponseMinutes: number | null;
  resolvedShare: number;
  staleCount: number;
  measured: number;
}

interface Directory {
  rows: TicketRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  stats: Stats;
  series: SeriesPoint[];
  sla: Sla;
}

interface ThreadMessage {
  id: string;
  author: 'user' | 'support';
  body: string | null;
  createdAt: string;
  attachments: Array<{
    id: string;
    mime: string;
    width: number | null;
    height: number | null;
    sizeBytes: number;
  }>;
}

interface Thread {
  id: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  unreadForUser: number;
  messages: ThreadMessage[];
  requester?: Requester;
}interface Header {
  userId: number;
  displayName: string | null;
  email: string | null;
  username: string | null;
  telegramId: string | null;
  createdAt: string;
  emailVerified: boolean;
  staffRole: string | null;
  trialUsed: boolean;
  bonusDays: number;
  paidOrders: number;
  paidTotal: number;
}

interface ThreadPayload {
  thread: Thread;
  header: Header | null;
  compensation: { used: number; maxDays: number } | null;
}

/* ------------------------------------------------------------- formatting */

const nf = new Intl.NumberFormat('ru-RU');

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function ago(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return 'только что';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} мин`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} ч`;
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)} дн`;
  return fmtDate(iso);
}

function humanMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
  const days = Math.floor(hours / 24);
  return `${days} дн ${hours % 24} ч`;
}

function initialOf(text: string | null | undefined): string {
  const value = (text ?? '').trim();
  return value.length === 0 ? '?' : value.charAt(0).toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Ждёт ответа',
  answered: 'Есть ответ',
  closed: 'Закрыто',
};

const STATUS_PILL: Record<string, string> = {
  open: 'warn',
  answered: 'ok',
  closed: 'dim',
};

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Все',
  unread: 'Непрочитанные',
  open: 'Ждут ответа',
  answered: 'Есть ответ',
  closed: 'Закрыто',
};

const SORT_LABEL: Record<SortKey, string> = {
  updated: 'Активность',
  created: 'Создано',
  sla: 'Дольше ждут',
  alpha: 'Тема',
};

function titleOf(requester: Requester): string {
  if (requester.displayName) return requester.displayName;
  if (requester.username) return `@${requester.username}`;
  if (requester.email) return requester.email.split('@')[0] ?? requester.email;
  if (requester.telegramId) return `tg ${requester.telegramId}`;
  return `Пользователь #${requester.userId}`;
}

function requesterLine(requester: Requester): string {
  const parts = [requester.username ? `@${requester.username}` : null, requester.email];
  return parts.filter((part): part is string => Boolean(part)).join(' · ');
}

/* ------------------------------------------------------------------ icons */

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
  check: '<path d="M20 6 9 17l-5-5"/>',
  warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gift: '<path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  user: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
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

async function postJson(url: string, payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function downloadCsv(rows: TicketRow[]) {
  const header = [
    'id', 'subject', 'status', 'requester', 'email', 'messages',
    'created_at', 'last_message_at', 'waiting_hours', 'first_response_min'
  ];
  const lines = rows.map((row) => [
    row.id,
    row.subject,
    row.status,
    row.requester.displayName ?? '',
    row.requester.email ?? '',
    row.messageCount,
    row.createdAt.slice(0, 10),
    row.lastMessageAt.slice(0, 19).replace('T', ' '),
    row.waitingHours,
    row.firstResponseMinutes ?? '',
  ]);
  const csv = [header, ...lines]
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
  a.download = '3set-tickets.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1600);
}

function highlight(text: string, query: string): ReactNode {
  const term = query.trim().replace(/^@/, '');
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={index}>{part}</mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/* ================================================================ component */

export default function TicketsApp({
  initial,
  view,
}: {
  initial: Directory;
  /** View state resolved from the URL so deep links seed the island. */
  view?: { q?: string; filter?: Filter; sort?: SortKey; dir?: 'asc' | 'desc' };
}) {
  const [data, setData] = useState<Directory>(initial);
  const [q, setQ] = useState(view?.q ?? '');
  const [filter, setFilter] = useState<Filter>(view?.filter ?? 'all');
  const [sort, setSort] = useState<SortKey>(view?.sort ?? 'updated');
  const [dir, setDir] = useState<'asc' | 'desc'>(view?.dir ?? 'desc');
  const [page, setPage] = useState(initial.page);
  const [loading, setLoading] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState<null | 'close' | 'days'>(null);
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState<CompensationReason>('goodwill');
  const [comment, setComment] = useState('');
  const [requestId, setRequestId] = useState('');

  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdSel, setCmdSel] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showTop, setShowTop] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const toastSeq = useRef(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);
  const firstSearch = useRef(true);

  const toast = useCallback((message: string, kind: ToastKind = '') => {
    const id = (toastSeq.current += 1);
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3600);
  }, []);

  /* --------------------------------------------------------- queue loading */

  const load = useCallback(
    async (options?: {
      q?: string;
      filter?: Filter;
      sort?: SortKey;
      dir?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }) => {
      const params = new URLSearchParams();
      const term = (options?.q ?? q).trim();
      if (term) params.set('q', term);
      const nextFilter = options?.filter ?? filter;
      if (nextFilter !== 'all') params.set('filter', nextFilter);
      params.set('sort', options?.sort ?? sort);
      params.set('dir', options?.dir ?? dir);
      params.set('page', String(options?.page ?? page));
      params.set('pageSize', String(options?.pageSize ?? data.pageSize));

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const next = await getJson<Directory>(
        `/api/admin/tickets/directory?${params.toString()}`,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setLoading(false);
      if (!next) {
        toast('Не удалось загрузить очередь обращений', 'err');
        return;
      }
      setData(next);
      // Keep the address bar shareable: the server page seeds from the same
      // params, so a copied link restores this exact view.
      if (typeof window !== 'undefined') {
        const view = new URLSearchParams();
        if (term) view.set('q', term);
        if (nextFilter !== 'all') view.set('filter', nextFilter);
        view.set('sort', options?.sort ?? sort);
        view.set('dir', options?.dir ?? dir);
        const currentPage = options?.page ?? page;
        if (currentPage > 1) view.set('page', String(currentPage));
        const search = view.toString();
        window.history.replaceState(
          null,
          '',
          search ? `${window.location.pathname}?${search}` : window.location.pathname,
        );
      }
    },
    [dir, filter, page, q, sort, toast, data.pageSize],
  );

  // Search is the only debounced trigger; everything else refetches at once.
  // The first render already carries the server page, so the mount pass skips.
  useEffect(() => {
    if (firstSearch.current) {
      firstSearch.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setPage(1);
      void load({ q, page: 1 });
    }, 320);
    return () => clearTimeout(timer);
    // `load` closes over the latest state; depending on it would re-fire each
    // keystroke twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function applyFilter(next: Filter) {
    setFilter(next);
    setPage(1);
    void load({ filter: next, page: 1 });
  }

  function applySort(next: SortKey) {
    // First click picks the natural direction for the key; clicking the active
    // key flips it. "Дольше ждут" and "Тема" read ascending by default.
    const natural: 'asc' | 'desc' = next === 'sla' || next === 'alpha' ? 'asc' : 'desc';
    const nextDir: 'asc' | 'desc' =
      sort === next ? (dir === 'asc' ? 'desc' : 'asc') : natural;
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
    setSort('updated');
    setDir('desc');
    setPage(1);
    void load({ q: '', filter: 'all', sort: 'updated', dir: 'desc', page: 1 });
    toast('Поиск и фильтры сброшены');
  }

  /* -------------------------------------------------------- thread loading */

  const loadThread = useCallback(
    async (id: string) => {
      setThreadLoading(true);
      const next = await getJson<ThreadPayload>(`/api/admin/tickets/${encodeURIComponent(id)}`);
      setThreadLoading(false);
      if (!next) {
        setThread(null);
        toast('Не удалось открыть обращение', 'err');
        return;
      }
      setThread(next);
    },
    [toast],
  );

  function openThread(row: TicketRow) {
    setOpenId(row.id);
    setThread(null);
    setReply('');
    setModal(null);
    void loadThread(row.id);
    // Opening a thread is the admin read: clear the unread counter, then let
    // the queue reflect it on the next refresh.
    if (row.unreadForAdmin > 0) {
      void postJson(`/api/admin/tickets/${encodeURIComponent(row.id)}/read`, {}).then((ok) => {
        if (!ok) return;
        setData((prev) => ({
          ...prev,
          rows: prev.rows.map((item) =>
            item.id === row.id ? { ...item, unreadForAdmin: 0 } : item,
          ),
          stats: { ...prev.stats, unread: Math.max(0, prev.stats.unread - 1) },
        }));
      });
    }
  }

  /** Refresh both panes after a write without losing the current view. */
  async function refreshAll(id: string | null) {
    await load({});
    if (id) await loadThread(id);
  }

  /* ------------------------------------------------------------------ writes */

  async function sendReply() {
    const id = openId;
    const body = reply.trim();
    if (!id || body.length === 0 || busy) return;
    setBusy(true);
    const ok = await postJson(`/api/admin/tickets/${encodeURIComponent(id)}/reply`, { body });
    setBusy(false);
    if (!ok) {
      toast('Не удалось отправить ответ. Текст сохранён.', 'err');
      return;
    }
    setReply('');
    toast('Ответ отправлен');
    await refreshAll(id);
  }

  async function markRead() {
    const id = openId;
    if (!id) return;
    const ok = await postJson(`/api/admin/tickets/${encodeURIComponent(id)}/read`, {});
    if (!ok) {
      toast('Не удалось отметить прочитанным', 'err');
      return;
    }
    toast('Отмечено прочитанным');
    await refreshAll(id);
  }

  async function confirmClose() {
    const id = openId;
    if (!id || busy) return;
    setBusy(true);
    const ok = await postJson(`/api/admin/tickets/${encodeURIComponent(id)}/close`, {});
    setBusy(false);
    setModal(null);
    if (!ok) {
      toast('Не удалось закрыть обращение', 'err');
      return;
    }
    toast('Обращение закрыто');
    await refreshAll(id);
  }

  async function confirmCompensate() {
    const id = openId;
    if (!id || busy) return;
    setBusy(true);
    const ok = await postJson(`/api/admin/tickets/${encodeURIComponent(id)}/compensate`, {
      days,
      reason,
      comment: comment.trim(),
      requestId,
    });
    setBusy(false);
    setModal(null);
    if (!ok) {
      toast('Не удалось начислить дни', 'err');
      return;
    }
    setComment('');
    toast(`Начислено ${days} бонусных дней`);
    await refreshAll(id);
  }

  function openCompensation() {
    setRequestId(
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    setDays(7);
    setReason('goodwill');
    setComment('');
    setModal('days');
  }

  /* -------------------------------------------------------------- ⌘K menu */

  const cmdTerm = cmdQuery.trim().toLowerCase();
  type Command = { kind: Filter | 'export' | 'reset'; label: string; hint: string; icon: string };
  const allCommands: Command[] = [
    { kind: 'export', label: 'Экспорт текущей страницы', hint: `${data.rows.length} строк`, icon: 'download' },
    { kind: 'unread', label: 'Фильтр: непрочитанные', hint: String(data.stats.unread), icon: 'inbox' },
    { kind: 'open', label: 'Фильтр: ждут ответа', hint: String(data.stats.open), icon: 'clock' },
    { kind: 'answered', label: 'Фильтр: есть ответ', hint: String(data.stats.answered), icon: 'chat' },
    { kind: 'closed', label: 'Фильтр: закрытые', hint: String(data.stats.closed), icon: 'check' },
    { kind: 'reset', label: 'Показать все обращения', hint: 'сбросить', icon: 'refresh' },
  ];
  const cmdActions = allCommands.filter(
    (item) => !cmdTerm || item.label.toLowerCase().includes(cmdTerm),
  );

  const cmdTickets = data.rows
    .filter((row) => {
      if (!cmdTerm) return true;
      return [row.subject, row.requester.displayName, row.requester.username, row.requester.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(cmdTerm.replace(/^@/, ''));
    })
    .slice(0, 8);

  const flatCommands = cmdActions.length + cmdTickets.length;

  function runCommand(kind: Filter | 'export' | 'reset') {
    if (kind === 'export') {
      if (data.rows.length === 0) {
        toast('Нечего экспортировать', 'warn');
        return;
      }
      downloadCsv(data.rows);
      toast(`Экспортировано строк: ${data.rows.length}`);
      return;
    }
    if (kind === 'reset') {
      resetAll();
      return;
    }
    applyFilter(kind);
  }

  /* --------------------------------------------------------------- effects */

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdOpen((open) => !open);
        setCmdQuery('');
        setCmdSel(0);
        return;
      }
      if (event.key === '/' && !typing && !cmdOpen && modal === null) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'Escape') {
        setCmdOpen(false);
        setModal(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cmdOpen, modal]);

  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > 420);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (modal !== null || cmdOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [modal, cmdOpen]);

  /* ------------------------------------------------------------ rendering */

  const stats = data.stats;
  const remaining = thread?.compensation
    ? Math.max(0, thread.compensation.maxDays - thread.compensation.used)
    : 0;
  const compensationValid =
    Number.isSafeInteger(days) && days >= 1 && days <= COMPENSATION_MAX_DAYS && days <= remaining;

  const openRow = useMemo(
    () => data.rows.find((row) => row.id === openId) ?? null,
    [data.rows, openId],
  );
  const activeThread = thread?.thread ?? null;
  const activeStatus = activeThread?.status ?? openRow?.status ?? 'open';
  const activeRequester = activeThread?.requester ?? openRow?.requester ?? null;

  return (
    <div className="adm-tk">
      <div className="bg-fx" aria-hidden="true">
        <div className="grid" />
        <div className="blob b1" />
        <div className="blob b2" />
      </div>

      <div className="content">
        {/* ------------------------------------------------------ header */}
        <div className="sec-head">
          <div className="t">
            <span className="kick">Поддержка · очередь обращений</span>
            <h2 className="st">Обращения</h2>
            <p className="muted" style={{ fontSize: 13.4, maxWidth: '72ch' }}>
              Поиск по теме, тексту, email или{' '}
              <span className="mono" style={{ color: 'var(--lime)' }}>@username</span>. Клик по строке
              открывает переписку — ответ, закрытие и компенсация днями в один клик.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                void load({});
                toast('Очередь обновлена');
              }}
            >
              <Icon path={ICONS.refresh} /> Обновить
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => runCommand('export')}
              title="CSV текущей страницы очереди"
            >
              <Icon path={ICONS.download} /> Экспорт
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled
              title="Создание обращения от имени клиента не подключено: обращения создаёт сам пользователь в кабинете или боте"
            >
              <Icon path={ICONS.plus} /> Новое обращение
            </button>
          </div>
        </div>

        {/* --------------------------------------------------------- KPI */}
        <div className="stats">
          <button
            type="button"
            className={`mini${filter === 'all' ? ' on' : ''}`}
            onClick={() => applyFilter('all')}
          >
            <span className="lbl">Всего</span>
            <b>{nf.format(stats.total)}</b>
            <span className="hint">за всё время</span>
          </button>
          <button
            type="button"
            className={`mini warn${filter === 'open' ? ' on' : ''}`}
            onClick={() => applyFilter('open')}
          >
            <span className="lbl">Ждут ответа</span>
            <b>{nf.format(stats.open)}</b>
            <span className="hint">без ответа поддержки</span>
          </button>
          <button
            type="button"
            className={`mini good${filter === 'answered' ? ' on' : ''}`}
            onClick={() => applyFilter('answered')}
          >
            <span className="lbl">Есть ответ</span>
            <b>{nf.format(stats.answered)}</b>
            <span className="hint">ждём реакции клиента</span>
          </button>
          <button
            type="button"
            className={`mini${filter === 'closed' ? ' on' : ''}`}
            onClick={() => applyFilter('closed')}
          >
            <span className="lbl">Закрыто</span>
            <b>{nf.format(stats.closed)}</b>
            <span className="hint">решено</span>
          </button>
          <button
            type="button"
            className={`mini bad${filter === 'unread' ? ' on' : ''}`}
            onClick={() => applyFilter('unread')}
          >
            <span className="lbl">Непрочитанные</span>
            <b>{nf.format(stats.unread)}</b>
            <span className="hint">новые сообщения клиентов</span>
          </button>
          <button
            type="button"
            className="mini bad"
            title="Показать открытые обращения, которые ждут дольше всех"
            onClick={() => {
              if (stats.stale === 0) {
                toast('Просроченных обращений нет');
                return;
              }
              setSort('sla');
              setDir('asc');
              setFilter('open');
              setPage(1);
              void load({ filter: 'open', sort: 'sla', dir: 'asc', page: 1 });
              toast(`Открытых без активности более 24 ч: ${stats.stale}`, 'warn');
            }}
          >
            <span className="lbl">Просрочено</span>
            <b>{nf.format(stats.stale)}</b>
            <span className="hint">открыты и молчат 24 ч+</span>
          </button>
        </div>

        {/* ------------------------------------------------ chart + SLA */}
        <div className="panels">
          <div className="card">
            <div className="card-h">
              <div>
                <h3 style={{ fontSize: 15 }}>Активность за 30 дней</h3>
                <p>Новые обращения и ответы поддержки по дням — из реальных дат создания.</p>
              </div>
            </div>
            <ActivityChart series={data.series} />
            <div className="legend">
              <span>
                <i className="a" /> Новые обращения
              </span>
              <span>
                <i className="b" /> Ответы поддержки
              </span>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <div>
                <h3 style={{ fontSize: 15 }}>Состояние очереди</h3>
                <p>Распределение по статусу и скорость первого ответа.</p>
              </div>
            </div>
            <div className="donut-wrap">
              <div className="donut-box">
                <StatusDonut stats={stats} />
                <div className="donut-txt">
                  <b>{nf.format(stats.total)}</b>
                  <span>всего</span>
                </div>
              </div>
              <div className="dlegend">
                <span className="row">
                  <i style={{ background: 'var(--amber)' }} /> Ждут ответа
                  <b>{stats.open}</b>
                </span>
                <span className="row">
                  <i style={{ background: 'var(--lime)' }} /> Есть ответ
                  <b>{stats.answered}</b>
                </span>
                <span className="row">
                  <i style={{ background: 'var(--dim)' }} /> Закрыто
                  <b>{stats.closed}</b>
                </span>
              </div>
            </div>

            <div className="sla-row" style={{ marginTop: 16 }}>
              <div className="sla-i">
                <span>Средний первый ответ</span>
                <b>{humanMinutes(data.sla.avgFirstResponseMinutes)}</b>
              </div>
              <div className="sla-i">
                <span>Медиана первого ответа</span>
                <b>{humanMinutes(data.sla.medianFirstResponseMinutes)}</b>
              </div>
              <div className="sla-i">
                <span>Доля решённых</span>
                <b>{data.sla.resolvedShare}%</b>
              </div>
              <div className="bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, Math.max(0, data.sla.resolvedShare))}%` }} />
              </div>
              <span className="hint">
                Замерено обращений: {data.sla.measured}. Просрочено сейчас: {data.sla.staleCount}.
              </span>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- inbox */}
        <div className="inbox">
          <div className="list-pane">
            <div className="list-head">
              <div className="row">
                <div className={`search-wrap${q ? ' has-q' : ''}`}>
                  <div className="search-big">
                    <Icon path={ICONS.search} size={17} />
                    <input
                      ref={searchRef}
                      type="search"
                      autoComplete="off"
                      spellCheck={false}
                      value={q}
                      placeholder="Тема, текст, email или @username"
                      aria-label="Поиск обращений"
                      onChange={(event) => setQ(event.target.value)}
                    />
                    <span className="kbd mono">/</span>
                    <button
                      className="clr"
                      type="button"
                      aria-label="Очистить"
                      onClick={() => {
                        setQ('');
                        searchRef.current?.focus();
                      }}
                    >
                      <Icon path={ICONS.close} size={15} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="sortbar" role="group" aria-label="Сортировка очереди">
                {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={sort === key ? 'on' : ''}
                    onClick={() => applySort(key)}
                    title="Повторный клик меняет направление"
                  >
                    {SORT_LABEL[key]}
                    {sort === key ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
                  </button>
                ))}
              </div>
              <div className="chips">
                {(Object.keys(FILTER_LABEL) as Filter[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`chip${filter === key ? ' on' : ''}`}
                    onClick={() => applyFilter(key)}
                  >
                    {FILTER_LABEL[key]}
                    <span>
                      {key === 'all'
                        ? stats.total
                        : key === 'unread'
                          ? stats.unread
                          : key === 'open'
                            ? stats.open
                            : key === 'answered'
                              ? stats.answered
                              : stats.closed}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rows">
              {loading && data.rows.length === 0 && (
                <>
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className="skel"
                      style={{ height: 62, marginBottom: 8 }}
                    />
                  ))}
                </>
              )}

              {!loading && data.rows.length === 0 && (
                <div className="empty">
                  <span className="eic">
                    <Icon path={ICONS.inbox} size={22} />
                  </span>
                  <b>Обращений нет</b>
                  <p>
                    {q || filter !== 'all'
                      ? 'По этому запросу ничего не найдено. Измените фильтр или текст поиска.'
                      : 'Как только пользователь напишет в поддержку, обращение появится здесь.'}
                  </p>
                </div>
              )}

              {data.rows.map((row) => {
                const isOpen = row.id === openId;
                const isStale = row.status === 'open' && row.waitingHours >= 24;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`row-i${isOpen ? ' on' : ''}${row.unreadForAdmin > 0 ? ' unread' : ''}`}
                    onClick={() => openThread(row)}
                  >
                    <span className={`rav${row.lastAuthor === 'user' ? ' user' : ''}`}>
                      {initialOf(titleOf(row.requester))}
                    </span>
                    <span className="rb">
                      <span className="rt">
                        <b>{highlight(row.subject, q)}</b>
                        <time>{ago(row.lastMessageAt)}</time>
                      </span>
                      <span className="rp">
                        {row.preview ? row.preview : 'Вложение без текста'}
                      </span>
                      <span className="rmeta">
                        {row.unreadForAdmin > 0 && <i className="dot" aria-label="Непрочитано" />}
                        <span className={`pill ${STATUS_PILL[row.status]}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                        {isStale && <span className="dim-s">просрочено</span>}
                        <span className="dim-s">{row.messageCount} сообщ.</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="list-foot">
              <span className="hint">
                {data.total === 0
                  ? '0 обращений'
                  : `${(data.page - 1) * data.pageSize + 1}–${Math.min(
                      data.page * data.pageSize,
                      data.total,
                    )} из ${data.total}`}
              </span>
              <div className="pg">
                <button
                  type="button"
                  disabled={data.page <= 1}
                  onClick={() => changePage(data.page - 1)}
                  aria-label="Предыдущая страница"
                >
                  ←
                </button>
                <button type="button" disabled className="on">
                  {data.page} / {data.pageCount}
                </button>
                <button
                  type="button"
                  disabled={data.page >= data.pageCount}
                  onClick={() => changePage(data.page + 1)}
                  aria-label="Следующая страница"
                >
                  →
                </button>
              </div>
            </div>
          </div>

          <div className="thread-pane">
            {openId === null && (
              <div className="th-empty">
                <span className="eic">
                  <Icon path={ICONS.chat} size={25} />
                </span>
                <b>Выберите обращение</b>
                <p>
                  Переписка, карточка клиента и действия появятся здесь. Ничего не выбрано —
                  очередь слева.
                </p>
              </div>
            )}

            {openId !== null && threadLoading && !activeThread && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="skel" style={{ height: 22, width: '55%' }} />
                <div className="skel" style={{ height: 70 }} />
                <div className="skel" style={{ height: 70, width: '78%' }} />
              </div>
            )}

            {activeThread && (
              <>
                <div className="th-head">
                  <div className="th-top">
                    <h3>{activeThread.subject}</h3>
                    <span className={`pill ${STATUS_PILL[activeStatus]}`}>
                      {STATUS_LABEL[activeStatus]}
                    </span>
                  </div>
                  <div className="th-who">
                    {activeRequester && (
                      <>
                        <span>
                          <Icon path={ICONS.user} size={13} />{' '}
                          <b style={{ color: 'var(--fg)' }}>{titleOf(activeRequester)}</b>
                        </span>
                        {requesterLine(activeRequester) && (
                          <span className="mono" style={{ fontSize: 11 }}>
                            {requesterLine(activeRequester)}
                          </span>
                        )}
                        <Link href={`/admin/users/${activeRequester.userId}`}>
                          Открыть профиль
                        </Link>
                      </>
                    )}
                    <Link
                      href={`/admin/tickets/${encodeURIComponent(activeThread.id)}`}
                      className="mono"
                      style={{ fontSize: 11 }}
                      title="Постоянная ссылка на обращение"
                    >
                      #{activeThread.id.slice(-8)}
                    </Link>
                    <span className="dim-s">создано {fmtDate(activeThread.messages[0]?.createdAt ?? '')}</span>
                  </div>
                  <div className="th-acts">
                    <button
                      className="btn btn-ghost xs"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (reply.trim().length === 0) {
                          replyRef.current?.focus();
                          toast('Напишите текст ответа в поле ниже', 'warn');
                          return;
                        }
                        void sendReply();
                      }}
                    >
                      <Icon path={ICONS.send} size={13} /> Ответить
                    </button>
                    <button
                      className="btn btn-quiet xs"
                      type="button"
                      onClick={() => void markRead()}
                    >
                      <Icon path={ICONS.check} size={13} /> Прочитано
                    </button>
                    <button
                      className="btn btn-quiet xs"
                      type="button"
                      disabled={thread?.compensation === null || remaining <= 0}
                      title={
                        thread?.compensation === null
                          ? 'У обращения нет привязанного клиента — компенсация недоступна'
                          : remaining <= 0
                            ? 'Лимит компенсаций по обращению исчерпан'
                            : 'Начислить бонусные дни'
                      }
                      onClick={openCompensation}
                    >
                      <Icon path={ICONS.gift} size={13} /> Дни
                    </button>
                    <button
                      className="btn btn-danger xs"
                      type="button"
                      disabled={activeStatus === 'closed'}
                      onClick={() => setModal('close')}
                    >
                      <Icon path={ICONS.close} size={13} /> Закрыть
                    </button>
                    <button
                      className="btn btn-quiet xs"
                      type="button"
                      disabled
                      title="Назначение агента не поддерживается: в схеме нет поля исполнителя"
                    >
                      Назначить
                    </button>
                    <button
                      className="btn btn-quiet xs"
                      type="button"
                      disabled
                      title="Приоритет не поддерживается: в схеме нет поля приоритета"
                    >
                      Приоритет
                    </button>
                  </div>
                </div>

                {thread?.header && (
                  <div className="cl-card">
                    <div className="cl-grid">
                      <div>
                        <span className="lbl">Бонусные дни</span>
                        <b>{nf.format(thread.header.bonusDays)}</b>
                      </div>
                      <div>
                        <span className="lbl">Оплат</span>
                        <b>{nf.format(thread.header.paidOrders)}</b>
                      </div>
                      <div>
                        <span className="lbl">Оплачено</span>
                        <b>{nf.format(thread.header.paidTotal)} ₽</b>
                      </div>
                      <div>
                        <span className="lbl">Регистрация</span>
                        <b>{fmtDate(thread.header.createdAt)}</b>
                      </div>
                    </div>
                    <div className="cl-tags">
                      <span className={`pill ${thread.header.emailVerified ? 'ok' : 'warn'}`}>
                        {thread.header.emailVerified ? 'email подтверждён' : 'email не подтверждён'}
                      </span>
                      {thread.header.trialUsed && <span className="pill dim">trial использован</span>}
                      {thread.header.staffRole && (
                        <span className="pill info">staff: {thread.header.staffRole}</span>
                      )}
                      {thread.header.telegramId && (
                        <span className="pill dim mono">tg {thread.header.telegramId}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="msgs">
                  {activeThread.messages.map((message) => (                    <div key={message.id} className={`msg ${message.author}`}>
                      <div className="bubble">
                        {message.body ?? '—'}
                        {message.attachments.length > 0 && (
                          <div className="atts">
                            {message.attachments.map((attachment) => (
                              <a
                                key={attachment.id}
                                href={`/api/tickets/${encodeURIComponent(activeThread.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                                target="_blank"
                                rel="noreferrer"
                                title={`${attachment.mime} · ${Math.round(attachment.sizeBytes / 1024)} КБ`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/tickets/${encodeURIComponent(activeThread.id)}/attachments/${encodeURIComponent(attachment.id)}`}
                                  alt="Вложение обращения"
                                  loading="lazy"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="meta">
                        {message.author === 'support' ? 'Поддержка' : activeRequester ? titleOf(activeRequester) : 'Клиент'}{' '}
                        · {fmtTime(message.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="composer">
                  <div className="macros">
                    {TICKET_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="macro"
                        title="Вставить текст в поле ответа"
                        onClick={() =>
                          setReply((prev) => (prev.trim() ? `${prev}\n\n${template.body}` : template.body))
                        }
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <div className="crow">
                    <div className="field">
                      <label htmlFor="ticket-reply">Ответ клиенту</label>
                      <textarea
                        id="ticket-reply"
                        ref={replyRef}
                        className="textarea"
                        value={reply}
                        maxLength={4000}
                        placeholder="Напишите ответ — он уйдёт в кабинет и бот клиента."
                        onChange={(event) => setReply(event.target.value)}
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={busy || reply.trim().length === 0}
                      onClick={() => void sendReply()}
                    >
                      {busy ? <span className="spinner" /> : <Icon path={ICONS.send} size={15} />}
                      Отправить
                    </button>
                  </div>
                  <span className="hint">
                    Вложений нет: админский ответ принимает только текст. Для скриншотов клиент
                    пишет в кабинет.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------- modals */}
      <div
        className={`overlay${modal !== null ? ' open' : ''}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) setModal(null);
        }}
      >
        {modal === 'close' && (
          <div className="modal" role="dialog" aria-modal="true" aria-label="Закрыть обращение">
            <div className="modal-h">
              <h3>Закрыть обращение?</h3>
              <button
                className="icon-btn"
                type="button"
                aria-label="Закрыть окно"
                onClick={() => setModal(null)}
              >
                <Icon path={ICONS.close} size={15} />
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              Клиент сможет ответить и открыть обращение заново. Закрытие не удаляет переписку.
            </p>
            <div className="modal-foot">
              <button className="btn btn-quiet sm" type="button" onClick={() => setModal(null)}>
                Отмена
              </button>
              <button
                className="btn btn-danger sm"
                type="button"
                disabled={busy}
                onClick={() => void confirmClose()}
              >
                {busy ? <span className="spinner w" /> : null} Закрыть
              </button>
            </div>
          </div>
        )}

        {modal === 'days' && thread?.compensation && (
          <div className="modal" role="dialog" aria-modal="true" aria-label="Начислить бонусные дни">
            <div className="modal-h">
              <h3>Начислить бонусные дни</h3>
              <button
                className="icon-btn"
                type="button"
                aria-label="Закрыть окно"
                onClick={() => setModal(null)}
              >
                <Icon path={ICONS.close} size={15} />
              </button>
            </div>

            <p className="muted" style={{ fontSize: 12.6 }}>
              Дни появятся на балансе бонусов клиента. По этому обращению начислено{' '}
              <b style={{ color: 'var(--lime)' }}>
                {thread.compensation.used} из {thread.compensation.maxDays}
              </b>
              .
            </p>

            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="comp-days">Дней</label>
              <div className="stepper">
                <button
                  className="step-btn"
                  type="button"
                  aria-label="Меньше"
                  disabled={days <= 1}
                  onClick={() => setDays((value) => Math.max(1, value - 1))}
                >
                  <Icon path={ICONS.minus} size={16} />
                </button>
                <input
                  id="comp-days"
                  className="step-val"
                  inputMode="numeric"
                  value={String(days)}
                  onChange={(event) => {
                    const next = Number(event.target.value.replace(/[^0-9]/g, '').slice(0, 2));
                    setDays(Number.isFinite(next) ? next : 1);
                  }}
                />
                <button
                  className="step-btn"
                  type="button"
                  aria-label="Больше"
                  disabled={days >= Math.min(COMPENSATION_MAX_DAYS, remaining)}
                  onClick={() =>
                    setDays((value) => Math.min(Math.min(COMPENSATION_MAX_DAYS, remaining), value + 1))
                  }
                >
                  <Icon path={ICONS.plus} size={16} />
                </button>
              </div>
              <div className="quick-days">
                {[1, 3, 7, 14, 30].map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    disabled={quick > remaining}
                    onClick={() => setDays(quick)}
                  >
                    {quick}
                  </button>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginTop: 13 }}>
              <label htmlFor="comp-reason">Причина</label>
              <select
                id="comp-reason"
                className="select"
                value={reason}
                onChange={(event) => setReason(event.target.value as CompensationReason)}
              >
                {COMPENSATION_REASONS.map((option) => (
                  <option key={option} value={option}>
                    {compensationReasonLabel(option)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ marginTop: 13 }}>
              <label htmlFor="comp-comment">Комментарий (необязательно)</label>
              <textarea
                id="comp-comment"
                className="textarea"
                style={{ minHeight: 72 }}
                maxLength={500}
                value={comment}
                onChange={(event) => setComment(event.target.value.slice(0, 500))}
              />
            </div>

            <div className="preview" style={{ marginTop: 13 }}>
              Клиенту будет начислено <b>{compensationValid ? days : '—'}</b> бонусных дней.
              Причина: <b>{compensationReasonLabel(reason)}</b>.
            </div>

            <div className="modal-foot">
              <button className="btn btn-quiet sm" type="button" onClick={() => setModal(null)}>
                Отмена
              </button>
              <button
                className="btn btn-primary sm"
                type="button"
                disabled={busy || !compensationValid}
                onClick={() => void confirmCompensate()}
              >
                {busy ? <span className="spinner" /> : null} Начислить
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ ⌘K */}
      <div
        className={`cmdk${cmdOpen ? ' open' : ''}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) setCmdOpen(false);
        }}
      >
        <div className="cmdk-box" role="dialog" aria-modal="true" aria-label="Командная строка">
          <div className="cmdk-in">
            <Icon path={ICONS.search} size={18} />
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              value={cmdQuery}
              placeholder="Поиск обращения, команды, фильтры…"
              aria-label="Командная строка"
              onChange={(event) => {
                setCmdQuery(event.target.value);
                setCmdSel(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setCmdSel((index) =>
                    Math.max(
                      0,
                      Math.min(flatCommands - 1, index + (event.key === 'ArrowDown' ? 1 : -1)),
                    ),
                  );
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  const action = cmdActions[cmdSel];
                  if (action) {
                    runCommand(action.kind);
                    setCmdOpen(false);
                  } else {
                    const row = cmdTickets[cmdSel - cmdActions.length];
                    if (row) {
                      openThread(row);
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
              <button
                key={item.kind}
                type="button"
                className={`cmdk-i${index === cmdSel ? ' on' : ''}`}
                onClick={() => {
                  runCommand(item.kind);
                  setCmdOpen(false);
                }}
              >
                <Icon path={ICONS[item.icon as keyof typeof ICONS] ?? ICONS.chat} size={15} />
                {item.label}
                <span className="h">{item.hint}</span>
              </button>
            ))}
            {cmdTickets.length > 0 && <div className="cmdk-g">Обращения</div>}
            {cmdTickets.map((row, index) => {
              const position = cmdActions.length + index;
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`cmdk-i${position === cmdSel ? ' on' : ''}`}
                  onClick={() => {
                    openThread(row);
                    setCmdOpen(false);
                  }}
                >
                  <span className="cav">{initialOf(titleOf(row.requester))}</span>
                  {row.subject}
                  <span className="h">{STATUS_LABEL[row.status]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------- toasts */}
      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast show${item.kind ? ` ${item.kind}` : ''}`}>
            <span className="ti">
              <Icon
                path={
                  item.kind === 'err' ? ICONS.close : item.kind === 'warn' ? ICONS.warn : ICONS.check
                }
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

/* ------------------------------------------------------------------ chart */

function ActivityChart({ series }: { series: SeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;
  const height = 190;
  const padLeft = 26;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 24;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  if (series.length === 0) {
    return <p className="hint">Нет данных об обращениях за период.</p>;
  }

  const max = Math.max(1, ...series.map((point) => Math.max(point.created, point.replies)));
  const slot = innerW / series.length;
  const barWidth = Math.max(2, slot * 0.32);
  const gridLines = [0, 1, 2, 3].map((step) => ({
    y: padTop + (innerH * step) / 3,
    value: Math.round(max * (1 - step / 3)),
  }));
  const labelEvery = Math.max(1, Math.round(series.length / 8));

  return (
    <div className="chart-box">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ height: 190 }}
        role="img"
        aria-label="Новые обращения и ответы поддержки по дням"
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
          const center = padLeft + slot * index + slot / 2;
          const createdHeight = point.created ? Math.max(3, (point.created / max) * innerH) : 0;
          const repliesHeight = point.replies ? Math.max(3, (point.replies / max) * innerH) : 0;
          return (
            <g key={point.date}>
              {createdHeight > 0 && (
                <rect
                  className="cbar"
                  x={center - barWidth - 1}
                  y={padTop + innerH - createdHeight}
                  width={barWidth}
                  height={createdHeight}
                  rx={3}
                  fill="rgba(183,255,69,.62)"
                >
                  <title>{`${shortDay(point.date)}: новых ${point.created}`}</title>
                </rect>
              )}
              {repliesHeight > 0 && (
                <rect
                  className="cbar"
                  x={center + 1}
                  y={padTop + innerH - repliesHeight}
                  width={barWidth}
                  height={repliesHeight}
                  rx={3}
                  fill="rgba(99,215,200,.55)"
                >
                  <title>{`${shortDay(point.date)}: ответов ${point.replies}`}</title>
                </rect>
              )}
              {(index % labelEvery === 0 || index === series.length - 1) && (
                <text className="axis" x={center} y={height - 7} textAnchor="middle">
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
      </svg>
      {hover !== null && series[hover] && (
        <div
          className="tip show"
          style={{
            left: `${((padLeft + slot * hover + slot / 2) / width) * 100}%`,
            top: `${((padTop + innerH * 0.35) / height) * 100}%`,
          }}
        >
          {series[hover].created} / {series[hover].replies}
          <span>
            {shortDay(series[hover].date)} · новые / ответы
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ donut */

function StatusDonut({ stats }: { stats: Stats }) {
  const total = Math.max(1, stats.total);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const segments: Array<{ value: number; color: string }> = [
    { value: stats.open, color: 'var(--amber)' },
    { value: stats.answered, color: 'var(--lime)' },
    { value: stats.closed, color: 'var(--dim)' },
  ];

  let offset = 0;
  return (
    <svg className="donut" viewBox="0 0 132 132" role="img" aria-label="Распределение обращений по статусу">
      <circle className="trk" cx="66" cy="66" r={radius} />
      {segments.map((segment, index) => {
        const length = (segment.value / total) * circumference;
        const dash = `${length} ${circumference - length}`;
        const element = (
          <circle
            key={index}
            cx="66"
            cy="66"
            r={radius}
            stroke={segment.color}
            strokeDasharray={dash}
            strokeDashoffset={-offset}
          />
        );
        offset += length;
        return element;
      })}
    </svg>
  );
}
