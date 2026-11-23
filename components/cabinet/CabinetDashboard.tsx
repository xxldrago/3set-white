'use client';

// Cabinet dashboard — dark redesign (3set dashboard template).
// All interactive pieces (tariff calculator, promo, device modal, FAQ, toasts)
// live in this island; real data is passed from the server page and writes go
// through the same session-gated BFF routes the rest of the cabinet uses.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleHelp,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Monitor,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import LabelEditor from '@/components/LabelEditor';
import PwaInstallCta from '@/components/PwaInstallCta';
import SocialShare from '@/components/SocialShare';
import { t, tp } from '@/lib/i18n';
import { TARIFF_DAYS, TARIFF_MIN_DEVICES, tariffDaysLabel } from '@/lib/tariff-grid';

export interface CabinetKeyView {
  id: string;
  name: string;
  statusKind: string;
  daysLeft: number | null;
  expiresAt: string | null;
  devices: number | null;
  deviceLimit: number | null;
  subscriptionUrl: string | null;
  label?: string | null;
}

interface Props {
  name: string;
  email: string | null;
  isStaff: boolean;
  keys: CabinetKeyView[];
  referralLink: string | null;
  refDays: { user: number; invitee: number };
  unreadInitial: number;
}

const RUB = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ₽`;
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

function toastBox(message: string, error = false): void {
  const box = document.querySelector('.cabinet .toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast${error ? ' err' : ''}`;
  el.innerHTML =
    `<span class="ti">${error ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' : CHECK}</span><span>${message}</span>`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 420);
  }, 2800);
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

export default function CabinetDashboard({
  name,
  email,
  isStaff,
  keys,
  referralLink,
  refDays,
  unreadInitial,
}: Props) {
  const pathname = usePathname();
  const key = keys[0] ?? null;
  const active = key?.statusKind === 'active';
  const daysLeft = key?.daysLeft ?? 0;
  const deviceLimit = key?.deviceLimit ?? 0;
  const devices = key?.devices ?? 0;

  const [greeting, setGreeting] = useState('Привет');
  const [today, setToday] = useState('');
  const [unread, setUnread] = useState(unreadInitial);
  const [terms] = useState<readonly number[]>(TARIFF_DAYS);
  const [term, setTerm] = useState<number>(TARIFF_DAYS.includes(30) ? 30 : (TARIFF_DAYS[0] as number));
  const [count, setCount] = useState(TARIFF_MIN_DEVICES);
  const [termPrices, setTermPrices] = useState<Record<number, number>>({});
  const [promo, setPromo] = useState<string | null>(null);
  const [promoText, setPromoText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deviceRows, setDeviceRows] = useState<Array<{ token: string; name: string | null; label: string | null }>>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [alertHidden, setAlertHidden] = useState(false);
  const [installHidden, setInstallHidden] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [keyLabel, setKeyLabel] = useState<string | null>(keys[0]?.label ?? null);
  const [addDevices, setAddDevices] = useState(1);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingsRef = useRef<number[]>([]);
  // Initialize sparkline data on mount (Math.random is impure during render).
  useEffect(() => {
    if (pingsRef.current.length === 0) {
      pingsRef.current = Array.from({ length: 16 }, () => 18 + Math.round(Math.random() * 22));
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    const g = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(g);
    setToday(now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
  }, []);

  const refreshUnread = useCallback(() => {
    void fetch('/api/tickets/unread')
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as { count?: unknown };
        if (typeof body.count === 'number') setUnread(Math.max(0, body.count));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshUnread();
    window.addEventListener('focus', refreshUnread);
    window.addEventListener('ticket-unread-changed', refreshUnread);
    return () => {
      window.removeEventListener('focus', refreshUnread);
      window.removeEventListener('ticket-unread-changed', refreshUnread);
    };
  }, [refreshUnread]);

  // Progress bar + sticky nav.
  useEffect(() => {
    const nav = document.querySelector('.cabinet nav.cab-nav');
    const bar = document.querySelector('.cabinet .cab-progress') as HTMLElement | null;
    const tick = () => {
      const y = window.scrollY;
      nav?.classList.toggle('scrolled', y > 10);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = `${h > 0 ? (y / h) * 100 : 0}%`;
    };
    window.addEventListener('scroll', tick, { passive: true });
    tick();
    return () => window.removeEventListener('scroll', tick);
  }, []);

  // Reveal-on-scroll.
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.cabinet .reveal'));
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [alertHidden, installHidden]);

  // Live ping / sparkline.
  useEffect(() => {
    const id = setInterval(() => {
      const p = pingsRef.current;
      p.shift();
      p.push(Math.max(12, Math.min(64, p[p.length - 1]! + Math.round((Math.random() - 0.5) * 12))));
      const max = Math.max(...p);
      const min = Math.min(...p);
      const span = Math.max(1, max - min);
      const pts = p.map((x, i) => `${((i / (p.length - 1)) * 300).toFixed(1)},${(50 - ((max - x) / span) * 40).toFixed(1)}`).join(' ');
      const line = document.querySelector('.cabinet #sparkLine');
      const area = document.querySelector('.cabinet #sparkArea');
      line?.setAttribute('points', pts);
      area?.setAttribute('points', `0,56 ${pts} 300,56`);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // Debounced live prices for EVERY offered term, so the term cards show a
  // real price (not a placeholder). A failed quote clears that term only.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setTermPrices({});
      void (async () => {
        const entries = await Promise.all(
          terms.map(async (d) => {
            try {
              const res = await fetch(`/api/pricing?days=${d}&devices=${count}`, {
                signal: controller.signal,
              });
              if (!res.ok) return null;
              const body = (await res.json()) as { price?: unknown };
              if (typeof body.price !== 'number' || !Number.isFinite(body.price)) return null;
              return [d, body.price] as const;
            } catch {
              return null;
            }
          }),
        );
        if (controller.signal.aborted) return;
        const next: Record<number, number> = {};
        for (const entry of entries) if (entry) next[entry[0]] = entry[1];
        setTermPrices(next);
      })();
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [count, terms]);

  const loadDevices = useCallback(async () => {
    if (!key) return;
    setDevicesLoading(true);
    try {
      const res = await fetch(`/api/keys/${encodeURIComponent(key.id)}/devices`);
      if (res.ok) {
        const body = (await res.json()) as {
          devices?: Array<{ token: string; name: string | null; label?: string | null }>;
        };
        setDeviceRows(
          (body.devices ?? []).map((d) => ({ token: d.token, name: d.name, label: d.label ?? null })),
        );
      } else {
        setDeviceRows([]);
      }
    } catch {
      setDeviceRows([]);
    } finally {
      setDevicesLoading(false);
    }
  }, [key]);

  const openModal = () => {
    setModalOpen(true);
    void loadDevices();
    document.body.style.overflow = 'hidden';
  };
  const closeModal = () => {
    setModalOpen(false);
    document.body.style.overflow = '';
  };

  const detachDevice = async (token: string, name: string) => {
    if (!key) return;
    const res = await fetch(
      `/api/keys/${encodeURIComponent(key.id)}/devices/${encodeURIComponent(token)}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      setDeviceRows((rows) => rows.filter((r) => r.token !== token));
      toastBox(`${name} отключено — слот свободен`);
      window.dispatchEvent(new Event('ticket-unread-changed'));
      window.location.reload();
    } else {
      toastBox('Не удалось отключить устройство', true);
    }
  };

  const applyPromo = () => {
    const code = promoText.trim().toUpperCase();
    if (!code) {
      toastBox('Введите промокод', true);
      return;
    }
    setPromo(code);
    toastBox(`Промокод ${code} учтён при оплате`);
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.offsetTop - 90, behavior: 'smooth' });
  };

  const doPay = async (body: Record<string, unknown>) => {
    if (paying) return;
    setPaying(true);
    setPayError(null);
    try {
      // zod `.optional()` rejects `null` (only `undefined` is allowed), so a
      // null promo must be omitted entirely rather than sent as JSON null.
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (value !== null && value !== undefined) payload[key] = value;
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || typeof data.url !== 'string' || data.url.length === 0) {
        const code = data.error ?? `http_${res.status}`;
        const messages: Record<string, string> = {
          promo_invalid: 'Промокод недействителен или уже использован — уберите его и попробуйте снова.',
          payment_required: 'На балансе провайдера недостаточно средств — пополните баланс API.',
          rate_limited: 'Слишком много попыток. Повторите через минуту.',
          unauthorized: 'Сессия истекла — войдите в кабинет заново.',
          unauthorized_error: 'Сессия истекла — войдите в кабинет заново.',
          bad_request: 'Некорректные параметры заказа — проверьте срок и число устройств.',
        };
        setPayError(messages[code] ?? `Не удалось создать платёж (${code}). Попробуйте ещё раз.`);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setPayError('Не удалось связаться с сервером оплаты. Попробуйте ещё раз.');
    } finally {
      setPaying(false);
    }
  };

  const navLinks = [
    { href: '/', label: 'Панель', icon: LayoutDashboard, id: 'home' },
    { href: '/subscription', label: 'Мои ключи', icon: KeyRound, id: 'subscription' },
    { href: '/faq', label: 'Инструкции', icon: CircleHelp, id: 'faq' },
    { href: '/support', label: 'Поддержка', icon: LifeBuoy, id: 'support' },
  ];

  const RING_C = 2 * Math.PI * 56;
  const ringPct = active ? Math.min(1, daysLeft / Math.max(1, term)) : 0;
  const price = termPrices[term] ?? null;

  return (
    <div className="cabinet">
      <div className="bg-fx" aria-hidden>
        <div className="grid" />
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="cab-progress" aria-hidden />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d4ff85" />
            <stop offset="100%" stopColor="#7fd41f" />
          </linearGradient>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b7ff45" stopOpacity=".55" />
            <stop offset="100%" stopColor="#b7ff45" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="cab-wrap">
        <nav className={`cab-nav${pathname === '/' ? '' : ''}`} id="nav">
          <div className="inner">
            <Link href="/" className="brand" aria-label="3set — на главную">
              <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden>
                <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" stroke="#b7ff45" strokeOpacity=".35" strokeWidth="1" />
                <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>3<em>set</em><span className="dom mono">.online</span></span>
            </Link>

            <div className="nav-links">
              {navLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className="nl">
                    <Icon aria-hidden />
                    {item.label}
                    {item.id === 'support' && unread > 0 && (
                      <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="nav-right">
              <Link href="/profile" className="avatar" title={email ?? 'Профиль'} aria-label="Профиль">
                {(name.trim()[0] ?? '?').toUpperCase()}
                <span className="dot" />
              </Link>
              {isStaff && (
                <Link href="/admin" className="btn btn-ghost sm" style={{ height: 40 }}>
                  <ShieldCheck aria-hidden />
                  Админ
                </Link>
              )}
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
            </div>
          </div>
        </nav>

        <main className="cab-main">
          {/* HERO */}
          <section className="hero">
            <div className="card hero-main reveal">
              <div className="hi-row">
                <span className={`pill ${active ? 'ok' : 'warn'}`} id="statusPill">
                  <span className="pdot" />
                  {active ? 'VPN активен · защита включена' : 'Подписка истекла'}
                </span>
                <span className="pill" style={{ color: 'var(--dim)' }}>
                  <span className="mono" style={{ fontSize: 11.5 }}>{today}</span>
                </span>
              </div>
              <div>
                <span className="kicker">Личный кабинет</span>
                <h1 className="hero-title" style={{ marginTop: 8 }}>{greeting}, {name}</h1>
                <p className="muted" style={{ margin: '10px 0 0', maxWidth: '52ch' }}>
                  Управляй ключами, устройствами и подпиской 3set VPN в одном месте. Быстро, безопасно, без лишних кликов.
                </p>
              </div>
          {/* ALERT */}
          {!active && !alertHidden && (
            <div className="alert reveal" id="expiredAlert">
              <div className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                </svg>
              </div>
              <div className="txt">
                <b>{key ? `Подписка истекла ${fmtDate(key.expiresAt)}` : 'Подписки ещё нет'}</b>
                <span>Продлите доступ, чтобы устройства остались защищёнными.</span>
              </div>
              <button className="btn btn-primary" onClick={() => scrollTo('tariff')}>Продлить подписку</button>
              <button className="icon-btn" onClick={() => setAlertHidden(true)} aria-label="Скрыть">
                <X aria-hidden />
              </button>
            </div>
          )}


            <div className="kicker" style={{ marginTop: 4 }}>{t('subs.title')}</div>
            <article id="subscription" className="card reveal" style={{ ['--d' as string]: '80ms' }}>
              {key ? (
                <>
                  <div className="sub-top">
                    <div className="ring-wrap">
                      <svg className="ring" viewBox="0 0 132 132" aria-hidden>
                        <circle className="track" cx="66" cy="66" r="56" />
                        <circle
                          className="val"
                          cx="66"
                          cy="66"
                          r="56"
                          strokeDasharray={RING_C.toFixed(2)}
                          strokeDashoffset={(RING_C - RING_C * ringPct).toFixed(2)}
                          style={{ stroke: active ? 'url(#ringGrad)' : 'var(--amber)' }}
                        />
                      </svg>
                      <div className="ring-center"><b>{daysLeft}</b><span>дней</span></div>
                    </div>

                    <div className="sub-info">
                      <div className="sub-name">
                        <span className="ic"><KeyRound aria-hidden /></span>
                        <div>
                          <h3>{keyLabel ?? key.name}</h3>
                          <div className="label" style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Персональный ключ
                            <LabelEditor
                              url={`/api/keys/${encodeURIComponent(key.id)}`}
                              value={keyLabel}
                              triggerLabel="Переименовать подписку"
                              title="Название подписки"
                              hint="Видно только вам — в панели провайдера имя не меняется."
                              onSaved={setKeyLabel}
                              compact
                            />
                          </div>
                        </div>
                      </div>
                      <div className="sub-meta">
                        <span className={`pill ${active ? 'ok' : 'warn'}`}><span className="pdot" />{active ? 'Активна' : 'Истёк'}</span>
                        <span className="pill" style={{ color: 'var(--muted)' }}>Без логов</span>
                      </div>
                      <p className="muted" style={{ fontSize: 13.5, margin: '2px 0 0' }}>
                        {active
                          ? 'Всё работает. Устройства подключены к ближайшим серверам автоматически.'
                          : 'Доступ приостановлен. Продлите подписку — устройства переподключатся автоматически.'}
                      </p>
                    </div>
                  </div>

                  <div className="stat-grid">
                    <div className="stat"><span className="label">Осталось</span><b>{daysLeft} дн.</b><div className="bar"><i style={{ width: `${ringPct * 100}%` }} /></div></div>
                    <div className="stat"><span className="label">Устройства</span><b className="mono">{deviceLimit}/{devices}</b><div className="bar"><i style={{ width: `${deviceLimit > 0 ? Math.min(100, (devices / deviceLimit) * 100) : 0}%` }} /></div></div>
                    <div className="stat"><span className="label">Действует до</span><b>{fmtDate(key.expiresAt)}</b></div>
                  </div>

                  {key.subscriptionUrl && (
                    <div className="link-box">
                      <div className="link-row">
                        <span className="label">Ссылка подписки</span>
                        <button
                          className="btn btn-ghost sm"
                          onClick={async () => {
                            const ok = await copyText(key.subscriptionUrl!);
                            toastBox(ok ? 'Ссылка скопирована в буфер обмена' : 'Не удалось скопировать', !ok);
                          }}
                        >
                          <span dangerouslySetInnerHTML={{ __html: COPY_ICON }} />
                          Скопировать
                        </button>
                      </div>
                      <div className="link-val">
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flex: 'none' }} aria-hidden>
                          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                        </svg>
                        <code title={key.subscriptionUrl}>{key.subscriptionUrl}</code>
                      </div>
                    </div>
                  )}

                  <div className="actions" style={{ marginTop: 18 }}>
                    <Link href={`/install?key=${encodeURIComponent(key.id)}`} className="btn btn-primary">
                      <KeyRound aria-hidden />
                      Подключить
                    </Link>
                    <button className="btn btn-ghost" onClick={() => scrollTo('tariff')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
                      </svg>
                      Продлить
                    </button>
                    <button className="btn btn-ghost" onClick={openModal}>
                      <Smartphone aria-hidden />
                      Устройства
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={!active || deviceLimit >= 9999}
                      onClick={() => setShowUpgrade((v) => !v)}
                    >
                      <Monitor aria-hidden />
                      Добавить устройства
                    </button>
                  </div>

                  {showUpgrade && active && deviceLimit < 9999 && (
                    <div className="card" style={{ marginTop: 16, padding: 18, boxShadow: 'none' }}>
                      <span className="opt-label">Сколько устройств добавить</span>
                      <div className="stepper">
                        <button className="step-btn" aria-label="Уменьшить" disabled={addDevices <= 1} onClick={() => setAddDevices((n) => Math.max(1, n - 1))}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
                        </button>
                        <input
                          className="step-num"
                          type="number"
                          min={1}
                          max={9999 - deviceLimit}
                          value={addDevices}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value, 10);
                            if (Number.isFinite(n)) setAddDevices(Math.min(9999 - deviceLimit, Math.max(1, n)));
                          }}
                          aria-label="Число добавляемых устройств"
                          style={{ width: 64, background: 'transparent', border: 'none', outline: 'none' }}
                        />
                        <button className="step-btn" aria-label="Увеличить" disabled={addDevices >= 9999 - deviceLimit} onClick={() => setAddDevices((n) => Math.min(9999 - deviceLimit, n + 1))}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>
                        </button>
                        <span className="dim" style={{ fontSize: 12, marginLeft: 8 }}>
                          максимум {9999 - deviceLimit} · доплата пропорционально сроку
                        </span>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <button
                          className="btn btn-primary block"
                          disabled={paying || addDevices < 1}
                          onClick={() => void doPay({ kind: 'upgrade', keyId: key.id, addDevices })}
                        >
                          {paying ? 'Создаём платёж…' : 'Добавить устройства'}
                        </button>
                        {payError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{payError}</p>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
                  <span style={{ width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(183,255,69,.16)', color: 'var(--lime)' }}>
                    <KeyRound aria-hidden />
                  </span>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>{t('subs.emptyHeading')}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{t('subs.emptyBody')}</p>
                  <button className="btn btn-primary" onClick={() => scrollTo('tariff')}>Выбрать тариф</button>
                </div>
              )}
            </article>
            </div>
          </section>

          {/* TARIFF */}
          <section id="tariff">
            <div className="sec-head reveal">
              <div>
                <span className="kicker">Тарифы</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Выберите тариф</h2>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>Срок и число устройств — цена пересчитается мгновенно.</p>
              </div>
              <span className="pill ok"><span className="pdot" />Оплата за 30 секунд</span>
            </div>

            <div className="tariff">
              <div className="card reveal">
                <span className="opt-label">Срок подписки</span>
                <div className="terms" id="terms" role="group" aria-label="Срок подписки">
                  {terms.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="term"
                      aria-pressed={d === term}
                      onClick={() => setTerm(d)}
                    >
                      {d === 30 && <span className="badge">Хит</span>}
                      <span className="check" dangerouslySetInnerHTML={{ __html: CHECK }} />
                      <span className="t-body">
                        <span className="t-label">{tariffDaysLabel(d)}</span>
                        <span className="t-price">{termPrices[d] === undefined ? '—' : RUB(termPrices[d]!)}</span>
                        <span className="t-per">
                          {termPrices[d] === undefined
                            ? 'цена уточняется…'
                            : `≈ ${(termPrices[d]! / d / TARIFF_MIN_DEVICES).toFixed(1).replace('.', ',')} ₽/день · устр.`}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 26, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <span className="opt-label">Устройства</span>
                    <div className="stepper">
                      <button className="step-btn" aria-label="Уменьшить число устройств" disabled={count <= TARIFF_MIN_DEVICES} onClick={() => setCount((c) => Math.max(TARIFF_MIN_DEVICES, c - 1))}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
                      </button>
                      <input
                        className="step-num"
                        type="number"
                        min={TARIFF_MIN_DEVICES}
                        max={9999}
                        value={count}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          if (Number.isFinite(n)) setCount(Math.min(9999, Math.max(TARIFF_MIN_DEVICES, n)));
                        }}
                        aria-label="Число устройств"
                        style={{ width: 64, background: 'transparent', border: 'none', outline: 'none' }}
                      />
                      <button className="step-btn" aria-label="Увеличить число устройств" onClick={() => setCount((c) => Math.min(9999, c + 1))}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>
                      </button>
                      <div className="dots" aria-hidden>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => <i key={i} className={i <= count ? 'on' : ''} />)}
                      </div>
                    </div>
                  </div>
                  <p className="dim" style={{ fontSize: 12, margin: 0, maxWidth: '24ch' }}>
                    Все устройства работают одновременно, трафик без ограничений.
                  </p>
                </div>
              </div>

              <aside className="card summary reveal" style={{ ['--d' as string]: '120ms' }}>
                <div>
                  <span className="label">К оплате</span>
                  <div className="price-row" style={{ marginTop: 8 }}>
                    <span className="price" id="priceVal">{price === null ? '—' : RUB(price)}</span>
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                    ≈ {price === null ? '—' : `${(price / term).toFixed(1).replace('.', ',')} ₽ / день`} · {count} устр.
                  </div>
                </div>

                <div className="sum-lines">
                  <div className="sum-line"><span>{tariffDaysLabel(term)}</span><b>{price === null ? '—' : RUB(price)}</b></div>
                  <div className="sum-line"><span>Устройства</span><b>{count}</b></div>
                  {promo && <div className="sum-line discount"><span>Промокод <b className="mono" style={{ fontSize: 12 }}>{promo}</b></span><b>учтён</b></div>}
                </div>

                <div>
                  <span className="opt-label" style={{ marginBottom: 8 }}>Промокод (необязательно)</span>
                  {promo === null ? (
                    <div className="promo">
                      <input
                        className="input"
                        placeholder="Например, LIME15"
                        value={promoText}
                        onChange={(e) => setPromoText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') applyPromo(); }}
                        aria-label="Промокод"
                      />
                      <button className="btn btn-ghost" style={{ height: 46 }} onClick={applyPromo}>Применить</button>
                    </div>
                  ) : (
                    <div className="promo-applied">
                      <span dangerouslySetInnerHTML={{ __html: CHECK }} />
                      <span>Промокод {promo} применён</span>
                      <button onClick={() => setPromo(null)}>убрать</button>
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-primary block"
                  style={{ height: 52 }}
                  disabled={price === null || paying}
                  onClick={() => void doPay({ kind: 'new', days: term, devices: count, promoCode: promo })}
                >
                  {paying ? 'Создаём платёж…' : 'Купить и продлить'}
                </button>
                {payError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{payError}</p>}
                <div className="pay-icons">
                  <span className="mono">МИР</span>·<span className="mono">VISA</span>·<span className="mono">MC</span>·<span className="mono">SBP</span>·<span className="mono">CRYPTO</span>
                </div>
              </aside>
            </div>
          </section>

          {/* REFERRAL */}
          <section id="referral">
            <div className="card reveal">
              <div className="ref">
                <div>
                  <span className="kicker">Бонусы</span>
                  <h2 className="sec-title" style={{ margin: '6px 0 8px' }}>
                    {t('home.refTitle', { n: refDays.user, days: tp('home.refDay', refDays.user) })}
                  </h2>
                  <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
                    {t('home.refText', { m: refDays.invitee, friendDays: tp('home.refDay', refDays.invitee) })}
                  </p>
                  <ol className="steps">
                    <li><span className="n">1</span>{t('home.refStep1')}</li>
                    <li><span className="n">2</span>{t('home.refStep2')}</li>
                    <li><span className="n">3</span>{t('home.refStep3')}</li>
                  </ol>
                  {referralLink && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                      <div className="link-val" style={{ flex: 1, minWidth: 220 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flex: 'none' }} aria-hidden>
                          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                        </svg>
                        <code>{referralLink}</code>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          const ok = await copyText(referralLink);
                          toastBox(ok ? 'Реферальная ссылка скопирована' : 'Не удалось скопировать', !ok);
                        }}
                      >
                        <span dangerouslySetInnerHTML={{ __html: COPY_ICON }} />
                        Копировать
                      </button>
                    </div>
                  )}
                  {referralLink && (
                    <SocialShare
                      url={referralLink}
                      text="Заходи в 3set VPN — быстрый и безопасный VPN по ссылке друга."
                    />
                  )}
                </div>

                <div className="gift">
                  <div className="shine" />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <span className="label">Приглашено</span>
                      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>0 <span className="dim" style={{ fontSize: 14, fontWeight: 700 }}>из 3</span></div>
                    </div>
                    <span className="pill ok">+{refDays.user} {tp('home.refDay', refDays.user)} за друга</span>
                  </div>
                  <div className="inv-grid" aria-hidden>
                    {[1, 2, 3].map((i) => (
                      <div className="inv" key={i}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
                        <span>свободно</span>
                      </div>
                    ))}
                  </div>
                  <div className="bar" style={{ height: 7 }}><i style={{ width: 0 }} /></div>
                  <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
                    Приглашайте друзей — бонусы начисляются за каждую первую оплату.
                  </p>
                  <Link href="/profile#referrals" className="btn btn-ghost block">{t('home.refCtaAuthed')}</Link>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section id="faq">
            <div className="sec-head reveal">
              <div>
                <span className="kicker">Помощь</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Частые вопросы</h2>
              </div>
              <Link href="/support" className="btn btn-quiet sm">Задать свой вопрос</Link>
            </div>
            <div className="card reveal acc" style={{ padding: 18 }}>
              {[
                { q: 'Как подключить VPN на устройстве?', a: 'Нажмите «Подключить» в карточке ключа — откроется пошаговая инструкция под вашу систему. Достаточно скопировать ссылку подписки в приложение.' },
                { q: 'Что будет после окончания подписки?', a: 'Ключ сохраняется в кабинете, устройства просто теряют доступ к серверам. После продления всё заработает автоматически.' },
                { q: 'Можно ли увеличить число устройств?', a: 'Да. Выберите нужное количество в калькуляторе тарифа — доплата рассчитывается автоматически. Либо отключите лишнее устройство в разделе «Устройства».' },
                { q: 'Ведёте ли вы логи трафика?', a: 'Нет. Мы храним только технический минимум: идентификатор ключа, срок действия и число подключений. IP-адреса и посещённые сайты не логируются.' },
              ].map((item, i) => (
                <div key={item.q} className={`acc-item${openFaq === i ? ' open' : ''}`}>
                  <button className="acc-q" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                    {item.q}
                    <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <div className="acc-a"><div><p>{item.a}</p></div></div>
                </div>
              ))}
            </div>
          </section>

          {/* INSTALL — on mobile offer PWA home-screen install instead of a store app */}
          {!installHidden && (
            <section id="install-guide">
              <div className="install reveal" id="installCard">
                <div className="install-mobile">
                  <div className="ic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" /><path d="M12 18h.01" /></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <PwaInstallCta onDismiss={() => setInstallHidden(true)} />
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>

        <footer id="support">
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
              <Link href="/support">Поддержка</Link>
              <Link href="/faq">Инструкции</Link>
              <Link href="/install">Инструкции</Link>
            </div>
          </div>
        </footer>
      </div>

      {/* DEVICES MODAL */}
      <div
        className={`overlay${modalOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Устройства"
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
      >
        <div className="modal">
          <div className="modal-head">
            <h3>Устройства <span className="dim mono" style={{ fontSize: 12 }}>{devices}/{deviceLimit}</span></h3>
            <button className="icon-btn" onClick={closeModal} aria-label="Закрыть"><X aria-hidden /></button>
          </div>
          {devicesLoading ? (
            <p className="muted" style={{ fontSize: 13 }}>Загружаем устройства…</p>
          ) : deviceRows.length === 0 ? (
            <p className="dim" style={{ fontSize: 13, margin: '6px 0 0' }}>Устройств нет. Подключите первое по ссылке подписки.</p>
          ) : (
            deviceRows.map((d) => (
              <div className="dev" key={d.token}>
                <span className="d-ic">
                  {/iphone|android|phone/i.test(d.label ?? d.name ?? '') ? <Smartphone aria-hidden /> : <Monitor aria-hidden />}
                </span>
                <span className="d-tx">
                  <b>{d.label ?? d.name ?? d.token}</b>
                  <span>токен {d.token.slice(0, 12)}</span>
                </span>
                <LabelEditor
                  compact
                  url={`/api/keys/${encodeURIComponent(key!.id)}/devices/${encodeURIComponent(d.token)}`}
                  value={d.label}
                  triggerLabel="Переименовать устройство"
                  title="Название устройства"
                  hint="Подпись видна только вам и не отправляется провайдеру."
                  onSaved={(label) => setDeviceRows((rows) => rows.map((r) => (r.token === d.token ? { ...r, label } : r)))}
                />
                <button className="d-act" onClick={() => void detachDevice(d.token, d.label ?? d.name ?? d.token)}>Отключить</button>
              </div>
            ))
          )}
          <p className="dim" style={{ fontSize: 12, margin: '14px 0 0' }}>Отключение устройства освобождает слот — подключите другое в любой момент.</p>
          <button className="btn btn-ghost block" style={{ marginTop: 14 }} onClick={closeModal}>Готово</button>
        </div>
      </div>

      <div className="toasts" aria-live="polite" />
      <div className="confetti" aria-hidden />
    </div>
  );
}
