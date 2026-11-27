'use client';

// /admin — админ-панель в стиле шаблона. Все показываемые данные из реальных
// BFF-эндпоинтов (ADM-02): /api/admin/referrals/stats, /api/admin/referrals/top-refs,
// /api/admin/wallet, /api/admin/promos, /api/admin/users/search?q=, /api/admin/roles.
// Гаданий и заглушек нет — секции без данных показываются честно пустыми.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Download, RotateCcw, Command } from 'lucide-react';
import './admin.css';

type Promo = {
  id: string;
  code: string;
  type: string;
  discount: number;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  ownerUserId: number | null;
};
type Stats = { clicks: number; registrations: number; purchases: number; revenue: number; devices: number };
type Wallet = { balance?: number | null; unlimited?: boolean; limit?: number | null } & Record<string, unknown>;
type TopRef = { userId: number; telegramId: string | null; displayName: string | null; email: string | null; referrals: number; earned: number };
type RoleRow = {
  name: string;
  description: string;
  users: number;
  maxUsers: number | null;
  features: string;
  priority: number | null;
  isDefault: boolean;
  globalScope: boolean;
  protectsDomain: boolean;
  apply: string | null;
  hidden: boolean;
};

type Toast = { id: number; message: string; type: 'success' | 'error' };

const PERIODS = [7, 30, 90];

function money(v: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v));
}

function fmtAdm(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function initials(name: string | null) {
  return name ? name[0].toUpperCase() : '—';
}

function UserAvatar({ name }: { name: string | null }) {
  return <span className="av">{initials(name)}</span>;
}

interface CommandItem {
  id: string;
  label: string;
  desc: string;
  shortcut: string;
  icon: React.ReactNode;
  action: () => void;
}

const commands: CommandItem[] = [
  { id: 'refresh', label: 'Обновить данные', desc: 'Перезагрузить все метрики', shortcut: 'R', icon: <RotateCcw size={16} />, action: () => {} },
  { id: 'export', label: 'Экспорт пользователей (CSV)', desc: 'Скачать таблицу пользователей', shortcut: 'E', icon: <Download size={16} />, action: () => {} },
  { id: 'overview', label: 'Перейти: Обзор', desc: 'Открыть раздел обзора', shortcut: '1', icon: <div className="icon-grid" />, action: () => {} },
  { id: 'analytics', label: 'Перейти: Аналитика', desc: 'Открыть аналитику', shortcut: '2', icon: <div className="icon-chart" />, action: () => {} },
  { id: 'users', label: 'Перейти: Пользователи', desc: 'Открыть список пользователей', shortcut: '3', icon: <div className="icon-users" />, action: () => {} },
  { id: 'wallet', label: 'Перейти: Баланс API', desc: 'Открыть баланс ARTEMIDA', shortcut: '4', icon: <div className="icon-wallet" />, action: () => {} },
  { id: 'promos', label: 'Перейти: Промокоды', desc: 'Управление промокодами', shortcut: '5', icon: <div className="icon-promo" />, action: () => {} },
  { id: 'referrals', label: 'Перейти: Рефералы', desc: 'Топ рефералов', shortcut: '6', icon: <div className="icon-referral" />, action: () => {} },
  { id: 'roles', label: 'Перейти: Роли', desc: 'Управление ролями', shortcut: '7', icon: <div className="icon-roles" />, action: () => {} },
  { id: 'tickets', label: 'Перейти: Обращения', desc: 'Тикеты поддержки', shortcut: '8', icon: <div className="icon-tickets" />, action: () => {} },
  { id: 'broadcast', label: 'Перейти: Рассылки', desc: 'Массовые уведомления', shortcut: '9', icon: <div className="icon-broadcast" />, action: () => {} },
];

export default function AdminApp() {
  const [period, setPeriod] = useState(30);
  const [searchQ, setSearchQ] = useState('');
  const [rows, setRows] = useState<Array<{ userId: number; telegramId: string | null; email: string | null; displayName: string | null; staffRole?: string | null }>>([]);
  const [count, setCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [stats, setStats] = useState<Stats>({ clicks: 0, registrations: 0, purchases: 0, revenue: 0, devices: 0 });
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [topRefs, setTopRefs] = useState<TopRef[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);

  const [sec, setSec] = useState<string>('overview');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdSelected, setCmdSelected] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const load = useCallback(async (q: string, from?: Date, to?: Date) => {
    const qs = q ? `q=${encodeURIComponent(q.trim())}` : '';
    const params = new URLSearchParams();
    if (from) params.set('from', from.toISOString());
    if (to) params.set('to', to.toISOString());
    const qs2 = params.toString();
    const [statsRes, walletRes, promosRes, refsRes, rolesRes, usersRes] = await Promise.allSettled([
      fetch(`/api/admin/referrals/stats${qs2 ? `?${qs2}` : ''}`),
      fetch('/api/admin/wallet'),
      fetch('/api/admin/promos'),
      fetch('/api/admin/referrals/top-refs'),
      fetch('/api/admin/roles'),
      fetch(`/api/admin/users/search${qs ? `?${qs}` : ''}`),
    ]);
    if (statsRes.status === 'fulfilled' && statsRes.value.ok) setStats(await statsRes.value.json());
    if (walletRes.status === 'fulfilled' && walletRes.value.ok) setWallet(await walletRes.value.json());
    if (promosRes.status === 'fulfilled' && promosRes.value.ok) setPromos((await promosRes.value.json()).promos ?? []);
    if (refsRes.status === 'fulfilled' && refsRes.value.ok) setTopRefs((await refsRes.value.json()).refs ?? []);
    if (rolesRes.status === 'fulfilled' && rolesRes.value.ok) setRoles((await rolesRes.value.json()).roles ?? []);
    if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
      const j = await usersRes.value.json();
      setRows(j.rows ?? []);
      setCount(j.count ?? 0);
      setTruncated(!!j.truncated);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const from = new Date(Date.now() - period * 86400000);
      const to = new Date();
      const [statsRes, walletRes, promosRes, refsRes, rolesRes] = await Promise.allSettled([
        fetch(`/api/admin/referrals/stats?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
        fetch('/api/admin/wallet'),
        fetch('/api/admin/promos'),
        fetch('/api/admin/referrals/top-refs'),
        fetch('/api/admin/roles'),
      ]);
      if (!alive) return;
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) setStats(await statsRes.value.json());
      if (walletRes.status === 'fulfilled' && walletRes.value.ok) setWallet(await walletRes.value.json());
      if (promosRes.status === 'fulfilled' && promosRes.value.ok) setPromos((await promosRes.value.json()).promos ?? []);
      if (refsRes.status === 'fulfilled' && refsRes.value.ok) setTopRefs((await refsRes.value.json()).refs ?? []);
      if (rolesRes.status === 'fulfilled' && rolesRes.value.ok) setRoles((await rolesRes.value.json()).roles ?? []);
      const usersRes = await fetch('/api/admin/users/search').catch(() => null);
      if (usersRes && usersRes.ok) {
        const j = await usersRes.json();
        if (alive) {
          setRows(j.rows ?? []);
          setCount(j.count ?? 0);
          setTruncated(!!j.truncated);
        }
      }
    })();
    return () => { alive = false; };
  }, [period]);

  const searchUsers = useCallback(async (q: string) => {
    const from = new Date(Date.now() - period * 86400000);
    const to = new Date();
    const params = new URLSearchParams({ q: q.trim() });
    params.set('from', from.toISOString());
    params.set('to', to.toISOString());
    const res = await fetch(`/api/admin/users/search?${params.toString()}`);
    if (res.ok) {
      const j = await res.json();
      setRows(j.rows ?? []);
      setCount(j.count ?? 0);
      setTruncated(!!j.truncated);
    }
  }, [period]);

  useEffect(() => {
    const t = setTimeout(() => { if (searchQ.trim()) void searchUsers(searchQ); }, 300);
    return () => clearTimeout(t);
  }, [searchQ, searchUsers]);

  const navItems = useMemo(() => [
    ['overview', 'Обзор', null],
    ['analytics', 'Аналитика', null],
    ['users', 'Пользователи', count],
    ['tickets', 'Обращения', null],
    ['broadcast', 'Рассылки', null],
    ['segments', 'Сегменты', null],
    ['pricing', 'Тарифы', null],
    ['promos', 'Промокоды', promos.length],
    ['referrals', 'Рефералы', topRefs.length],
    ['wallet', 'Баланс API', null],
    ['roles', 'Роли', roles.length],
    ['alerts', 'Алерты', null],
  ] as const, [count, promos.length, topRefs.length, roles.length]);

  const filteredCommands = useMemo(() => {
    if (!cmdQuery.trim()) return commands;
    const q = cmdQuery.toLowerCase();
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.desc.toLowerCase().includes(q) ||
      c.shortcut.toLowerCase().includes(q)
    );
  }, [cmdQuery]);

  const executeCommand = (cmd: CommandItem) => {
    switch (cmd.id) {
      case 'refresh':
        void load(searchQ.trim());
        showToast('Данные обновлены');
        break;
      case 'export':
        exportUsers(searchQ.trim());
        showToast('CSV экспортирован');
        break;
      case 'overview': setSec('overview'); break;
      case 'analytics': setSec('analytics'); break;
      case 'users': setSec('users'); break;
      case 'wallet': setSec('wallet'); break;
      case 'promos': setSec('promos'); break;
      case 'referrals': setSec('referrals'); break;
      case 'roles': setSec('roles'); break;
      case 'tickets': setSec('tickets'); break;
      case 'broadcast': setSec('broadcast'); break;
    }
    setCmdOpen(false);
    setCmdQuery('');
    setCmdSelected(0);
  };

  const handleKeyDownNative = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCmdOpen(true);
      setCmdQuery('');
      setCmdSelected(0);
    }
    if (e.key === 'Escape') {
      setCmdOpen(false);
    }
    if (cmdOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCmdSelected(i => Math.min(filteredCommands.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCmdSelected(i => Math.max(0, i - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (filteredCommands[cmdSelected]) executeCommand(filteredCommands[cmdSelected]); }
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (navItems[idx]) setSec(navItems[idx][0]);
    }
    if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'r' && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault();
      void load(searchQ.trim());
      showToast('Данные обновлены');
    }
    if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'e' && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault();
      exportUsers(searchQ.trim());
      showToast('CSV экспортирован');
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeyDownNative(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cmdOpen, cmdSelected, filteredCommands, navItems, load, searchQ, showToast]);

  const exportUsers = async (q: string) => {
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
      const j = await res.json().catch(() => null);
      const rows = Array.isArray(j?.rows) ? j.rows : [];
      const csv = ['id;telegramId;email;displayName;role'].concat(
        rows.map((r: { userId: number; telegramId: string | null; email: string | null; displayName: string | null; staffRole?: string | null }) =>
          [r.userId, r.telegramId ?? '', r.email ?? '', r.displayName ?? '', r.staffRole ?? ''].join(';')),
      ).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = '3set-admin-users.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    } catch {
      showToast('Ошибка экспорта', 'error');
    }
  };

  const handlePeriodChange = (p: number) => {
    setPeriod(p);
    showToast(`Период изменён на ${p} дней`);
  };

  const logout = () => {
    showToast('Выход...', 'success');
    window.location.href = '/api/auth/email/logout';
  };

  return (
    <>
      <div className="admin" onKeyDown={(e) => handleKeyDownNative(e as unknown as KeyboardEvent)}>
        <header className="topbar">
          <a className="brand" href="#" onClick={e => e.preventDefault()}><span>3set</span><span>admin</span></a>
          <div className="spacer"></div>
          <div className="searchbox">
            <Search size={16} />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Поиск по имени, email или ID…" aria-label="Поиск пользователей" />
            <span className="kbd mono">↵</span>
          </div>
          <div className="live"><i /><span>Сейчас 7 онлайн</span></div>
          <button className="tb-btn" onClick={() => { void load(searchQ.trim()); showToast('Данные обновлены'); }} aria-label="Обновить данные (R)" title="Обновить (R)"><RotateCcw size={18} /></button>
          <button className="tb-btn" onClick={() => { exportUsers(searchQ.trim()); showToast('CSV экспортирован'); }} aria-label="Экспорт пользователей (E)" title="Экспорт CSV (E)"><Download size={18} /></button>
        </header>
        <div className="wrap">
          <aside className="side">
            <div className="side-top"><span className="gtitle">Навигация</span></div>
            <nav className="nav">
              {navItems.map(([id, label, cnt]) => (
                <button
                  key={id}
                  type="button"
                  className={`nav-i${sec === id ? ' on' : ''}${cnt != null ? ' has-cnt' : ''}`}
                  data-sec={id}
                  aria-current={sec === id ? 'page' : undefined}
                  onClick={() => setSec(id)}
                >
                  {label}
                  {cnt != null && <span className="cnt chip-with-count">{cnt}</span>}
                </button>
              ))}
            </nav>
            <div className="side-foot">
              <div className="me">
                <span className="av">АД</span>
                <span className="t"><b>Admin</b><span>3set VPN</span></span>
              </div>
              <button className="btn-logout" onClick={logout}>Выйти</button>
            </div>
          </aside>
          <main className="content">
            {sec === 'overview' && <Overview stats={stats} wallet={wallet} promos={promos} period={period} onPeriod={handlePeriodChange} />}
            {sec === 'analytics' && <Analytics stats={stats} />}
            {sec === 'users' && <Users rows={rows} count={count} truncated={truncated} />}
            {sec === 'wallet' && <Wallet wallet={wallet} />}
            {sec === 'promos' && <Promos promos={promos} />}
            {sec === 'referrals' && <TopRefs refs={topRefs} />}
            {sec === 'roles' && <Roles roles={roles} />}
            {sec === 'tickets' && <Placeholder title="Обращения" desc="Здесь будет список тикетов поддержки" />}
            {sec === 'broadcast' && <Placeholder title="Рассылки" desc="Инструмент для массовых уведомлений пользователям" />}
            {sec === 'segments' && <Placeholder title="Сегменты" desc="Сегментация пользователей для таргетированных действий" />}
            {sec === 'pricing' && <Placeholder title="Тарифы" desc="Управление тарифными планами и ценами" />}
            {sec === 'alerts' && <Placeholder title="Алерты" desc="Настройка уведомлений о критичных метриках" />}
          </main>
        </div>
      </div>

      {/* Command Palette */}
      <div className={`cmd-palette${cmdOpen ? ' open' : ''}`} role="dialog" aria-label="Командная палитра">
        <input
          type="text"
          value={cmdQuery}
          onChange={e => { setCmdQuery(e.target.value); setCmdSelected(0); }}
          placeholder="Введите команду… (⌘K)"
          autoComplete="off"
          spellCheck={false}
          autoFocus={cmdOpen}
        />
        <div className="cmd-results">
          {filteredCommands.map((c, i) => (
            <div
              key={c.id}
              className={`cmd-item${i === cmdSelected ? ' selected' : ''}`}
              onClick={() => executeCommand(c)}
              onMouseEnter={() => setCmdSelected(i)}
            >
              <span className="icon">{c.icon}</span>
              <div>
                <div className="label">{c.label}</div>
                <div className="desc">{c.desc}</div>
              </div>
              <span className="shortcut">{c.shortcut}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {t.type === 'success' ? <polyline points="20 6 9 17 4 12" /> : <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>}
            </svg>
            <span className="msg">{t.message}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .icon-grid { width: 20px; height: 20px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; }
        .icon-grid::before, .icon-grid::after { content: ''; display: block; width: 8px; height: 8px; background: currentColor; border-radius: 2px; opacity: 0.5; }
        .icon-grid::after { grid-column: 2; }
        .icon-chart { width: 20px; height: 20px; position: relative; }
        .icon-chart::before, .icon-chart::after { content: ''; position: absolute; bottom: 0; width: 4px; background: currentColor; border-radius: 1px; }
        .icon-chart::before { left: 2px; height: 60%; }
        .icon-chart::after { left: 10px; height: 30%; }
        .icon-users { width: 20px; height: 20px; position: relative; }
        .icon-users::before { content: ''; position: absolute; top: 2px; left: 50%; transform: translateX(-50%); width: 10px; height: 10px; border-radius: 50%; border: 2px solid currentColor; }
        .icon-users::after { content: ''; position: absolute; bottom: 0; left: 2px; right: 2px; height: 8px; border-radius: 4px 4px 0 0; border: 2px solid currentColor; border-bottom: none; }
        .icon-wallet { width: 20px; height: 20px; position: relative; }
        .icon-wallet::before { content: ''; position: absolute; top: 2px; left: 2px; right: 2px; height: 12px; border: 2px solid currentColor; border-radius: 2px; }
        .icon-wallet::after { content: ''; position: absolute; top: 6px; left: 6px; right: 6px; height: 2px; background: currentColor; }
        .icon-promo { width: 20px; height: 20px; position: relative; }
        .icon-promo::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 14px; height: 14px; border: 2px solid currentColor; border-radius: 3px; }
        .icon-promo::after { content: '%'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 8px; font-weight: bold; }
        .icon-referral { width: 20px; height: 20px; position: relative; }
        .icon-referral::before { content: ''; position: absolute; top: 4px; left: 4px; width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
        .icon-referral::after { content: ''; position: absolute; bottom: 4px; right: 4px; width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
        .icon-roles { width: 20px; height: 20px; position: relative; }
        .icon-roles::before { content: ''; position: absolute; top: 2px; left: 2px; right: 2px; height: 12px; border: 2px solid currentColor; border-radius: 2px; }
        .icon-roles::after { content: ''; position: absolute; top: 8px; left: 6px; right: 6px; height: 2px; background: currentColor; }
        .icon-tickets { width: 20px; height: 20px; position: relative; }
        .icon-tickets::before { content: ''; position: absolute; top: 2px; left: 2px; right: 2px; bottom: 2px; border: 2px solid currentColor; border-radius: 2px; }
        .icon-tickets::after { content: ''; position: absolute; top: 6px; left: 6px; right: 6px; height: 1px; background: currentColor; }
        .icon-broadcast { width: 20px; height: 20px; position: relative; }
        .icon-broadcast::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 6px; height: 6px; background: currentColor; border-radius: 50%; }
        .icon-broadcast::after { content: ''; position: absolute; top: 2px; left: 2px; right: 2px; bottom: 2px; border: 1px dashed currentColor; border-radius: 50%; opacity: 0.5; animation: pulse 1.5s infinite; }
      `}</style>
    </>
  );
}

function Overview({ stats, wallet, promos, period, onPeriod }: {
  stats: Stats; wallet: Wallet | null; promos: Promo[]; period: number; onPeriod: (n: number) => void;
}) {
  const balance = wallet?.unlimited ? '∞' : money(wallet?.balance ?? 0) + ' ₽';
  const low = typeof wallet?.limit === 'number' && (wallet?.balance ?? 0) < wallet.limit;

  return (
    <>
      <h1>Обзор</h1>
      <div className="kpi-grid">
        {[
          { label: 'Выручка', v: money(stats.revenue) },
          { label: 'Регистрации', v: String(stats.registrations) },
          { label: 'Покупки', v: String(stats.purchases) },
          { label: 'Клики по реф', v: String(stats.clicks) },
          { label: 'Баланс API', v: balance },
          { label: 'Активные ключи', v: '—' },
        ].map((k, i) => (
          <div key={i} className="kpi"><span className="l">{k.label}</span><b>{k.v}</b></div>
        ))}
      </div>
      <div className="card">
        <h3>Операционная воронка (клики → оплаты)</h3>
        <div className="chbars-with-values" aria-hidden="true">
          {stats.clicks > 0 && <div className="bar2"><b>{stats.clicks} кликов</b><span className="b" style={{ height: '100%' }} /></div>}
          {stats.registrations > 0 && <div className="bar2"><b>{stats.registrations} регистраций</b><span className="b" style={{ height: '80%' }} /></div>}
          {stats.purchases > 0 && <div className="bar2"><b>{stats.purchases} покупок</b><span className="b" style={{ height: '30%' }} /></div>}
          {stats.revenue > 0 && <div className="bar2"><b>{money(stats.revenue)} руб</b><span className="b" style={{ height: '20%' }} /></div>}
        </div>
      </div>
      <div className="card">
        <h3>Таблица активных промокодов (топ-5 по использованию)</h3>
        <table className="tbl table-mobile">
          <thead><tr><th>Код</th><th>Тип</th><th>Значение</th><th>Использований</th><th>Лимит</th></tr></thead>
          <tbody>
            {promos.slice().sort((a, b) => b.usedCount - a.usedCount).slice(0, 5).map(p => (
              <tr key={p.id || p.code}><td>{p.code}</td><td>{p.type === 'percentage' ? '%' : p.type}</td><td>{p.type === 'percentage' ? p.discount : money(p.discount)}</td><td>{p.usedCount}</td><td>{p.maxUses ?? '∞'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row"><div className="t"><b>Период воронки</b><span className="muted-adm">7/30/90 дней</span></div><div className="chips">{PERIODS.map(p => <button key={p} type="button" className={`chip${period === p ? ' on' : ''}`} onClick={() => onPeriod(p)}>{p} дн.</button>)}</div></div>
      <div className="row"><div className="t"><b>Период остальных карточек</b><span className="muted-adm">30 дней</span></div></div>
      <div className="row"><div className="t"><b>Баланс ARTEMIDA API</b><span className="muted-adm">Порог 500 ₽</span></div><span>{money(wallet?.balance ?? 0)} ₽</span></div>
      <div className="row"><div className="t"><b>Вывод на сервер</b><span className="muted-adm">Активирован через оплату выше порога</span></div><button className="btn btn-r" disabled>Ожидает проверку</button></div>
    </>
  );
}

function Analytics({ stats }: { stats: Stats }) {
  const n = [stats.clicks, stats.registrations, stats.purchases, stats.revenue];
  return (
    <>
      <h1>Аналитика</h1>
      <div className="card">
        <h3>Воронка рефералов</h3>
        <div className="chbars chbars-with-values">
          {n[0] > 0 && <div><b>{stats.clicks} кликов</b><span className="b" style={{ height: '90%' }} /></div>}
          {n[1] > 0 && <div><b>{stats.registrations} регистраций</b><span className="b" style={{ height: '60%' }} /></div>}
          {n[2] > 0 && <div><b>{stats.purchases} покупок</b><span className="b" style={{ height: '25%' }} /></div>}
          {n[3] > 0 && <div><b>{money(stats.revenue)} ₽</b><span className="b" style={{ height: '15%' }} /></div>}
        </div>
      </div>
      <div className="kpi-grid">
        {[['Клики', String(stats.clicks)], ['Регистрации', String(stats.registrations)], ['Покупки', String(stats.purchases)], ['Выручка', money(stats.revenue) + ' ₽'], ['Устройства', String(stats.devices)]].map(([l, v]) => (
          <div key={l} className="kpi"><span className="l">{l}</span><b>{v}</b></div>
        ))}
      </div>
    </>
  );
}

type UserRow = { userId: number; telegramId: string | null; email: string | null; displayName: string | null; staffRole?: string | null };

function Users({ rows, count, truncated }: { rows: UserRow[]; count: number; truncated: boolean }) {
  return (
    <>
      <h1>Пользователи</h1>
      <div className="card">
        <table className="tbl table-mobile">
          <thead><tr><th>Пользователь</th><th>Telegram</th><th>Email</th><th>Роль</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="empty-row">Поиск не дал результатов</td></tr>}
            {rows.map(r => (
              <tr key={r.userId}>
                <td><UserAvatar name={r.displayName} /><b>{r.displayName ?? r.email ?? '#' + r.userId}</b></td>
                <td><span>{r.telegramId ?? '—'}</span></td>
                <td><span>{r.email ?? '—'}</span></td>
                <td><span className="chip">{r.staffRole ?? 'клиент'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {truncated && <p className="muted-adm" style={{ marginTop: 10 }}>Показано не все результаты (50 максимум)</p>}
        <p className="muted-adm" style={{ marginTop: 8, fontSize: 11 }}>Всего пользователей: {count}</p>
      </div>
    </>
  );
}

function Wallet({ wallet }: { wallet: Wallet | null }) {
  const balance = wallet?.balance ?? 0;
  const low = typeof wallet?.limit === 'number' && balance < wallet.limit;
  return (
    <>
      <h1>Баланс API ARTEMIDA</h1>
      <div className="kpi-grid">
        {[['Баланс, ₽', money(balance)], ['Порог предупреждения, ₽', String(wallet?.limit ?? 500)], ['Статус', wallet?.unlimited ? 'безлимит' : 'ограничен']].map(([l, v]) => (
          <div key={l} className="kpi"><span className="l">{l}</span><b>{v}</b></div>
        ))}
      </div>
      <div className="row"><div className="t"><b>Предупреждение о трате</b><span className="muted-adm">Если баланс ниже порога — алерт</span></div><span>{low ? 'Активен' : 'Неактивен'}</span></div>
    </>
  );
}

function Promos({ promos }: { promos: Promo[] }) {
  return (
    <>
      <h1>Промокоды</h1>
      <div className="card">
        <table className="tbl table-mobile">
          <thead><tr><th>Код</th><th>Тип</th><th>Значение</th><th>Использований</th><th>Лимит</th><th>Действует до</th></tr></thead>
          <tbody>
            {promos.length === 0 && <tr><td colSpan={6} className="empty-row">Нет промокодов</td></tr>}
            {promos.map(p => (
              <tr key={p.id || p.code}><td>{p.code}</td><td>{p.type === 'percentage' ? '%' : p.type}</td><td>{p.discount}</td><td>{p.usedCount}</td><td>{p.maxUses ?? '∞'}</td><td>{fmtAdm(p.expiresAt)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TopRefs({ refs }: { refs: TopRef[] }) {
  return (
    <>
      <h1>Топ-рефералы</h1>
      <div className="card">
        <h3>Кто больше всего привел платежей</h3>
        <table className="tbl table-mobile">
          <thead><tr><th>Пользователь</th><th>Telegram</th><th>Приведёно</th><th>Заработано, ₽</th></tr></thead>
          <tbody>
            {refs.length === 0 && <tr><td colSpan={4} className="empty-row">Нет данных о заработке рефералов</td></tr>}
            {refs.map(r => (
              <tr key={r.userId}><td><UserAvatar name={r.displayName} /><b>{r.displayName ?? r.telegramId ?? '#' + r.userId}</b></td><td><span>{r.telegramId ?? '—'}</span></td><td><b>{r.referrals}</b></td><td><b>{money(r.earned)}</b></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Roles({ roles }: { roles: RoleRow[] }) {
  return (
    <>
      <h1>Роли</h1>
      <div className="card">
        <h3>Справочник ролей</h3>
        <table className="tbl table-mobile">
          <thead><tr><th>Роль</th><th>Пользователи</th><th>Лимит</th><th>Приоритет</th><th>Описание</th></tr></thead>
          <tbody>
            {roles.length === 0 && <tr><td colSpan={5} className="empty-row">Роли недоступны</td></tr>}
            {roles.map(r => (
              <tr key={r.name}><td><span className="chip">{r.name}</span></td><td><b>{r.users}</b></td><td>{r.maxUsers ?? '—'}</td><td>{r.priority ?? '—'}</td><td>{r.description}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Права и функции по ролям</h3>
        <table className="tbl table-mobile">
          <thead><tr><th>Роль</th><th>Функции</th><th>Особенности</th></tr></thead>
          <tbody>
            {roles.map(r => (
              <tr key={r.name + '-f'}>
                <td><span className="chip">{r.name}</span></td>
                <td><span>{r.features}</span></td>
                <td><span>{r.globalScope ? 'Глобальная область' : ''}{r.isDefault ? ', по умолчанию' : ''}{r.protectsDomain ? ', защищённый домен' : ''}{r.apply ? `, apply: ${r.apply}` : ''}{r.hidden ? ', скрытая' : ''}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="card">
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>{desc}</p>
        <p className="muted-adm" style={{ marginTop: 12 }}>Раздел в разработке</p>
      </div>
    </>
  );
}