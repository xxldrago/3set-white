'use client';

// FAQ page in the supplied keys.html-style template. All questions, category
// counts and answers come from faq-data.ts; "Задать вопрос" creates a real
// ticket through /api/tickets (no fake ticket numbers).
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronUp,
  CircleHelp,
  Copy,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  MonitorSmartphone,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  Tv,
  X,
  Zap,
} from 'lucide-react';
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqItem } from './faq-data';

interface Props {
  name: string;
  email: string | null;
  isStaff: boolean;
  unread: number;
}

const PAGE = 10;
const POPULAR = ['не работает vpn', 'настроить iphone', 'лимит устройств', 'промокод', 'роутер'];

const QUICK_START = [
  {
    n: '01',
    icon: KeyRound,
    title: 'Откройте личную страницу',
    body: 'Кабинет → «Мои ключи» → активная подписка. Ссылка уникальна и равна ключу доступа.',
  },
  {
    n: '02',
    icon: BookOpen,
    title: 'Установите клиент',
    body: 'Используйте приложение, которое первым предлагается для вашей системы в инструкции.',
  },
  {
    n: '03',
    icon: Copy,
    title: 'Добавьте подписку',
    body: 'Нажмите кнопку импорта или вставьте полную ссылку через «Из буфера обмена».',
  },
  {
    n: '04',
    icon: ShieldCheck,
    title: 'Обновите и подключитесь',
    body: 'Разрешите VPN-профиль, обновите конфигурацию, выберите сервер и нажмите «Подключить».',
  },
];

const CAT_ICONS: Record<string, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  start: KeyRound,
  apps: Smartphone,
  errors: AlertTriangle,
  servers: Zap,
  subscription: CreditCard,
  devices: MonitorSmartphone,
  settings: Settings,
  tv: Tv,
  security: ShieldCheck,
  support: LifeBuoy,
};

const DEVICES = [
  'iPhone / iPad (iOS)',
  'Android-смартфон',
  'Windows',
  'macOS',
  'Linux',
  'Smart TV / приставка',
  'Роутер',
  'Другое',
];

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const CROSS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function norm(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е');
}

function escRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalize trusted static FAQ HTML so the browser parses it into the same
   tree React expects during hydration. The source HTML has unclosed `<li>` /
   `<p>` tags (e.g. `<li>a;<li>b` and stray `</li>` runs) which the browser
   error-corrects differently than React's SSR tree, causing a hydration
   mismatch on `dangerouslySetInnerHTML`.
 */
function normalizeHtml(html: string): string {
  const out: string[] = [];
  const stack: string[] = []; // open non-void tags
  const TAG = /<(\/?)([a-zA-Z]+)([^>]*)>/g;
  let idx = 0;
  let m: RegExpExecArray | null;
  const listClose = new Set(['ol', 'ul']);
  const voidTags = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'embed', 'col', 'area', 'base', 'param']);
  while ((m = TAG.exec(html))) {
    out.push(html.slice(idx, m.index)); // text before the tag
    const isClose = m[1] === '/';
    const name = m[2].toLowerCase();
    const full = m[0];
    idx = TAG.lastIndex;

    if (isClose) {
      // drop stray closing tags with no matching open
      const openIdx = stack.lastIndexOf(name);
      if (openIdx === -1) continue;
      // close any auto-closable tags opened above this one
      while (stack.length - 1 > openIdx) {
        out.push(`</${stack.pop()}>`);
      }
      stack.pop();
      // closing a list also closes any still-open list item
      if (listClose.has(name)) {
        while (stack.includes('li')) out.push(`</${stack.pop()}>`);
      }
      out.push(full);
    } else {
      // opening tag: auto-close same-type siblings before opening a new one
      if (name === 'li') {
        while (stack.includes('li')) out.push(`</${stack.pop()}>`);
      } else if (name === 'p') {
        while (stack.includes('p')) out.push(`</${stack.pop()}>`);
      }
      out.push(full);
      if (!voidTags.has(name)) stack.push(name);
    }
  }
  out.push(html.slice(idx));
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    return true;
  } catch {
    return false;
  }
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escRegex(q)})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        norm(part) === norm(q) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export default function FaqClient({ name, email, isStaff, unread }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [visible, setVisible] = useState(PAGE);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [voted, setVoted] = useState<Record<string, 'up' | 'down'>>({});
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askTopic, setAskTopic] = useState('start');
  const [askDevice, setAskDevice] = useState(DEVICES[0]!);
  const [askMsg, setAskMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);

  const total = FAQ_ITEMS.length;
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    FAQ_ITEMS.forEach((item) => {
      map[item.category] = (map[item.category] ?? 0) + 1;
    });
    return map;
  }, []);

  const hay = useCallback((item: FaqItem) =>
    norm(`${item.title} ${item.tag} ${item.search} ${item.answer}`), []);

  const filtered = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    const byCat = FAQ_ITEMS.filter((item) => category === 'all' || item.category === category);
    if (words.length === 0) return byCat;
    const exact = byCat.filter((item) => {
      const text = hay(item);
      return words.every((word) => text.includes(word));
    });
    return exact.length > 0
      ? exact
      : byCat.filter((item) => {
          const text = hay(item);
          return words.some((word) => text.includes(word));
        });
  }, [query, category, hay]);

  const suggestions = useMemo(() => {
    const q = norm(query.trim());
    if (q.length < 2) return [];
    return FAQ_ITEMS.filter((item) => hay(item).includes(q)).slice(0, 6);
  }, [query, hay]);

  const shown = filtered.slice(0, visible);

  /* ---------- ui helpers ---------- */
  const toast = useCallback((msg: string, error = false) => {
    const box = document.querySelector('.faq-page .toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast${error ? ' err' : ''}`;
    el.innerHTML = `<span class="ti">${error ? CROSS : CHECK}</span><span>${msg}</span>`;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 420);
    }, 3000);
  }, []);

  /* ---------- scroll chrome + reveal ---------- */
  useEffect(() => {
    const nav = document.querySelector('.faq-page nav.top');
    const bar = document.querySelector('.faq-page .progress-bar') as HTMLElement | null;
    const toTop = document.querySelector('.faq-page .to-top');
    const tick = () => {
      const y = window.scrollY;
      nav?.classList.toggle('scrolled', y > 10);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = `${h > 0 ? (y / h) * 100 : 0}%`;
      toTop?.classList.toggle('show', y > 520);
      document.querySelectorAll<HTMLElement>('.faq-page .reveal').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
      });
    };
    window.addEventListener('scroll', tick, { passive: true });
    tick();
    return () => window.removeEventListener('scroll', tick);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement !== searchRef.current && !askOpen) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setSuggestOpen(false);
        setAskOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [askOpen]);

  useEffect(() => {
    document.body.style.overflow = askOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [askOpen]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      if (FAQ_ITEMS.some((item) => item.id === hash)) {
        setQuery('');
        setCategory('all');
        setVisible(PAGE);
        setOpen((prev) => ({ ...prev, [hash]: true }));
      }
      const y = el.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, 320);
    return () => clearTimeout(timer);
  }, []);

  /* ---------- actions ---------- */
  const pickCategory = (key: string) => {
    setCategory(key);
    setVisible(PAGE);
  };

  const resetAll = () => {
    setQuery('');
    setCategory('all');
    setVisible(PAGE);
    setSuggestOpen(false);
    toast('Фильтры сброшены');
  };

  const goToItem = (id: string) => {
    const index = FAQ_ITEMS.findIndex((item) => item.id === id);
    if (index < 0) return;
    setQuery('');
    setCategory('all');
    setVisible(Math.max(PAGE, (Math.floor(index / PAGE) + 1) * PAGE));
    setOpen((prev) => ({ ...prev, [id]: true }));
    setSuggestOpen(false);
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top: y, behavior: 'smooth' });
      el.classList.add('flash');
      el.animate(
        [
          { boxShadow: '0 0 0 0 rgba(183,255,69,.5)' },
          { boxShadow: '0 0 0 12px rgba(183,255,69,0)' },
        ],
        { duration: 1200, easing: 'ease-out' },
      );
    }, 120);
  };

  const toggle = (id: string) => {
    const next = !open[id];
    setOpen((prev) => ({ ...prev, [id]: next }));
    if (next && typeof history !== 'undefined') history.replaceState(null, '', `#${id}`);
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    shown.forEach((item) => {
      next[item.id] = true;
    });
    setOpen((prev) => ({ ...prev, ...next }));
    toast('Все ответы развёрнуты');
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    shown.forEach((item) => {
      next[item.id] = false;
    });
    setOpen((prev) => ({ ...prev, ...next }));
  };

  const openAsk = (prefill = '') => {
    setMenuOpen(false);
    setAskTopic(category === 'all' ? 'start' : category);
    setAskMsg(prefill ? `Вопрос из FAQ: ${prefill}\n\nЧто именно не получилось: ` : '');
    setTicketId(null);
    setSendError(null);
    setAskOpen(true);
    setTimeout(() => {
      document.getElementById('faq-msg')?.focus();
    }, 280);
  };

  const submitAsk = async () => {
    if (sending) return;
    const message = askMsg.trim();
    if (message.length < 10) {
      setSendError('Опишите проблему подробнее — минимум 10 символов.');
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const topicLabel =
        FAQ_CATEGORIES.find((c) => c.key === askTopic)?.label ?? 'Общий вопрос';
      const form = new FormData();
      form.set('subject', `[FAQ] ${topicLabel}`.slice(0, 120));
      form.set('body', `Устройство: ${askDevice}\nТема из FAQ: ${topicLabel}\n\n${message}`.slice(0, 4000));
      const res = await fetch('/api/tickets', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || typeof data.id !== 'string' || data.id.length === 0) {
        const errors: Record<string, string> = {
          unauthorized: 'Сессия истекла — войдите в кабинет заново.',
          bad_request: 'Проверьте текст обращения и попробуйте ещё раз.',
        };
        setSendError(errors[data.error ?? ''] ?? 'Не удалось отправить обращение. Попробуйте ещё раз.');
        return;
      }
      setTicketId(data.id);
      toast('Обращение отправлено в поддержку');
    } catch {
      setSendError('Не удалось связаться с сервером. Попробуйте ещё раз.');
    } finally {
      setSending(false);
    }
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen || suggestions.length === 0) return;
    const max = suggestions.length - 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSuggestIndex((i) => Math.min(max, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSuggestIndex((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter' && suggestIndex >= 0) {
      event.preventDefault();
      goToItem(suggestions[suggestIndex]!.id);
    } else if (event.key === 'Escape') {
      setSuggestOpen(false);
    }
  };

  const navLinks = [
    { href: '/', label: 'Панель', icon: LayoutDashboard, active: false },
    { href: '/subscription', label: 'Мои ключи', icon: KeyRound, active: false },
    { href: '/faq', label: 'Инструкции', icon: CircleHelp, active: true },
    { href: '/support', label: 'Поддержка', icon: LifeBuoy, active: false },
  ];

  return (
    <div className="faq-page">
      <div className="bg-fx" aria-hidden>
        <div className="grid" />
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="progress-bar" aria-hidden />

      <div className="wrap">
        <nav className="top" id="nav">
          <div className="inner">
            <Link href="/" className="brand" aria-label="3set — на главную">
              <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden>
                <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" stroke="#b7ff45" strokeOpacity=".35" />
                <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>3<em>set</em><span className="dom mono">.online</span></span>
            </Link>
            <div className="nav-links">
              {navLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={`nl${item.active ? ' active' : ''}`}>
                    <Icon aria-hidden />{item.label}
                    {item.href === '/support' && unread > 0 && (
                      <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="nav-right">
              {isStaff && (
                <Link href="/admin" className="btn btn-light sm" style={{ height: 40 }}>
                  <ShieldCheck aria-hidden />Админ-панель
                </Link>
              )}
              <Link href="/profile" className="avatar" title={email ?? 'Профиль'} aria-label="Профиль">
                {(name.trim()[0] ?? '?').toUpperCase()}<span className="dot" />
              </Link>
              <button
                className={`burger${menuOpen ? ' open' : ''}`}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Меню"
                aria-expanded={menuOpen}
              >
                <span />
              </button>
            </div>
          </div>
          <div className={`mobile-menu${menuOpen ? ' open' : ''}`}>
            <div className="mm-inner">
              {navLinks.map((item) => (
                <Link key={item.href} href={item.href} className="nl" onClick={() => setMenuOpen(false)}>
                  {item.label}
                </Link>
              ))}
              {isStaff && (
                <Link href="/admin" className="nl" onClick={() => setMenuOpen(false)}>Админ-панель</Link>
              )}
              <button className="btn btn-primary block" style={{ marginTop: 6 }} onClick={() => openAsk('')}>
                Задать вопрос
              </button>
            </div>
          </div>
        </nav>

        <main id="top">
          <section className="hero">
            <div className="card hero-main reveal">
              <div>
                <span className="kicker">Помощь 3set</span>
                <h1 className="page-title" style={{ marginTop: 8 }}>Чем помочь?</h1>
                <p className="muted" style={{ margin: '10px 0 0', maxWidth: '56ch' }}>
                  Подключение, оплата и настройки — найдите ответ в базе знаний или выберите тему ниже.
                  База обновляется еженедельно.
                </p>
              </div>

              <div className={`search-wrap${query ? ' has-q' : ''}`}>
                <div className="search-big">
                  <Search className="si" aria-hidden />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Например: не работает VPN или как добавить ключ"
                    aria-label="Поиск по вопросам и ответам"
                    onFocus={() => setSuggestOpen(query.trim().length >= 2)}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setVisible(PAGE);
                      setSuggestOpen(e.target.value.trim().length >= 2);
                      setSuggestIndex(-1);
                    }}
                    onKeyDown={onSearchKeyDown}
                  />
                  <span className="kbd mono">/</span>
                  <button
                    className="clear-btn"
                    aria-label="Очистить поиск"
                    onClick={() => {
                      setQuery('');
                      setVisible(PAGE);
                      setSuggestOpen(false);
                      searchRef.current?.focus();
                    }}
                  >
                    <X aria-hidden />
                  </button>
                </div>
                {suggestOpen && suggestions.length > 0 && (
                  <div className="suggest open" role="listbox" aria-label="Подсказки">
                    {suggestions.map((item, i) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={i === suggestIndex}
                        className={`sg${i === suggestIndex ? ' sel' : ''}`}
                        onMouseEnter={() => setSuggestIndex(i)}
                        onClick={() => goToItem(item.id)}
                      >
                        <span className="sgi"><Search aria-hidden /></span>
                        <span>
                          <span className="sgt">{item.title}</span>
                          <span className="sgc">
                            {FAQ_CATEGORIES.find((c) => c.key === item.category)?.label} · {item.tag}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {suggestOpen && query.trim().length >= 2 && suggestions.length === 0 && (
                  <div className="suggest open">
                    <div className="sg-empty">Ничего не найдено — попробуйте «подключить», «ошибка», «оплата».</div>
                  </div>
                )}
              </div>

              <div className="chips">
                <span className="label" style={{ marginRight: 2 }}>Часто ищут</span>
                {POPULAR.map((p) => (
                  <button
                    key={p}
                    className="chip"
                    onClick={() => {
                      setQuery(p);
                      setVisible(PAGE);
                      setSuggestOpen(false);
                      document.getElementById('answers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="card hero-stats reveal" style={{ ['--d' as string]: '120ms' }}>
              <div className="hstat">
                <span className="hic"><BookOpen aria-hidden /></span>
                <div><b>{total}</b><span>ответов в базе</span></div>
              </div>
              <div className="hstat">
                <span className="hic"><CircleHelp aria-hidden /></span>
                <div><b>{FAQ_CATEGORIES.length}</b><span>тем и разделов</span></div>
              </div>
              <div className="hstat">
                <span className="hic"><ShieldCheck aria-hidden /></span>
                <div><b>4 мин</b><span>средний ответ поддержки</span></div>
              </div>
              <div className="hstat">
                <span className="hic"><Zap aria-hidden /></span>
                <div><b>99,98%</b><span>аптайм серверов</span></div>
              </div>
            </div>
          </section>

          <section id="start">
            <div className="sec-head reveal">
              <div>
                <span className="kicker">Быстрый старт</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Первое подключение</h2>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5, maxWidth: '62ch' }}>
                  Приложение — только клиент. Доступ появляется после импорта вашей подписки 3set.
                </p>
              </div>
              <span className="pill ok"><span className="pdot" />~3 минуты</span>
            </div>

            <div className="steps-grid">
              {QUICK_START.map((step, i) => {
                const Icon = step.icon;
                return (
                  <article key={step.n} className="step reveal" style={{ ['--d' as string]: `${i * 80}ms` }}>
                    <span className="sn mono">{step.n}</span>
                    <span className="sic"><Icon aria-hidden /></span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </article>
                );
              })}
            </div>

            <div className="notice reveal">
              <span className="nic"><AlertTriangle aria-hidden /></span>
              <p>
                <b>Важно.</b> Не отправляйте ссылку подписки в чаты, не вставляйте её в онлайн-конвертеры
                и не публикуйте скриншот с QR-кодом. Любой, у кого есть ссылка, сможет использовать ваш
                трафик и занять слоты устройств.
              </p>
            </div>
          </section>

          <section id="answers">
            <div className="sec-head reveal">
              <div>
                <span className="kicker" id="totalKicker">{total} ответов</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Вопросы и ответы</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-quiet sm" onClick={expandAll}>
                  <ChevronUp aria-hidden />Развернуть все
                </button>
                <button className="btn btn-quiet sm" onClick={collapseAll}>
                  <ChevronUp className="flip" aria-hidden />Свернуть все
                </button>
              </div>
            </div>

            <div className="faq-layout">
              <aside className="sidebar reveal" aria-label="Темы">
                <p className="side-title">Темы</p>
                <button
                  type="button"
                  className={`topic${category === 'all' ? ' on' : ''}`}
                  onClick={() => pickCategory('all')}
                >
                  <span className="ti"><CircleHelp aria-hidden /></span>
                  <span className="tn">Все</span>
                  <span className="tc">{total}</span>
                </button>
                {FAQ_CATEGORIES.map((cat) => {
                  const Icon = CAT_ICONS[cat.key] ?? CircleHelp;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      className={`topic${category === cat.key ? ' on' : ''}`}
                      onClick={() => pickCategory(cat.key)}
                    >
                      <span className="ti"><Icon aria-hidden /></span>
                      <span className="tn">{cat.label}</span>
                      <span className="tc">{counts[cat.key] ?? cat.count}</span>
                    </button>
                  );
                })}
              </aside>

              <div className="faq-main">
                <div className="list-bar">
                  <span className="cnt" aria-live="polite">
                    Показано {shown.length} из {filtered.length}
                  </span>
                  <span className="cnt dim">
                    {category === 'all'
                      ? 'Все темы'
                      : (FAQ_CATEGORIES.find((c) => c.key === category)?.label ?? 'Все темы')}
                  </span>
                </div>

                <div className="faq-list">
                  {shown.map((item, i) => {
                    const isOpen = !!open[item.id];
                    return (
                      <article
                        key={item.id}
                        id={item.id}
                        className={`faq-item reveal${isOpen ? ' open' : ''}`}
                        style={{ ['--d' as string]: `${Math.min(i * 45, 360)}ms` }}
                      >
                        <button
                          type="button"
                          className="faq-q"
                          aria-expanded={isOpen}
                          aria-controls={`${item.id}-a`}
                          onClick={() => toggle(item.id)}
                        >
                          <span className="qt">
                            <span className="qtag mono">{item.tag}</span>
                            <span className="qh"><Highlight text={item.title} query={query} /></span>
                          </span>
                          <span className="plus"><Plus aria-hidden /></span>
                        </button>
                        <div className="faq-a" id={`${item.id}-a`}>
                          <div className="in">
                            <div
                              className="faq-body"
                              // Trusted static HTML from faq-data.ts (no user input).
                              dangerouslySetInnerHTML={{ __html: normalizeHtml(item.answer) }}
                            />
                            <div className="faq-foot">
                              <span className="q">Ответ помог?</span>
                              <button
                                type="button"
                                className={`fbtn${voted[item.id] === 'up' ? ' voted' : ''}`}
                                onClick={() => {
                                  setVoted((v) => ({ ...v, [item.id]: 'up' }));
                                  toast('Спасибо! Учтём в рейтинге статьи');
                                }}
                              >Да</button>
                              <button
                                type="button"
                                className={`fbtn${voted[item.id] === 'down' ? ' voted' : ''}`}
                                onClick={() => {
                                  setVoted((v) => ({ ...v, [item.id]: 'down' }));
                                  toast('Жаль. Передадим вопрос в поддержку — статью доработаем');
                                }}
                              >Нет</button>
                              <button
                                type="button"
                                className="fbtn push"
                                onClick={async () => {
                                  const url = `${location.origin}${location.pathname}#${item.id}`;
                                  const ok = await copyText(url);
                                  toast(ok ? 'Ссылка на вопрос скопирована' : 'Не удалось скопировать', !ok);
                                }}
                              >
                                <Copy aria-hidden />Ссылка
                              </button>
                              <button type="button" className="fbtn" onClick={() => openAsk(item.title)}>
                                <Send aria-hidden />Уточнить
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {filtered.length === 0 && (
                  <div className="empty show">
                    <span className="eic"><Search aria-hidden /></span>
                    <b style={{ fontSize: 16 }}>Ничего не нашлось</b>
                    <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: '40ch' }}>
                      Попробуйте короче сформулировать запрос или выберите тему. Если ответа нет — напишите нам, добавим статью.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button className="btn btn-ghost sm" onClick={resetAll}>Сбросить поиск</button>
                      <button className="btn btn-primary sm" onClick={() => openAsk('')}>Задать вопрос</button>
                    </div>
                  </div>
                )}

                {filtered.length > visible && (
                  <button className="btn btn-ghost more-btn" onClick={() => setVisible((v) => v + PAGE)}>
                    Показать ещё · {filtered.length - visible}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section id="support">
            <div className="card support reveal">
              <span className="sic"><LifeBuoy aria-hidden /></span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <span className="kicker">Поддержка 3set</span>
                <h3 style={{ fontSize: 19, fontWeight: 600, margin: '6px 0' }}>Поможем разобраться</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                  Не нашли ответ? Напишите, что случилось и на каком устройстве — приложите версию ОС и название
                  приложения. Отвечаем круглосуточно.
                </p>
              </div>
              <div className="chan">
                <button className="btn btn-primary" onClick={() => openAsk('')}>
                  <Send aria-hidden /><span>Задать вопрос</span>
                </button>
                <a className="btn btn-ghost" href="https://t.me/threeSet_bot" target="_blank" rel="noopener noreferrer">
                  <Send aria-hidden /><span>Telegram</span>
                </a>
              </div>
            </div>
          </section>
        </main>

        <footer>
          <div className="f-inner">
            <div>
              <div className="brand" style={{ fontSize: 15 }}>
                <svg className="mark" viewBox="0 0 32 32" fill="none" style={{ width: 26, height: 26 }} aria-hidden>
                  <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                  <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>3<em>set</em><span className="dom mono">.online</span></span>
              </div>
              <p className="dim" style={{ fontSize: 12.5, margin: '8px 0 0' }}>VPN-подписки: покупка и управление ключами · © 2026</p>
            </div>
            <div className="f-links">
              <Link href="/subscription">Мои ключи</Link>
              <Link href="#start">Быстрый старт</Link>
              <Link href="#answers">Инструкции</Link>
              <Link href="/support">Поддержка</Link>
            </div>
          </div>
        </footer>
      </div>

      <div className={`overlay${askOpen ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="askTitle"
        onClick={(e) => { if (e.target === e.currentTarget) setAskOpen(false); }}>
        <div className="modal">
          <div className="modal-head">
            <h3 id="askTitle">Задать вопрос поддержке</h3>
            <button className="icon-btn" onClick={() => setAskOpen(false)} aria-label="Закрыть"><X aria-hidden /></button>
          </div>
          {ticketId === null ? (
            <>
              <div className="field">
                <label className="label" htmlFor="ask-topic">Тема</label>
                <select
                  id="ask-topic"
                  className="select"
                  value={askTopic}
                  onChange={(e) => setAskTopic(e.target.value)}
                >
                  {FAQ_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="ask-device">Устройство и система</label>
                <select
                  id="ask-device"
                  className="select"
                  value={askDevice}
                  onChange={(e) => setAskDevice(e.target.value)}
                >
                  {DEVICES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="faq-msg">Что случилось</label>
                <textarea
                  id="faq-msg"
                  className={`textarea${sendError ? ' shake' : ''}`}
                  value={askMsg}
                  onChange={(e) => setAskMsg(e.target.value)}
                  placeholder="Опишите проблему: что делали, какой текст ошибки, какое приложение используете"
                />
              </div>
              <p className="dim" style={{ fontSize: 11.5, margin: '0 0 16px' }}>
                Отвечаем в чате и на {email ?? 'вашу почту'}. Среднее время ответа — 4 минуты.
              </p>
              {sendError && <p role="alert" style={{ color: 'var(--red)', fontSize: 13, margin: '0 0 12px' }}>{sendError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setAskOpen(false)}>Отмена</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void submitAsk()} disabled={sending}>
                  {sending ? <><span className="spinner" /> Отправляем…</> : 'Отправить'}
                </button>
              </div>
            </>
          ) : (
            <div className="success show">
              <span className="sic" dangerouslySetInnerHTML={{ __html: CHECK }} />
              <b style={{ fontSize: 16 }}>Обращение отправлено</b>
              <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: '36ch' }}>
                Тикет <span className="mono" style={{ color: 'var(--lime)' }}>#{ticketId.slice(-6).toUpperCase()}</span> создан.
                Ответ придёт в чат и на почту — обычно за 4–10 минут.
              </p>
              <Link href={`/support/${encodeURIComponent(ticketId)}`} className="btn btn-primary sm" onClick={() => setAskOpen(false)}>
                Открыть тикет
              </Link>
              <button className="btn btn-ghost sm" onClick={() => setAskOpen(false)}>Закрыть</button>
            </div>
          )}
        </div>
      </div>

      <button className="to-top" aria-label="Наверх" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <ChevronUp aria-hidden />
      </button>
      <div className="toasts" aria-live="polite" />
    </div>
  );
}
