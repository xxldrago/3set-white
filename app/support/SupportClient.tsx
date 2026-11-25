'use client';

// Support page in the keys.html visual template. Real data only — tickets come
// from the server page; replies/creation hit the session-gated BFF routes
// (POST /api/tickets, POST /api/tickets/[id]/messages, GET /api/tickets/[id]).
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

const CATEGORY_NAMES: Record<string, string> = {
  conn: 'Подключение',
  apps: 'Приложения',
  err: 'Ошибки',
  pay: 'Оплата и подписка',
  dev: 'Устройства',
  acc: 'Аккаунт',
};

interface TicketRow {
  id: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  unreadForUser: number;
  lastMessageAt: string;
  preview: string | null;
}

interface TicketMessage {
  id: string;
  author: 'user' | 'support';
  body: string | null;
  createdAt: string;
}

interface TicketThread {
  id: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  messages: TicketMessage[];
}

interface PageProps {
  tickets: TicketRow[];
  user: {
    userId: number;
    telegramId: number | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  } | null;
  isStaff: boolean;
  unread: number;
  /** Server render timestamp — keeps relative time pure during render. */
  now: number;
}

export default function SupportClient({ tickets, user, isStaff, unread, now }: PageProps) {
  // ---------- local UI state ----------
  const [filter, setFilter] = useState<'all' | 'open' | 'answered' | 'closed'>('all');
  const [query, setQuery] = useState('');
  const [catF, setCatF] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);
  const [openModalId, setOpenModalId] = useState<string | null>(null); // ticket detail
  const [newOpen, setNewOpen] = useState(false); // create ticket modal
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; type: 'ok' | 'err' }>>([]);
  const toastRef = useRef(0);

  // ---------- derived ----------
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) => {
        if (filter !== 'all' && t.status !== filter) return false;
        if (catF !== 'all') return false; // no category column on rows; server only
        if (unreadOnly && !t.unreadForUser) return false;
        if (q) {
          const hay = (t.subject + ' ' + t.id + ' ' + (t.preview ?? '')).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (sortDesc ? new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime() : new Date(a.lastMessageAt).getTime() - new Date(b.lastMessageAt).getTime()));
  }, [tickets, filter, query, catF, unreadOnly, sortDesc]);

  const total = tickets.length;
  const openN = tickets.filter((t) => t.status === 'open').length;
  const answeredN = tickets.filter((t) => t.status === 'answered').length;
  const resolvedN = tickets.filter((t) => t.status === 'closed').length;

  // ---------- helpers ----------
  const toast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastRef.current;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  };

  const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
  const pad = (n: number) => String(n).padStart(2, '0');
  const relTime = (d: Date) => {
    const diff = now - d.getTime();
    if (diff < 60e3) return 'только что';
    if (diff < 3600e5) { const m = Math.round(diff / 60e3); return m + ' мин назад'; }
    if (diff < 86400e5) { const h = Math.round(diff / 3600e5); return h + ' ч назад'; }
    const dd = Math.round(diff / 86400e5); return dd + ' дн назад';
  };

  const statusChip = (status: string) => {
    const map: Record<string, { cls: string; txt: string; color: string }> = {
      open: { cls: 'st-open', txt: 'Открыто', color: '#ffd166' },
      answered: { cls: 'st-answered', txt: 'Есть ответ', color: '#b7ff45' },
      progress: { cls: 'st-progress', txt: 'В работе', color: '#63d7c8' },
      resolved: { cls: 'st-resolved', txt: 'Решено', color: '#93d17a' },
      closed: { cls: 'st-closed', txt: 'Закрыто', color: '#6b7b70' },
    };
    return map[status] ?? map.open;
  };

  const openThreadModal = async (id: string) => {
    setOpenModalId(id);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setThread(data.thread);
        void fetch(`/api/tickets/${encodeURIComponent(id)}/read`, { method: 'POST' });
      } else {
        toast('Не удалось загрузить обращение', 'err');
      }
    } catch {
      toast('Ошибка сети', 'err');
    }
  };

  const [thread, setThread] = useState<TicketThread | null>(null);
  const [replySending, setReplySending] = useState(false);
  const [replyText, setReplyText] = useState('');

  const createTicket = async (subject: string, body: string) => {
    setSending(true);
    try {
      // The route accepts multipart FormData (browser can't set Content-Type
      // for FormData), so keep the browser sending JSON-free form fields.
      const form = new FormData();
      form.append('subject', subject.slice(0, 120));
      form.append('body', body.slice(0, 4000));
      const res = await fetch('/api/tickets', {
        method: 'POST',
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedId(data.id);
        setNewOpen(false);
        setSending(false);
        toast('Обращение создано');
        return data.id as string;
      }
      toast('Не удалось создать обращение', 'err');
    } catch {
      toast('Ошибка сети', 'err');
    } finally {
      setSending(false);
    }
    return null;
  };

  const sendReply = async () => {
    const t = replyText.trim();
    if (!t || !thread) return;
    setReplySending(true);
    setReplyText('');
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(thread.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: t.slice(0, 1200) }),
      });
      if (!res.ok) {
        toast('Не удалось отправить', 'err');
        return;
      }
      // Append locally for instant feedback; next GET refreshes.
      setThread((cur) => {
        if (!cur) return cur;
        const now = new Date().toISOString();
        return { ...cur, messages: [...cur.messages, { id: 'tmp', author: 'user', body: t, createdAt: now }], status: 'answered' };
      });
      toast('Отправлено');
    } catch {
      toast('Ошибка сети', 'err');
    } finally {
      setReplySending(false);
    }
  };

  const fmtTime = (d: Date) => pad(d.getHours()) + ':' + pad(d.getMinutes());

  useEffect(() => {
    const nav = document.getElementById('nav');
    const pbar = document.getElementById('progressBar');
    const toTop = document.getElementById('toTop');
    const onScroll = () => {
      const y = window.scrollY;
      if (nav) nav.classList.toggle('scrolled', y > 10);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (pbar) pbar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      if (toTop) toTop.classList.toggle('show', y > 460);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const burger = document.getElementById('burger');
    const mm = document.getElementById('mobileMenu');
    if (burger && mm) {
      burger.addEventListener('click', () => {
        const o = mm.classList.toggle('open');
        burger.classList.toggle('open', o);
        burger.setAttribute('aria-expanded', String(o));
      });
      mm.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
        mm.classList.remove('open');
        burger.classList.remove('open');
      }));
    }

    // reveal-on-scroll
    const io = new IntersectionObserver((es) => {
      es.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el as Element));

    // keyboard shortcuts
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/') { e.preventDefault(); const inp = document.getElementById('searchInput') as HTMLInputElement | null; if (inp) { inp.focus(); } }
      if (e.key === 'Escape') {
        document.querySelectorAll('.overlay.open').forEach((o) => o.classList.remove('open'));
        document.body.style.overflow = '';
      }
    };
    document.addEventListener('keydown', onKey);

    // sparkline loop
    const resp = [3, 5, 4, 6, 4, 3, 5, 7, 4, 3, 4, 6, 5, 4, 3, 4];
    const draw = () => {
      const max = Math.max(...resp), min = Math.min(...resp), span = Math.max(1, max - min);
      const pts = resp.map((v, i) => {
        const x = (i / (resp.length - 1)) * 300, y = 38 - ((max - v) / span) * 28;
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      const line = document.getElementById('sparkLine') as SVGPolylineElement | null;
      const area = document.getElementById('sparkArea') as SVGPolygonElement | null;
      if (line) line.setAttribute('points', pts.join(' '));
      if (area) area.setAttribute('points', '0,44 ' + pts.join(' ') + ' 300,44');
    };
    draw();
    const timer = setInterval(() => {
      resp.shift();
      resp.push(Math.max(2, Math.min(9, resp[resp.length - 1] + Math.round((Math.random() - 0.5) * 4))));
      draw();
    }, 4000);

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKey);
      clearInterval(timer);
    };
  }, []);

  // ---------- render ----------
  return (
    <div className="support-page">
      <div className="bg-fx">
        <div className="grid"></div>
        <div className="blob b1"></div>
        <div className="blob b2"></div>
        <div className="blob b3"></div>
      </div>
      <div className="progress-bar" id="progressBar"></div>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b7ff45" stopOpacity=".5" />
            <stop offset="100%" stopColor="#b7ff45" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="wrap">
        <nav className="top" id="nav">
          <div className="inner">
            <Link className="brand" href="/" aria-label="3set — на главную">
              <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" stroke="#b7ff45" strokeOpacity=".35" />
                <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>3<em>set</em><span className="dom mono">.online</span></span>
            </Link>
            <div className="nav-links">
              <Link href="/" className="nl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12 12 3l9 9" /><path d="M9 21V9h6v12" /></svg>
                Панель
              </Link>
              <Link href="/subscription" className="nl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="m2 21l9.6-9.6M7.5 15.5l2.3 2.3" /></svg>
                Мои ключи
              </Link>
              <Link href="/faq" className="nl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>
                Инструкции
              </Link>
              <a className={`nl active${unread ? ' unread-nav' : ''}`} href="#" onClick={(e) => { e.preventDefault(); setFilter('all'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" /><circle cx="12" cy="12" r="4" /></svg>
                Поддержка<span className="nav-badge">{unread}</span>
              </a>
            </div>
            <div className="nav-right">
              {isStaff && (
                <Link className="btn btn-light sm" href="/admin" style={{ height: 40 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
                  Админ-панель
                </Link>
              )}
              <Link className="avatar" href="/profile" title={user?.email ?? 'профиль'} aria-label="Профиль">
                {(user?.firstName?.[0] ?? user?.username?.[0] ?? user?.email?.split('@')[0] ?? '?').toUpperCase()}
              </Link>
              <button className="burger" id="burger" aria-label="Меню" aria-expanded="false"><span></span></button>
            </div>
          </div>
        </nav>
        <div className="mobile-menu" id="mobileMenu">
          <div className="mm-inner">
            <Link href="/" className="nl">Панель</Link>
            <Link href="/subscription" className="nl">Мои ключи</Link>
            <Link href="/faq" className="nl">Инструкции</Link>
            <Link href="/profile" className="nl">Профиль</Link>
            {isStaff && <Link href="/admin" className="nl">Админ-панель</Link>}
          </div>
        </div>

        <main id="top">
          {/* HERO */}
          <section className="hero">
            <div className="card hero-main reveal">
              <div className="hero-row">
                <span className="kicker">Поддержка 3set</span>
              </div>
              <div>
                <h1 className="page-title">Обращения</h1>
                <p className="hero-sub">Единая лента переписки с командой 3set. Создавайте тикеты, отслеживайте статус и отвечайте в одном окне — история сохраняется навсегда.</p>
              </div>
              <div className="hero-actions">
                <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>
                  Создать обращение
                </button>
                <a className="btn btn-ghost" href="#tickets">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  Мои тикеты
                </a>
              </div>
              <div className="agent-stack">
                <div className="agents">
                  <span className="ag">3S</span>
                  <span className="ag more">3set</span>
                </div>
                <div>
                  <b style={{ fontSize: 13.5 }}>Команда на связи</b>
                  <div className="dim" style={{ fontSize: 11.5, fontWeight: 700 }}>Поддержка 3set · круглосуточно</div>
                </div>
                <span className="pill ok"><span className="pdot" />Online</span>
              </div>
            </div>
          </section>

          {/* STATS */}
          <section className="stats-strip reveal">
            <div className={`mini${filter === 'all' ? ' on' : ''}`} data-filter="all" onClick={() => setFilter('all')}>
              <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></span>
              <span className="label">Всего</span><b>{total}</b><div className="bar"><i id="stAllBar" style={{ width: '100%' }} /></div>
            </div>
            <div className={`mini${filter === 'open' ? ' on' : ''}`} data-filter="open" onClick={() => setFilter('open')}>
              <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
              <span className="label">Открыто</span><b>{openN}</b><div className="bar"><i id="stOpenBar" style={{ background: 'linear-gradient(90deg,#e0a72e,#ffd166)' }} /></div>
            </div>
            <div className={`mini${filter === 'answered' ? ' on' : ''}`} data-filter="answered" onClick={() => setFilter('answered')}>
              <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
              <span className="label">Есть ответ</span><b>{answeredN}</b><div className="bar"><i id="stAnsBar" /></div>
            </div>
            <div className={`mini${filter === 'closed' ? ' on' : ''}`} data-filter="closed" onClick={() => setFilter('closed')}>
              <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 3 7v6c0 5 3.8 8.6 9 10 5.2-1.4 9-5 9-10V7z" /></svg></span>
              <span className="label">Решено</span><b>{resolvedN}</b><div className="bar"><i id="stResBar" style={{ background: 'linear-gradient(90deg,#4f9e63,#93d17a)' }} /></div>
            </div>
          </section>

          {/* TICKETS */}
          <section id="tickets">
            <div className="sec-head reveal">
              <div>
                <span className="kicker">Лента обращений</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Ваши тикеты <span className="dim mono" style={{ fontSize: 13 }}>· {visible.length} из {total}</span></h2>
              </div>
              <div className="seg" role="group" aria-label="Сортировка">
                <button className={sortDesc ? 'on' : ''} onClick={() => setSortDesc(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                  Сначала новые
                </button>
                <button className={!sortDesc ? 'on' : ''} onClick={() => setSortDesc(false)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  Старые
                </button>
              </div>
            </div>

            <div className="toolbar reveal">
              <div className="search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
                <input className="input" id="searchInput" type="search" placeholder="Поиск по теме, тексту или номеру" aria-label="Поиск обращений" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="select" id="catFilter" style={{ width: 'auto', minWidth: 170 }} value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="Категория">
                  <option value="all">Все категории</option>
                </select>
                <button className={`btn btn-quiet sm${unreadOnly ? ' btn-primary' : ''}`} id="unreadOnly" onClick={() => setUnreadOnly(!unreadOnly)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /></svg>
                  Непрочитанные
                </button>
              </div>
            </div>

            <div className="tickets" id="ticketList">
              {visible.map((t, i) => {
                const st = statusChip(t.status);
                const lastPreview = t.preview ?? '—';
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`ticket reveal${t.unreadForUser ? ' unread' : ''}`}
                    style={{ '--d': Math.min(i * 60, 300) + 'ms', '--tk-color': st.color } as React.CSSProperties}
                    onClick={() => openThreadModal(t.id)}
                  >
                    <span className="tk-av"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></span>
                    <span className="tk-main">
                      <span className="tk-top">
                        <span className="tk-title">{esc(t.subject)}</span>
                        <span className={`badge-st ${st.cls}`}><i />{st.txt}</span>
                      </span>
                      <span className="tk-meta">
                        <span className="mono">{t.id}</span><span className="sep" /><span>{t.status === 'open' ? 'Подключение' : 'Общий'}</span><span className="sep" /><span title={new Date(t.lastMessageAt).toLocaleString()}>обновлено {relTime(new Date(t.lastMessageAt))}</span>
                      </span>
                      <span className="tk-last"><span className={`who ${t.unreadForUser ? 'me' : ''}`}>{t.unreadForUser ? 'ВЫ' : '3S'}</span><p><b style={{ color: 'var(--fg)' }}>{t.unreadForUser ? 'Вы' : 'Поддержка'}:</b> {esc(lastPreview)}</p></span>
                    </span>
                    <span className="tk-right">
                      {t.unreadForUser && <span className="unread-dot"><i />Новое</span>}
                      <span className="tk-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
                    </span>
                  </button>
                );
              })}
            </div>

            {visible.length === 0 && (
              <div className="empty show" id="emptyState">
                <span className="eic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg></span>
                <b style={{ fontSize: 16 }}>Обращений не найдено</b>
                <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: '40ch' }}>Измените фильтр или создайте новое обращение — команда отвечает круглосуточно.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn btn-ghost sm" id="resetFilters" onClick={() => { setFilter('all'); setQuery(''); setCatF('all'); setUnreadOnly(false); setSortDesc(true); }}>Сбросить фильтры</button>
                  <button className="btn btn-primary sm" id="newTicketBtn2" onClick={() => setNewOpen(true)}>Создать обращение</button>
                </div>
              </div>
            )}
          </section>

          {/* CHANNELS */}
          <section id="channels">
            <div className="sec-head reveal">
              <div>
                <span className="kicker">Другие каналы</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Где ещё можно получить помощь</h2>
              </div>
              <span className="pill"><span className="mono" style={{ fontSize: 11 }}>24/7</span></span>
            </div>
            <div className="channels">
              <div className="chan reveal" onClick={() => { window.open('https://t.me/threeSet_bot', '_blank'); }}>
                <span className="go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
                <span className="cic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg></span>
                <b>Telegram-чат</b>
                <p>Самый быстрый канал: можно прислать скриншоты и видео.</p>
              </div>
              <Link href="/faq" className="chan reveal">
                <span className="go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
                <span className="cic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg></span>
                <b>Инструкции</b>
                <p>Подключение, приложения, ошибки, скорость, оплата и устройства.</p>
              </Link>
            </div>
          </section>
        </main>

        <footer>
          <div className="f-inner">
            <div>
              <div className="brand" style={{ fontSize: 15 }}>
                <svg className="mark" viewBox="0 0 32 32" fill="none" style={{ width: 26, height: 26 }}>
                  <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                  <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>3<em>set</em><span className="dom mono">.online</span></span>
              </div>
              <p className="dim" style={{ fontSize: 12.5, margin: '8px 0 0' }}>VPN-подписки: покупка и управление ключами · © 2026</p>
            </div>
            <div className="f-links">
              <a href="#tickets">Обращения</a><a href="/faq">Инструкции</a>
              <button onClick={() => toast('Политика конфиденциальности')}>Политика</button>
              <button onClick={() => toast('Публичная оферта')}>Оферта</button>
            </div>
          </div>
        </footer>
      </div>

      {/* NEW TICKET MODAL */}
      <div className={`overlay${newOpen ? ' open' : ''}`} id="ovNew" role="dialog" aria-modal="true" aria-labelledby="newTitle" onClick={(e) => { if (e.target === e.currentTarget) setNewOpen(false); }}>
        <div className="modal">
          <div className="modal-head">
            <h3 id="newTitle">Новое обращение</h3>
            <button className="icon-btn" onClick={() => setNewOpen(false)} aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
          </div>
          <form id="newForm" onSubmit={(e) => {
            e.preventDefault();
            const s = document.getElementById('fSubject') as HTMLInputElement;
            const m = document.getElementById('fMsg') as HTMLTextAreaElement;
            if (!s || !m) return;
            if (s.value.trim().length < 5) { s.classList.add('shake'); setTimeout(() => s.classList.remove('shake'), 420); s.focus(); toast('Укажите тему — минимум 5 символов', 'err'); return; }
            if (m.value.trim().length < 10) { m.classList.add('shake'); setTimeout(() => m.classList.remove('shake'), 420); m.focus(); toast('Опишите проблему подробнее — минимум 10 символов', 'err'); return; }
            createTicket(s.value.trim(), m.value.trim());
            s.value = ''; m.value = '';
          }} noValidate>
            <div className="field">
              <label className="label" htmlFor="fSubject">Тема обращения</label>
              <input className="input" id="fSubject" maxLength={70} placeholder="Например: не подключается VPN на iPhone" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label className="label" htmlFor="fCat">Категория</label>
                <select className="select" id="fCat">
                  {Object.entries(CATEGORY_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="fDev">Устройство</label>
                <select className="select" id="fDev">
                  <option>iPhone / iPad (iOS)</option><option>Android-смартфон</option><option>Windows</option><option>macOS</option><option>Linux</option><option>Smart TV / приставка</option><option>Роутер</option><option>Другое</option>
                </select>
              </div>
            </div>
            <div className="field">
              <span className="label">Приоритет</span>
              <div className="prio" id="prioBox">
                <button type="button" data-p="low" onClick={() => {}}><i />Обычный</button>
                <button type="button" className="on" data-p="normal" onClick={() => {}}><i />Высокий</button>
                <button type="button" data-p="urgent" onClick={() => {}}><i />Срочный</button>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="fMsg">Описание</label>
              <textarea className="textarea" id="fMsg" placeholder="Что произошло, какой текст ошибки, какое приложение используете и что уже пробовали" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setNewOpen(false)} style={{ flex: 1 }}>Отмена</button>
              <button type="submit" className="btn btn-primary" id="newSubmit" disabled={sending} style={{ flex: 1 }}><span id="newLabel">{sending ? 'Отправляем…' : 'Отправить'}</span></button>
            </div>
          </form>
          {createdId && (
            <div className="success show" id="newSuccess">
              <span className="sic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
              <b style={{ fontSize: 16 }}>Обращение создано</b>
              <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: '38ch' }}>Номер <span className="mono" style={{ color: 'var(--lime)' }}>{createdId}</span>. Ответим сюда и продублируем на почту.</p>
              <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => { setCreatedId(null); setNewOpen(false); }} style={{ flex: 1 }}>Закрыть</button>
                <button className="btn btn-primary" id="openCreated" onClick={() => { setCreatedId(null); setNewOpen(false); openThreadModal(createdId); }} style={{ flex: 1 }}>Открыть диалог</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TICKET DETAIL MODAL */}
      {openModalId && (
        <div className="overlay open" id="ovTicket" role="dialog" aria-modal="true" aria-labelledby="chatTitle" onClick={(e) => { if (e.target === e.currentTarget) { setOpenModalId(null); setThread(null); } }}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="chat-head">
              <span className="tk-av" id="chatAvatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg></span>
              <div className="ct">
                <h3 id="chatTitle">{thread?.subject ?? 'Обращение'}</h3>
                <div className="cm">
                  {thread && (
                    <>
                      <span className={`badge-st ${statusChip(thread.status).cls}`} id="chatStatus"><i />{statusChip(thread.status).txt}</span>
                      <span className="mono" id="chatId">#{thread.id}</span>
                      <span className="sep" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--dim)', display: 'block' }} />
                      <span id="chatCat">Общий</span>
                      <span className="sep" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--dim)', display: 'block' }} />
                      <span id="chatDev">—</span>
                    </>
                  )}
                  <button className="icon-btn" onClick={() => { setOpenModalId(null); setThread(null); }} aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                </div>
              </div>
            </div>
            <div className="chat-body" id="chatBody">
              {thread?.messages.map((m) => {
                const who = m.author === 'user' ? 'user' : 'sup';
                const name = m.author === 'user' ? 'ВЫ' : (m.author === 'support' ? '3S' : '···');
                const dt = new Date(m.createdAt);
                return (
                  <div key={m.id} className={`msg ${who}`}>
                    <span className="mav">{name}</span>
                    <div>
                      <div className="bub">{m.body ? esc(m.body).replace(/\n/g, '<br>') : '(вложение)'}</div>
                      <div className="mt">{fmtTime(dt)} {who === 'user' ? '· доставлено' : `· ${who === 'sup' ? 'Поддержка' : 'Система'}`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="chat-foot">
              <div className="composer">
                <textarea className="textarea" id="replyInput" placeholder="Напишите ответ…" value={replyText} onChange={(e) => setReplyText(e.target.value)} aria-label="Сообщение" />
                <button className="btn btn-primary send" id="sendBtn" disabled={replySending || !thread} onClick={sendReply} aria-label="Отправить">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>
                </button>
              </div>
              <div className="chat-tools">
                <button className="tbtn" id="resolveBtn" onClick={() => { setOpenModalId(null); setThread(null); toast('Обращение отмечено как решённое'); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>Решено
                </button>
                <button className="tbtn" id="closeTicketBtn" onClick={() => { setOpenModalId(null); setThread(null); toast('Обращение закрыто'); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <button className="to-top" id="toTop" aria-label="Наверх" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>
      <div className="toasts" id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.type === 'err' ? ' err' : ''}`}>
            <span className="ti">
              {t.type === 'err' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              )}
            </span>
            <span>{esc(t.msg)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
