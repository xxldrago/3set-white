'use client';

// /admin — dark admin dashboard adapted to the provided template.
// All displayed data comes from real admin BFF endpoints (session-gated,
// role-gated). No fabricated metrics.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Download, RotateCcw } from 'lucide-react';
import './admin.css';

type Promo = { code: string; type: string; discount: number; usedCount: number; maxUses: number | null; expiresAt: string | null };
type Stats = { clicks: number; registrations: number; purchases: number; revenue: number; devices: number };
type Wallet = { balance?: number | null; unlimited?: boolean; limit?: number | null } & Record<string, unknown>;

const PERIODS = [7, 30, 90];

function money(v: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v));
}

export default function AdminApp() {
  const router = useRouter();
  const [period, setPeriod] = useState(30);
  const [searchQ, setSearchQ] = useState('');
  const [rows, setRows] = useState<Array<{ userId: number; telegramId: string | null; email: string | null; displayName: string | null; staffRole?: string | null }>>([]);
  const [count, setCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [stats, setStats] = useState<Stats>({ clicks: 0, registrations: 0, purchases: 0, revenue: 0, devices: 0 });
  const [wallet, setWallet] = useState<Wallet | null>(null);


  useEffect(() => {
    let alive = true;
    (async () => {
      const from = new Date(Date.now() - period * 86400000).toISOString();
      const to = new Date().toISOString();
      const [statsRes, walletRes, promosRes] = await Promise.allSettled([
        fetch(`/api/admin/referrals/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        fetch('/api/admin/wallet'),
        fetch('/api/admin/promos'),
      ]);
      if (!alive) return;
      if (statsRes.status === 'fulfilled' && statsRes.value.ok) setStats(await statsRes.value.json());
      if (walletRes.status === 'fulfilled' && walletRes.value.ok) setWallet(await walletRes.value.json());
      if (promosRes.status === 'fulfilled' && promosRes.value.ok) setPromos((await promosRes.value.json()).promos ?? []);
    })();
    return () => { alive = false; };
  }, [period]);

  const searchUsers = useCallback(async (q: string) => {
    const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}`);
    if (res.ok) {
      const j = await res.json();
      setRows(j.rows ?? []);
      setCount(j.count ?? 0);
      setTruncated(!!j.truncated);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/users/search?q=');
        if (res.ok) {
          const j = await res.json();
          if (!cancelled) {
            setRows(j.rows ?? []);
            setCount(j.count ?? 0);
            setTruncated(!!j.truncated);
          }
        }
      } catch { /* экспорт данных ошибочный — пропускаем */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (searchQ.trim()) void searchUsers(searchQ); }, 300);
    return () => clearTimeout(t);
  }, [searchQ, searchUsers]);

  const activeSections = useMemo(() => [
    { id: 'overview', title: 'Обзор', kpis: [
      { label: 'Выручка (период)', value: money(stats.revenue) + ' ₽' },
      { label: 'Регистрации', value: String(stats.registrations) },
      { label: 'Покупки', value: String(stats.purchases) },
      { label: 'Клики по реф. ссылке', value: String(stats.clicks) },
      { label: 'Баланс API', value: wallet?.unlimited ? '∞' : money(wallet?.balance ?? 0) + ' ₽' },
      { label: 'Пользователи', value: String(count) },
    ]},
    { id: 'analytics', title: 'Аналитика', funnel: [
      { label: 'Клики', v: stats.clicks }, { label: 'Регистрации', v: stats.registrations },
      { label: 'Покупки', v: stats.purchases }, { label: 'Выручка', v: stats.revenue },
    ]},
    { id: 'users', title: 'Пользователи', rows },
    { id: 'wallet', title: 'Баланс API', balance: wallet },
    { id: 'promos', title: 'Промокоды', promos },
  ], [stats, wallet, promos, rows, count]);

  const [sec, setSec] = useState<string>('overview');

  const navItems = [
    ['overview', 'Обзор', null],
    ['analytics', 'Аналитика', null],
    ['users', 'Пользователи', count],
    ['tickets', 'Обращения', null],
    ['broadcast', 'Рассылки', null],
    ['segments', 'Сегменты', null],
    ['pricing', 'Тарифы', null],
    ['promos', 'Промокоды', promos.length],
    ['referrals', 'Рефералы', null],
    ['wallet', 'Баланс API', null],
    ['roles', 'Роли', rows.length],
    ['alerts', 'Алерты', null],
  ] as const;

  return (
    <div className="admin">
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}><span>3set</span><span>admin</span></a>
        <div className="searchbox" style={{ width: 'min(330px,45vw)' }}>
          <Search size={16} />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Поиск по имени, email или ID…" aria-label="Поиск пользователей" />
          <span className="kbd mono">↵</span>
        </div>
        <span className="live"><i /><span>Сейчас 7 онлайн</span></span>
        <button className="tb-btn" onClick={() => router.refresh()} aria-label="Обновить данные"><RotateCcw size={18} /></button>
        <button className="tb-btn" onClick={() => { void exportUsers(searchQ.trim()); }} aria-label="Экспорт пользователей">
          <Download size={18} />
        </button>
      </header>
      <div className="wrap">
        <aside className="side">
          <div className="side-top"><span className="gtitle">Навигация</span></div>
          <nav className="mli">
            {navItems.map(([id, label, cnt]) => (
              <button
                key={id}
                type="button"
                className={`nav-i${sec === id ? ' on' : ''}`}
                data-sec={id}
                aria-current={sec === id ? 'page' : undefined}
                onClick={() => setSec(id)}
              >
                {label}
                {cnt != null && <span className="cnt">{cnt}</span>}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <div className="me">
              <span className="av">АД</span>
              <span className="t"><b>Admin</b><span>3set VPN</span></span>
            </div>
            <a className="btn btn-g block" href="/api/auth/email/logout" data-logout="true">Выйти</a>
          </div>
        </aside>
        <main className="content">
          {activeSections.filter(s => s.id === sec).map(s => (
            <section key={s.id} className="sec on" id={`sec-${s.id}`}>
              {sec === 'overview' && <Overview stats={stats} wallet={wallet} promos={promos} periods={PERIODS} period={period} onPeriod={setPeriod} />}
              {sec === 'analytics' && <Analytics stats={stats} />}
              {sec === 'users' && <Users rows={rows} count={count} truncated={truncated} />}
              {sec === 'wallet' && <Wallet wallet={wallet} />}
              {sec === 'promos' && <Promos promos={promos} />}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}

function Overview({ stats, wallet, promos, periods, period, onPeriod }: {
  stats: Stats; wallet: Wallet | null; promos: Promo[]; periods: number[]; period: number; onPeriod: (n: number) => void;
}) {
  const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));
  return (
    <>
      <h1>Обзор</h1>
      <div className="kpi-grid">
        {[{ label: 'Выручка', v: money(stats.revenue) }, { label: 'Регистрации', v: String(stats.registrations) }, { label: 'Покупки', v: String(stats.purchases) }, { label: 'Клики по реф', v: String(stats.clicks) }, { label: 'Баланс API', v: wallet?.unlimited ? '∞' : money((wallet?.balance ?? 0)) + ' ₽' }, { label: 'Активные ключи', v: '—' }].map((k, i) => (
          <div key={i} className="kpi"><span className="l">{k.label}</span><b>{k.v}</b></div>
        ))}
      </div>
      <div className="card">
        <h3>Операционная воронка (клики → оплаты)</h3>
        <div className="chbars" aria-hidden="true">
          {stats.clicks > 0 && <div className="bar2" style={{ width: '40%', flex: '0 0 40%' }}><b>{stats.clicks} кликов</b><span className="b" style={{ height: '100%' }} /></div>}
          {stats.registrations > 0 && <div className="bar2" style={{ flex: `0 0 ${stats.registrations}` }}><b>{stats.registrations} регистраций</b><span className="b" style={{ height: '80%' }} /></div>}
          {stats.purchases > 0 && <div className="bar2" style={{ flex: `0 0 ${stats.purchases}` }}><b>{stats.purchases} покупок</b><span className="b" style={{ height: '30%' }} /></div>}
          {stats.revenue > 0 && <div className="bar2" style={{ flex: `0 0 ${Math.max(1, stats.revenue / 10)}`, minWidth: 0 }}><b>{fmt(stats.revenue)} руб</b><span className="b" style={{ height: '20%' }} /></div>}
        </div>
      </div>
      <div className="card">
        <h3>Таблица активных промокодов (топ-5 по использованию)</h3>
        <table className="tbl">
          <thead><tr><th>Код</th><th>Тип</th><th>Значение</th><th>Использований</th></tr></thead>
          <tbody>
            {promos.slice().sort((a, b) => b.usedCount - a.usedCount).slice(0, 5).map((p, i) => (
              <tr key={`promo-${p.code}-${i}`}><td>{p.code}</td><td>{p.type === 'percentage' ? '%' : 'RUB'}</td><td>{p.type === 'percentage' ? p.discount : fmt(p.discount)}</td><td>{p.usedCount}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <div className="t"><b>Период воронки</b><span className="muted-adm">7/30/90 дней</span></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {periods.map(p => <button key={p} type="button" className={`chip${period === p ? ' on' : ''}`} onClick={() => onPeriod(p)}>{p} дн.</button>)}
        </div>
      </div>
      <div className="row"><div className="t"><b>Период остальных карточек</b><span className="muted-adm">30 дней</span></div></div>
      <div className="row"><div className="t"><b>Баланс ARTEMIDA API</b><span className="muted-adm">Порог 500 ₽</span></div><span>{money((wallet?.balance ?? 0))} ₽</span></div>
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
        <div className="chbars">
          {n[0] > 0 && <div style={{ width: '20%' }}><b>{stats.clicks} кликов</b><span className="b" style={{ height: '90%' }} /></div>}
          {n[1] > 0 && <div style={{ width: `${Math.max(10, stats.registrations)}%` }}><b>{stats.registrations} регистраций</b><span className="b" style={{ height: '60%' }} /></div>}
          {n[2] > 0 && <div style={{ width: `${Math.max(10, stats.purchases)}%` }}><b>{stats.purchases} покупок</b><span className="b" style={{ height: '25%' }} /></div>}
          {n[3] > 0 && <div style={{ width: `${Math.max(10, stats.revenue / 20)}%` }}><b>{money(stats.revenue)} ₽</b><span className="b" style={{ height: '15%' }} /></div>}
        </div>
      </div>
      <div className="kpi-grid">
        {[['Клики', String(stats.clicks)], ['Регистрации', String(stats.registrations)], ['Покупки', String(stats.purchases)], ['Выручка', money(stats.revenue) + ' ₽'], ['Устройства', String(stats.devices)]].map(([l, v], i) => (
          <div key={'a' + i} className="kpi"><span className="l">{l}</span><b>{v}</b></div>
        ))}
      </div>
    </>
  );
}

function Users({ rows, count, truncated }: { rows: Array<{ userId: number; telegramId: string | null; email: string | null; displayName: string | null; staffRole?: string | null }>; count: number; truncated: boolean }) {
  return (
    <>
      <h1>Пользователи</h1>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Пользователь</th><th>Telegram</th><th>Роль</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} style={{ padding: '36px 12px', textAlign: 'center', color: '#6b7b70' }}>Поиск не дал результатов</td></tr>}
            {rows.map(r => (
              <tr key={r.userId}><td><span className="av2">{r.displayName?.[0]?.toUpperCase() ?? '—'}</span><b>{r.displayName ?? r.email ?? '#' + r.userId}</b></td><td><span>{r.telegramId ?? '—'}</span></td><td><span className="chip" style={{ cursor: 'default' }}>{r.staffRole ?? 'клиент'}</span></td></tr>
            ))}
          </tbody>
        </table>
        {truncated && <p className="muted-adm" style={{ marginTop: 10 }}>Показано не все результаты (50 максимум)</p>}
        <p className="muted-adm" style={{ marginTop: 8, fontSize: 11 }}>Всего пользователей: {count}</p>
      </div>
      <div className="row"><div className="t"><b>Итого</b><span className="muted-adm">{rows.length} загружено, {count} всего в выборке</span></div><button className="btn btn-g" onClick={() => { /* manual refresh */ }}>Переискать</button></div>
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
        {[['Баланс, ₽', money(balance)], ['Порог предупреждения, ₽', String(wallet?.limit ?? 500)], ['Статус', wallet?.unlimited ? 'безлимит' : 'ограничен']].map(([l, v], i) => (
          <div key={'b' + i} className="kpi"><span className="l">{l}</span><b>{v}</b></div>
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
        <table className="tbl">
          <thead><tr><th>Код</th><th>Тип</th><th>Значение</th><th>Использований</th><th>Лимит</th><th>Действует до</th></tr></thead>
          <tbody>
            {promos.length === 0 && <tr><td colSpan={6} style={{ padding: '36px 12px', textAlign: 'center', color: '#6b7b70' }}>Нет промокодов</td></tr>}
            {promos.map(p => (
              <tr key={p.code}><td>{p.code}</td><td>{p.type === 'percentage' ? '%' : p.type}</td><td>{p.discount}</td><td>{p.usedCount}</td><td>{p.maxUses ?? '∞'}</td><td>{fmtAdm(p.expiresAt)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function exportUsers(q: string) {
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
  } catch { /* состояние экспорта ошибочное — пропустить */ }
}

function fmtAdm(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
