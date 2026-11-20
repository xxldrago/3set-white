'use client';

// /subscription page in the keys.html prototype template.
// Everything rendered here comes from real data: keys are passed from the
// ownership-scoped server cache, prices come from /api/pricing, and every write
// (label, devices, orders) goes through the existing session-gated BFF routes.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  List,
  Mail,
  Minus,
  Monitor,
  MoreHorizontal,
  Pencil,
  PlugZap,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import LabelEditor from '@/components/LabelEditor';
import QrSvg from '@/components/QrSvg';
import {
  TARIFF_DAYS,
  TARIFF_MAX_DEVICES,
  TARIFF_MIN_DEVICES,
  tariffDaysLabel,
} from '@/lib/tariff-grid';

export interface SubscriptionKeyView {
  id: string;
  providerName: string | null;
  label: string | null;
  statusKind: 'active' | 'expiring' | 'expired' | 'pending' | 'unknown';
  isTrial: boolean;
  expiresAt: string | null;
  daysLeft: number;
  /** Live manageable-device count (falls back to the cached aggregate). */
  devices: number;
  deviceLimit: number;
  subscriptionUrl: string | null;
  /** Locally rendered QR SVG for subscriptionUrl (server-generated). */
  qrSvg: string | null;
}

interface Props {
  name: string;
  email: string | null;
  isStaff: boolean;
  unread: number;
  keys: SubscriptionKeyView[];
  notice?: string | null;
}

type UiStatus = 'active' | 'soon' | 'expired' | 'other';
type Filter = 'all' | UiStatus;
type Modal = null | 'devices' | 'rename' | 'qr' | 'slots';
type DeviceRow = { token: string; name: string | null; label: string | null };

interface Device {
  token: string;
  name: string | null;
}

const RUB = (n: number) => `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ₽`;
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const displayName = (k: SubscriptionKeyView) => k.label ?? k.providerName ?? k.id;
const shortId = (id: string) =>
  id.length > 16 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;

function uiStatus(k: SubscriptionKeyView): UiStatus {
  switch (k.statusKind) {
    case 'active':
      return 'active';
    case 'expiring':
      return 'soon';
    case 'expired':
      return 'expired';
    default:
      return 'other';
  }
}

const STATUS_META: Record<UiStatus, { cls: string; text: string }> = {
  active: { cls: 'ok', text: 'Активна' },
  soon: { cls: 'warn', text: 'Истекает' },
  expired: { cls: 'dead', text: 'Истёк' },
  other: { cls: 'warn', text: 'Ожидает' },
};

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'soon', label: 'Истекают' },
  { id: 'expired', label: 'Истёкшие' },
  { id: 'other', label: 'Прочие' },
];

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="3set — на главную">
      <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden>
        <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
        <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" stroke="#b7ff45" strokeOpacity=".35" />
        <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>3<em>set</em><span className="dom mono">.online</span></span>
    </Link>
  );
}

function KeyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l9 9M17 17l2-2M14 14l2-2" />
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flex: 'none' }} aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}

export default function SubscriptionDashboard({
  name,
  email,
  isStaff,
  unread,
  keys: initialKeys,
  notice,
}: Props) {
  const [keys, setKeys] = useState<SubscriptionKeyView[]>(initialKeys);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [term, setTerm] = useState<number>(TARIFF_DAYS.includes(30) ? 30 : (TARIFF_DAYS[0] as number));
  const [devices, setDevices] = useState<number>(TARIFF_MIN_DEVICES);
  const [termPrices, setTermPrices] = useState<Record<number, number>>({});
  const [promoText, setPromoText] = useState('');
  const [promo, setPromo] = useState<string | null>(null);
  const [promoFinal, setPromoFinal] = useState<number | null>(null);
  const [targetId, setTargetId] = useState<string>(() => {
    const renewable = initialKeys.find((k) => !k.isTrial);
    return renewable ? renewable.id : '__new__';
  });
  const [buying, setBuying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [modal, setModal] = useState<Modal>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deviceRows, setDeviceRows] = useState<DeviceRow[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [slots, setSlots] = useState(1);
  const [slotsPrice, setSlotsPrice] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [seenUrls, setSeenUrls] = useState<Record<string, boolean>>({});

  const ioRef = useRef<IntersectionObserver | null>(null);
  const activeKey = keys.find((k) => k.id === activeId) ?? null;

  /* ---------- ui helpers ---------- */
  const toast = useCallback((msg: string, error = false) => {
    const box = document.querySelector('.cabinet .toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast${error ? ' err' : ''}`;
    el.innerHTML =
      `<span class="ti">${error ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' : CHECK_ICON}</span><span>${msg}</span>`;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 420);
    }, 2800);
  }, []);

  const copyText = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
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
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /* ---------- scroll chrome + reveal ---------- */
  useEffect(() => {
    const nav = document.querySelector('.cabinet nav.cab-nav');
    const bar = document.querySelector('.cabinet .cab-progress') as HTMLElement | null;
    const tick = () => {
      const y = window.scrollY;
      nav?.classList.toggle('scrolled', y > 10);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = `${h > 0 ? (y / h) * 100 : 0}%`;
      // Reveal on scroll without depending solely on IntersectionObserver —
      // some embedded browsers never fire it, and invisible content is worse
      // than a missing animation.
      document.querySelectorAll<HTMLElement>('.cabinet .reveal').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
      });
    };
    window.addEventListener('scroll', tick, { passive: true });
    tick();
    return () => window.removeEventListener('scroll', tick);
  }, []);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.cabinet .reveal').forEach((n) => n.classList.add('in'));
      return;
    }
    ioRef.current = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            ioRef.current?.unobserve(e.target);
          }
        }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );
    return () => ioRef.current?.disconnect();
  }, []);

  useEffect(() => {
    document.querySelectorAll('.cabinet .reveal:not(.in)').forEach((n) => ioRef.current?.observe(n));
  }, [keys, filter, query, view, notice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModal(null);
        setMenu(null);
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- live prices ---------- */
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setTermPrices({});
      const entries = await Promise.all(
        TARIFF_DAYS.map(async (d) => {
          try {
            const res = await fetch(`/api/pricing?days=${d}&devices=${devices}`, {
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
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [devices]);

  useEffect(() => {
    if (!promo) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pricing?days=${term}&devices=${devices}&promo=${encodeURIComponent(promo)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { promo?: { finalPrice?: unknown } | null };
        const finalPrice = body.promo?.finalPrice;
        if (typeof finalPrice === 'number' && Number.isFinite(finalPrice)) {
          setPromoFinal(Math.round(finalPrice));
        } else if (body.promo === null) {
          setPromo(null);
          setPromoFinal(null);
          toast('Промокод недействителен или истёк', true);
        }
      } catch {
        // keep the list price on a transport failure
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [promo, term, devices, toast]);

  useEffect(() => {
    if (modal !== 'slots' || !activeKey) return;
    const limit = Math.max(1, activeKey.deviceLimit);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pricing?kind=upgrade&days=30&devices=${limit}&addDevices=${slots}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { price?: unknown };
        setSlotsPrice(typeof body.price === 'number' ? Math.round(body.price) : null);
      } catch {
        setSlotsPrice(null);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [modal, slots, activeKey]);

  /* ---------- derived ---------- */
  const stats = useMemo(() => {
    const total = keys.length;
    const active = keys.filter((k) => uiStatus(k) === 'active').length;
    const soon = keys.filter((k) => k.daysLeft > 0 && k.daysLeft <= 7).length;
    const used = keys.reduce((s, k) => s + Math.max(0, k.devices), 0);
    const limit = keys.reduce((s, k) => s + Math.max(0, k.deviceLimit), 0);
    return { total, active, soon, used, limit };
  }, [keys]);

  const visibleKeys = useMemo(() => {
    const q = query.trim().toLowerCase();
    return keys.filter((k) => {
      if (filter !== 'all' && uiStatus(k) !== filter) return false;
      if (q && !(displayName(k).toLowerCase().includes(q) || k.id.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [keys, filter, query]);

  const price = promoFinal ?? termPrices[term] ?? null;
  const basePrice = termPrices[term] ?? null;
  const renewableKeys = useMemo(() => keys.filter((k) => !k.isTrial), [keys]);
  const maxSlots = activeKey ? Math.max(0, TARIFF_MAX_DEVICES - activeKey.deviceLimit) : 0;

  /* ---------- key card actions ---------- */
  const openModal = (which: Modal, key?: SubscriptionKeyView) => {
    if (key) setActiveId(key.id);
    setModal(which);
  };
  const closeModal = () => setModal(null);

  // Lock page scrolling while any dialog is open (external-system sync).
  useEffect(() => {
    document.body.style.overflow = modal ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [modal]);

  const loadDevices = useCallback(
    async (key: SubscriptionKeyView) => {
      setDevicesLoading(true);
      try {
        const res = await fetch(`/api/keys/${encodeURIComponent(key.id)}/devices`);
        if (res.ok) {
          const body = (await res.json()) as { devices?: Device[] };
          setDeviceRows(
            (body.devices ?? []).map((d) => ({
              token: d.token,
              name: d.name,
              label: (d as Device & { label?: string | null }).label ?? null,
            })),
          );
        } else {
          setDeviceRows([]);
        }
      } catch {
        setDeviceRows([]);
      } finally {
        setDevicesLoading(false);
      }
    },
    [],
  );

  const openDevices = (key: SubscriptionKeyView) => {
    openModal('devices', key);
    void loadDevices(key);
  };

  const detachDevice = async (row: DeviceRow) => {
    if (!activeKey) return;
    const res = await fetch(
      `/api/keys/${encodeURIComponent(activeKey.id)}/devices/${encodeURIComponent(row.token)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      toast('Не удалось отключить устройство', true);
      return;
    }
    setDeviceRows((rows) => rows.filter((r) => r.token !== row.token));
    setKeys((all) =>
      all.map((k) =>
        k.id === activeKey.id ? { ...k, devices: Math.max(0, k.devices - 1) } : k,
      ),
    );
    toast(`${row.label ?? row.name ?? 'Устройство'} отключено — слот свободен`);
  };

  const saveRename = async () => {
    if (!activeKey) return;
    const value = renameDraft.trim();
    if (value.length > 64) {
      toast('Название слишком длинное (максимум 64 символа)', true);
      return;
    }
    const res = await fetch(`/api/keys/${encodeURIComponent(activeKey.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: value.length === 0 ? null : value }),
    });
    if (!res.ok) {
      toast('Не удалось сохранить название', true);
      return;
    }
    const body = (await res.json()) as { label?: string | null };
    setKeys((all) =>
      all.map((k) => (k.id === activeKey.id ? { ...k, label: body.label ?? null } : k)),
    );
    closeModal();
    toast('Название обновлено');
  };

  const shareKey = async (key: SubscriptionKeyView) => {
    if (!key.subscriptionUrl) {
      toast('Ссылка подписки пока недоступна', true);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: displayName(key), text: 'Ключ 3set VPN', url: key.subscriptionUrl });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    const ok = await copyText(key.subscriptionUrl);
    toast(ok ? 'Ссылка скопирована — отправьте другу' : 'Не удалось поделиться', !ok);
  };

  const openMenu = (button: HTMLElement, key: SubscriptionKeyView) => {
    const r = button.getBoundingClientRect();
    setMenu({
      id: key.id,
      top: r.bottom + window.scrollY + 8,
      left: Math.max(12, r.right + window.scrollX - 210),
    });
  };

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.cabinet .menu') && !t.closest('[data-act="menu"]')) setMenu(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  /* ---------- payments ---------- */
  const doPay = async (body: Record<string, unknown>) => {
    if (buying) return;
    setBuying(true);
    setPayError(null);
    try {
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
        const messages: Record<string, string> = {
          promo_invalid: 'Промокод недействителен или уже использован — уберите его и попробуйте снова.',
          payment_required: 'На балансе провайдера недостаточно средств — пополните баланс API.',
          rate_limited: 'Слишком много попыток. Повторите через минуту.',
          unauthorized: 'Сессия истекла — войдите в кабинет заново.',
          trial: 'Пробную подписку нельзя продлить — купите полную.',
          bad_request: 'Некорректные параметры заказа — проверьте срок и число устройств.',
        };
        setPayError(messages[data.error ?? ''] ?? `Не удалось создать платёж (${data.error ?? 'unknown'}). Попробуйте ещё раз.`);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setPayError('Не удалось связаться с сервером оплаты. Попробуйте ещё раз.');
    } finally {
      setBuying(false);
    }
  };

  const buy = () => {
    const isNew = targetId === '__new__' || !keys.some((k) => k.id === targetId);
    void doPay({
      kind: isNew ? 'new' : 'renew',
      keyId: isNew ? undefined : targetId,
      days: term,
      devices,
      promoCode: promo,
    });
  };

  const buySlots = () => {
    if (!activeKey || slots < 1) return;
    void doPay({
      kind: 'upgrade',
      keyId: activeKey.id,
      addDevices: slots,
      promoCode: promo,
    });
  };

  const applyPromo = () => {
    const code = promoText.trim().toUpperCase();
    if (!code) {
      toast('Введите промокод', true);
      return;
    }
    setPromo(code);
    setPromoFinal(null);
    toast(`Промокод ${code} проверяется`);
  };

  /* ---------- render ---------- */
  const navLinks = [
    { href: '/subscription', label: 'Мои ключи', icon: KeyRound, active: true },
    { href: '/#tariff', label: 'Тарифы', icon: ShieldCheck, active: false },
    { href: '/guides', label: 'Инструкции', icon: BookOpen, active: false },
    { href: '/support', label: 'Поддержка', icon: LifeBuoy, active: false },
  ];

  return (
    <div className="cabinet">
      <div className="bg-fx" aria-hidden>
        <div className="grid" />
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="cab-progress" aria-hidden />

      <div className="cab-wrap">
        <nav className="cab-nav" id="nav">
          <div className="inner">
            <Brand />
            <div className="nav-links">
              {navLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={`nl${item.active ? ' active' : ''}`}>
                    <Icon aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="nav-right">
              {isStaff && (
                <Link href="/admin" className="btn btn-light sm" style={{ height: 40 }}>
                  <ShieldCheck aria-hidden />
                  Админ-панель
                </Link>
              )}
              <Link href="/profile" className="avatar" title={email ?? 'Профиль'} aria-label="Профиль">
                {(name.trim()[0] ?? '?').toUpperCase()}
                <span className="dot" />
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
              <Link href="/support" className="nl" onClick={() => setMenuOpen(false)}>
                Поддержка{unread > 0 ? ` (${unread > 99 ? '99+' : unread})` : ''}
              </Link>
              {isStaff && (
                <Link href="/admin" className="nl" onClick={() => setMenuOpen(false)}>Админ-панель</Link>
              )}
            </div>
          </div>
        </nav>

        <main className="cab-main">
          <header className="page-head reveal">
            <div>
              <span className="kicker">Управление доступом</span>
              <h1 className="page-title" style={{ marginTop: 8 }}>Ваши подписки</h1>
              <p className="desc">
                Каждая покупка создаёт отдельную ссылку подписки — ограничений по количеству нет.
                Переименовывайте ключи, следите за сроком и управляйте устройствами.
              </p>
            </div>
            <div className="head-tools">
              <div className="search">
                <Search aria-hidden />
                <input
                  className="input"
                  type="search"
                  placeholder="Поиск по названию или ID"
                  aria-label="Поиск ключей"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="seg" role="group" aria-label="Вид списка">
                <button
                  id="viewGrid"
                  className={view === 'grid' ? 'on' : ''}
                  title="Плитка"
                  aria-label="Плитка"
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid aria-hidden />
                </button>
                <button
                  id="viewList"
                  className={view === 'list' ? 'on' : ''}
                  title="Список"
                  aria-label="Список"
                  onClick={() => setView('list')}
                >
                  <List aria-hidden />
                </button>
              </div>
              <Link href="/guides" className="btn btn-primary">
                <PlugZap aria-hidden />
                Подключить
              </Link>
            </div>
          </header>

          {notice && (
            <section className="card reveal" role="alert" style={{ borderColor: 'rgba(255,209,102,.35)' }}>
              <p className="muted" style={{ margin: 0 }}>{notice}</p>
            </section>
          )}

          <section className="stats-strip reveal" style={{ ['--d' as string]: '80ms' }}>
            <div className="mini">
              <span className="ic"><KeyRound aria-hidden /></span>
              <span className="label">Всего ключей</span>
              <b>{stats.total}</b>
              <div className="bar"><i style={{ width: '100%' }} /></div>
            </div>
            <div className="mini">
              <span className="ic"><ShieldCheck aria-hidden /></span>
              <span className="label">Активных</span>
              <b>{stats.active}</b>
              <div className="bar"><i style={{ width: `${stats.total ? (stats.active / stats.total) * 100 : 0}%` }} /></div>
            </div>
            <div className="mini">
              <span className="ic"><RefreshCw aria-hidden /></span>
              <span className="label">Истекают ≤ 7 дней</span>
              <b>{stats.soon}</b>
              <div className="bar"><i className="warn" style={{ width: `${stats.total ? (stats.soon / stats.total) * 100 : 0}%` }} /></div>
            </div>
            <div className="mini">
              <span className="ic"><Smartphone aria-hidden /></span>
              <span className="label">Устройств</span>
              <b>{stats.used}<small>/{stats.limit}</small></b>
              <div className="bar"><i style={{ width: `${stats.limit ? Math.min(100, (stats.used / stats.limit) * 100) : 0}%` }} /></div>
            </div>
          </section>

          <section id="keys">
            <div className="sec-head reveal">
              <div>
                <span className="kicker">Подключения 3set</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>
                  Ваши ключи <span className="dim mono" style={{ fontSize: 13 }}>· {visibleKeys.length}</span>
                </h2>
              </div>
              <div className="tabs" role="tablist">
                {FILTERS.map((f) => {
                  const count =
                    f.id === 'all' ? keys.length : keys.filter((k) => uiStatus(k) === f.id).length;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === f.id}
                      className={`tab${filter === f.id ? ' on' : ''}`}
                      onClick={() => setFilter(f.id)}
                    >
                      {f.label}<span className="c">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`keys${view === 'list' ? ' list' : ''}`}>
              {visibleKeys.map((k, idx) => {
                const st = uiStatus(k);
                const meta = STATUS_META[st];
                const pct = Math.max(2, Math.min(100, (k.daysLeft / Math.max(1, term)) * 100));
                const barCls = st === 'expired' ? 'dead' : st === 'soon' ? 'warn' : '';
                const shown = seenUrls[k.id];
                return (
                  <article
                    key={k.id}
                    className="key-card reveal"
                    style={{ ['--d' as string]: `${idx * 70}ms` }}
                  >
                    <div className="kc-head">
                      <span className="kc-ic"><KeyGlyph /></span>
                      <div className="kc-t">
                        <h3 title={displayName(k)}>{displayName(k)}</h3>
                        <span className="label mono" style={{ marginTop: 4, display: 'block' }}>
                          {shortId(k.id)}
                        </span>
                      </div>
                      <div className="kc-tools">
                        <button className="tbtn" title="Переименовать" aria-label="Переименовать" data-act="rename" onClick={() => { setRenameDraft(displayName(k)); openModal('rename', k); }}>
                          <Pencil aria-hidden />
                        </button>
                        <button className="tbtn" title="QR-код" aria-label="QR-код" data-act="qr" onClick={() => openModal('qr', k)}>
                          <QrCode aria-hidden />
                        </button>
                        <button className="tbtn" title="Ещё" aria-label="Ещё" data-act="menu" onClick={(e) => openMenu(e.currentTarget, k)}>
                          <MoreHorizontal aria-hidden />
                        </button>
                      </div>
                    </div>

                    <div className="kc-status">
                      <span className={`pill ${meta.cls}`}><span className="pdot" />{meta.text}</span>
                      {k.isTrial && <span className="pill warn">Пробный</span>}
                      <span className="pill" style={{ color: 'var(--muted)' }}>WireGuard</span>
                      <span className="pill" style={{ color: 'var(--dim)' }}>Без логов</span>
                    </div>

                    <div className="kc-prog">
                      <div className="row"><span>Осталось</span><b>{k.daysLeft} дн.</b></div>
                      <div className="bar"><i className={barCls} style={{ width: `${pct}%` }} /></div>
                      <div className="row" style={{ fontSize: 11 }}>
                        <span>до {fmtDate(k.expiresAt)}</span><span>{Math.round(pct)}%</span>
                      </div>
                    </div>

                    <div className="kc-stats">
                      <div className="stat"><span className="label">Осталось</span><b>{k.daysLeft} дн.</b></div>
                      <div className="stat"><span className="label">Устройства</span><b className="mono">{k.devices}/{k.deviceLimit}</b></div>
                      <div className="stat"><span className="label">Действует до</span><b>{fmtDate(k.expiresAt)}</b></div>
                    </div>

                    {k.subscriptionUrl && (
                      <div className="link-box">
                        <div className="link-row">
                          <span className="label">Ссылка подписки</span>
                          <button
                            className="btn btn-ghost xs"
                            onClick={async () => {
                              const ok = await copyText(k.subscriptionUrl!);
                              toast(ok ? 'Ссылка подписки скопирована' : 'Не удалось скопировать', !ok);
                            }}
                          >
                            <Copy aria-hidden />
                            Скопировать
                          </button>
                        </div>
                        <div className={`link-val${shown ? '' : ' blurred'}`}>
                          <ChainIcon />
                          <code title={k.subscriptionUrl}>{k.subscriptionUrl}</code>
                          <button
                            className="eye"
                            title={shown ? 'Скрыть ссылку' : 'Показать ссылку'}
                            aria-label={shown ? 'Скрыть ссылку' : 'Показать ссылку'}
                            onClick={() => setSeenUrls((s) => ({ ...s, [k.id]: !s[k.id] }))}
                          >
                            {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="kc-actions">
                      <Link href={`/install?key=${encodeURIComponent(k.id)}`} className="btn btn-primary">
                        <PlugZap aria-hidden /><span className="tx">Подключить</span>
                      </Link>
                      {k.isTrial ? (
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            setTargetId('__new__');
                            scrollTo('tariff');
                          }}
                        >
                          <Plus aria-hidden /><span className="tx">Купить подписку</span>
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            setTargetId(k.id);
                            scrollTo('tariff');
                            toast(`Продляем «${displayName(k)}»`);
                          }}
                        >
                          <RefreshCw aria-hidden /><span className="tx">Продлить</span>
                        </button>
                      )}
                      {!k.isTrial && k.deviceLimit < TARIFF_MAX_DEVICES && (
                        <button className="btn btn-ghost" onClick={() => { setSlots(1); setSlotsPrice(null); openModal('slots', k); }}>
                          <Plus aria-hidden /><span className="tx">Добавить устройства</span>
                        </button>
                      )}
                      <button
                        className="btn btn-ghost iconic"
                        title="Устройства"
                        aria-label="Устройства"
                        onClick={() => openDevices(k)}
                      >
                        <Smartphone aria-hidden />
                      </button>
                    </div>
                  </article>
                );
              })}

              {filter === 'all' && !query.trim() && (
                <div
                  className="add-card reveal"
                  role="button"
                  tabIndex={0}
                  onClick={() => { setTargetId('__new__'); scrollTo('tariff'); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setTargetId('__new__'); scrollTo('tariff'); } }}
                >
                  <span className="plus"><Plus aria-hidden /></span>
                  <div>
                    <b style={{ fontSize: 15 }}>Новая подписка</b>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                      Отдельный ключ и ссылка — для друзей, работы или роутера.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {visibleKeys.length === 0 && (
              <div className="empty show">
                <span className="eic"><Search aria-hidden /></span>
                <b style={{ fontSize: 16 }}>Ничего не найдено</b>
                <p className="muted" style={{ margin: 0, fontSize: 13.5, maxWidth: '38ch' }}>
                  Попробуйте изменить фильтр или поисковый запрос — либо создайте новую подписку.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button className="btn btn-ghost sm" onClick={() => { setFilter('all'); setQuery(''); }}>
                    Сбросить фильтры
                  </button>
                  <button className="btn btn-primary sm" onClick={() => { setTargetId('__new__'); scrollTo('tariff'); }}>
                    Купить подписку
                  </button>
                </div>
              </div>
            )}
          </section>

          <section id="tariff">
            <div className="sec-head reveal">
              <div>
                <span className="kicker">Выберите тариф</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Срок и устройства — цена считается автоматически</h2>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
                  Оплата продлевает выбранный ключ. Чем дольше срок — тем ниже цена за день.
                </p>
              </div>
              <span className="pill ok"><span className="pdot" />Мгновенная активация</span>
            </div>

            <div className="tariff">
              <div className="card reveal">
                <span className="opt-label">Срок подписки</span>
                <div className="terms" role="group" aria-label="Срок подписки">
                  {TARIFF_DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="term"
                      aria-pressed={term === d}
                      onClick={() => setTerm(d)}
                    >
                      {d === 30 && <span className="badge">Хит</span>}
                      <span className="check" dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />
                      <span className="t-body">
                        <span className="t-label">{tariffDaysLabel(d)}</span>
                        <span className="t-price">{termPrices[d] === undefined ? '—' : RUB(termPrices[d]!)}</span>
                        <span className="t-per">
                          {termPrices[d] === undefined
                            ? 'цена уточняется…'
                            : `≈ ${(termPrices[d]! / d / devices).toFixed(1).replace('.', ',')} ₽/день · устр.`}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 26, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <span className="opt-label">Устройства</span>
                    <div className="stepper">
                      <button
                        className="step-btn"
                        aria-label="Уменьшить"
                        disabled={devices <= TARIFF_MIN_DEVICES}
                        onClick={() => setDevices((n) => Math.max(TARIFF_MIN_DEVICES, n - 1))}
                      >
                        <Minus aria-hidden />
                      </button>
                      <input
                        className="step-input"
                        type="number"
                        inputMode="numeric"
                        min={TARIFF_MIN_DEVICES}
                        max={TARIFF_MAX_DEVICES}
                        aria-label="Число устройств"
                        value={devices}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          if (Number.isFinite(n)) setDevices(Math.min(TARIFF_MAX_DEVICES, Math.max(TARIFF_MIN_DEVICES, n)));
                        }}
                      />
                      <button
                        className="step-btn"
                        aria-label="Увеличить"
                        onClick={() => setDevices((n) => Math.min(TARIFF_MAX_DEVICES, n + 1))}
                      >
                        <Plus aria-hidden />
                      </button>
                    </div>
                  </div>
                  <p className="dim" style={{ fontSize: 12, margin: 0, maxWidth: '26ch' }}>
                    Все устройства работают одновременно, трафик без ограничений.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[1, 3, 5].map((n) => (
                      <button key={n} className="btn btn-quiet xs" onClick={() => setDevices((v) => Math.min(TARIFF_MAX_DEVICES, v + n))}>
                        +{n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <aside className="card summary reveal" style={{ ['--d' as string]: '120ms' }}>
                <div>
                  <span className="label">К оплате</span>
                  <div className="price-row" style={{ marginTop: 8 }}>
                    <span className="price">{price === null ? '—' : RUB(price)}</span>
                    {promo && basePrice !== null && price !== null && price < basePrice && (
                      <span className="old-price">{RUB(basePrice)}</span>
                    )}
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                    ≈ {price === null ? '—' : `${(price / term).toFixed(1).replace('.', ',')} ₽ / день`} · {devices} устр.
                  </div>
                </div>

                <div>
                  <span className="label" style={{ display: 'block', marginBottom: 8 }}>Продлить ключ</span>
                  <div className="target-chips">
                    <button
                      type="button"
                      className={`chip${targetId === '__new__' ? ' on' : ''}`}
                      onClick={() => setTargetId('__new__')}
                    >
                      <Plus aria-hidden />Новая подписка
                    </button>
                    {renewableKeys.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        className={`chip${targetId === k.id ? ' on' : ''}`}
                        title={`${displayName(k)} · ${STATUS_META[uiStatus(k)].text}`}
                        onClick={() => setTargetId(k.id)}
                      >
                        <KeyRound aria-hidden />{displayName(k).replace('3set VPN — ', '')}
                      </button>
                    ))}
                    {renewableKeys.length === 0 && (
                      <span className="dim" style={{ fontSize: 12.5 }}>Пока нечего продлевать</span>
                    )}
                  </div>
                </div>

                <div className="sum-lines">
                  <div className="sum-line"><span>{tariffDaysLabel(term)}</span><b>{basePrice === null ? '—' : RUB(basePrice)}</b></div>
                  <div className="sum-line"><span>Устройства</span><b>{devices}</b></div>
                  {promo && price !== null && basePrice !== null && price < basePrice && (
                    <div className="sum-line discount">
                      <span>Промокод <b className="mono" style={{ fontSize: 12 }}>{promo}</b></span>
                      <b>−{RUB(basePrice - price)}</b>
                    </div>
                  )}
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
                      <span dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />
                      <span>Промокод {promo} применён</span>
                      <button onClick={() => { setPromo(null); setPromoFinal(null); setPromoText(''); }}>убрать</button>
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-primary block"
                  style={{ height: 52 }}
                  disabled={price === null || buying}
                  onClick={buy}
                >
                  <KeyRound aria-hidden />
                  {buying ? 'Создаём платёж…' : targetId === '__new__' ? 'Купить подписку' : 'Купить и продлить'}
                </button>
                {payError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{payError}</p>}
                <div className="pay-icons">
                  <span className="mono">МИР</span>·<span className="mono">VISA</span>·<span className="mono">MC</span>·<span className="mono">SBP</span>·<span className="mono">CRYPTO</span>
                </div>
              </aside>
            </div>
          </section>

          <section id="support">
            <div className="card support reveal">
              <div className="sic"><LifeBuoy aria-hidden /></div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Поможем разобраться</h3>
                <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
                  Если подписка не обновилась, серверы не появились или устройство не отвязывается —
                  напишите поддержке. Среднее время ответа — 4 минуты.
                </p>
              </div>
              <div className="chan">
                <Link href="/support" className="btn btn-primary"><Send aria-hidden /><span>Telegram</span></Link>
                <a href="mailto:support@3set.online" className="btn btn-ghost"><Mail aria-hidden /><span>E-mail</span></a>
                <Link href="/guides" className="btn btn-quiet"><BookOpen aria-hidden /><span>Инструкции</span></Link>
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
              <Link href="/#tariff">Тарифы</Link>
              <Link href="/guides">Инструкции</Link>
              <Link href="/support">Поддержка</Link>
            </div>
          </div>
        </footer>
      </div>

      {menu && (
        <div className="menu open" role="menu" style={{ top: menu.top, left: menu.left }}>
          <button
            data-m="rename"
            onClick={() => {
              const k = keys.find((x) => x.id === menu.id);
              if (k) { setRenameDraft(displayName(k)); openModal('rename', k); }
              setMenu(null);
            }}
          >
            <Pencil aria-hidden />Переименовать
          </button>
          <button
            data-m="qr"
            onClick={() => {
              const k = keys.find((x) => x.id === menu.id);
              if (k) openModal('qr', k);
              setMenu(null);
            }}
          >
            <QrCode aria-hidden />Показать QR-код
          </button>
          <button
            data-m="share"
            onClick={() => {
              const k = keys.find((x) => x.id === menu.id);
              if (k) void shareKey(k);
              setMenu(null);
            }}
          >
            <Share2 aria-hidden />Поделиться ключом
          </button>
          <hr />
          <Link
            href={`/keys/${encodeURIComponent(menu.id)}`}
            role="menuitem"
            onClick={() => setMenu(null)}
          >
            <ExternalLink aria-hidden />Открыть детали
          </Link>
        </div>
      )}

      <div className={`overlay${modal === 'devices' ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="devTitle"
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal">
          <div className="modal-head">
            <h3 id="devTitle">Устройства <span className="dim mono" style={{ fontSize: 12 }}>{activeKey?.devices ?? 0}/{activeKey?.deviceLimit ?? 0}</span></h3>
            <button className="icon-btn" onClick={closeModal} aria-label="Закрыть"><X aria-hidden /></button>
          </div>
          {devicesLoading ? (
            <p className="muted" style={{ fontSize: 13 }}>Загружаем устройства…</p>
          ) : deviceRows.length === 0 ? (
            <p className="dim" style={{ fontSize: 13, margin: '6px 0 0' }}>Устройств нет. Подключите первое по ссылке подписки или QR-коду.</p>
          ) : (
            deviceRows.map((d) => (
              <div className="dev" key={d.token}>
                <span className="d-ic">
                  {/iphone|android|phone|ios/i.test(d.label ?? d.name ?? '') ? <Smartphone aria-hidden /> : <Monitor aria-hidden />}
                </span>
                <span className="d-tx">
                  <b>{d.label ?? d.name ?? 'Устройство'}</b>
                  <span>токен {d.token.slice(0, 12)}…</span>
                </span>
                {activeKey && (
                  <LabelEditor
                    compact
                    url={`/api/keys/${encodeURIComponent(activeKey.id)}/devices/${encodeURIComponent(d.token)}`}
                    value={d.label}
                    triggerLabel="Переименовать устройство"
                    title="Название устройства"
                    hint="Подпись видна только вам и не отправляется провайдеру."
                    onSaved={(label) => setDeviceRows((rows) => rows.map((r) => (r.token === d.token ? { ...r, label } : r)))}
                  />
                )}
                <button className="d-act" onClick={() => void detachDevice(d)}>Отключить</button>
              </div>
            ))
          )}
          <p className="dim" style={{ fontSize: 12, margin: '14px 0 0' }}>Отключение устройства освобождает слот — подключите другое в любой момент.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {activeKey && !activeKey.isTrial && activeKey.deviceLimit < TARIFF_MAX_DEVICES && (
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { closeModal(); setSlots(1); setSlotsPrice(null); openModal('slots', activeKey); }}>
                <Plus aria-hidden />Добавить слоты
              </button>
            )}
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={closeModal}>Готово</button>
          </div>
        </div>
      </div>

      <div className={`overlay${modal === 'rename' ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="renTitle"
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal" style={{ width: 'min(440px,100%)' }}>
          <div className="modal-head">
            <h3 id="renTitle">Переименовать ключ</h3>
            <button className="icon-btn" onClick={closeModal} aria-label="Закрыть"><X aria-hidden /></button>
          </div>
          <label className="label" htmlFor="renameInput" style={{ display: 'block', marginBottom: 8 }}>Название</label>
          <input
            id="renameInput"
            className="input"
            style={{ width: '100%', height: 48 }}
            maxLength={64}
            placeholder="Например, Домашний роутер"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(); }}
          />
          <p className="dim" style={{ fontSize: 12, margin: '10px 0 0' }}>Название видно только вам — у провайдера имя ключа техническое.</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={closeModal}>Отмена</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void saveRename()}>Сохранить</button>
          </div>
        </div>
      </div>

      <div className={`overlay${modal === 'qr' ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="qrTitle"
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal" style={{ width: 'min(420px,100%)' }}>
          <div className="modal-head">
            <h3 id="qrTitle">QR-код ключа</h3>
            <button className="icon-btn" onClick={closeModal} aria-label="Закрыть"><X aria-hidden /></button>
          </div>
          <div className="qr-box">
            {activeKey?.qrSvg ? (
              <div className="qr-frame"><QrSvg svg={activeKey.qrSvg} /></div>
            ) : (
              <div className="qr-frame qr-empty">QR-код недоступен</div>
            )}
            <p className="muted" style={{ fontSize: 13, margin: 0, textAlign: 'center' }}>
              Наведите камеру телефона — подписка подключится автоматически.
            </p>
            <code className="mono dim" style={{ fontSize: 11, wordBreak: 'break-all', textAlign: 'center' }}>
              {activeKey?.subscriptionUrl ?? 'Ссылка подписки пока недоступна'}
            </code>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                disabled={!activeKey?.subscriptionUrl}
                onClick={async () => {
                  if (!activeKey?.subscriptionUrl) return;
                  const ok = await copyText(activeKey.subscriptionUrl);
                  toast(ok ? 'Ссылка скопирована' : 'Ошибка копирования', !ok);
                }}
              >
                <Copy aria-hidden />Скопировать
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={closeModal}>Закрыть</button>
            </div>
          </div>
        </div>
      </div>

      <div className={`overlay${modal === 'slots' ? ' open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="slotsTitle"
        onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
        <div className="modal" style={{ width: 'min(460px,100%)' }}>
          <div className="modal-head">
            <h3 id="slotsTitle">Добавить устройства</h3>
            <button className="icon-btn" onClick={closeModal} aria-label="Закрыть"><X aria-hidden /></button>
          </div>
          <p className="muted" style={{ fontSize: 13.5, margin: '0 0 18px' }}>
            Ключ «{activeKey ? displayName(activeKey) : ''}» · сейчас {activeKey?.devices ?? 0}/{activeKey?.deviceLimit ?? 0}.
            Доплата рассчитывается пропорционально оставшемуся сроку.
          </p>
          <span className="opt-label">Сколько слотов добавить</span>
          <div className="stepper">
            <button className="step-btn" aria-label="Уменьшить" disabled={slots <= 1} onClick={() => setSlots((n) => Math.max(1, n - 1))}>
              <Minus aria-hidden />
            </button>
            <input
              className="step-input"
              type="number"
              min={1}
              max={Math.max(1, maxSlots)}
              value={slots}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setSlots(Math.min(Math.max(1, maxSlots), Math.max(1, n)));
              }}
              aria-label="Число добавляемых устройств"
            />
            <button className="step-btn" aria-label="Увеличить" disabled={slots >= maxSlots} onClick={() => setSlots((n) => Math.min(Math.max(1, maxSlots), n + 1))}>
              <Plus aria-hidden />
            </button>
            <span className="dim" style={{ fontSize: 12, marginLeft: 8 }}>максимум {maxSlots}</span>
          </div>
          <div className="price-row" style={{ margin: '20px 0 14px' }}>
            <span className="label">К оплате</span>
            <span className="price" style={{ fontSize: 28 }}>{slotsPrice === null ? '—' : RUB(slotsPrice)}</span>
          </div>
          <button className="btn btn-primary block" style={{ height: 52 }} disabled={slotsPrice === null || buying} onClick={buySlots}>
            {buying ? 'Создаём платёж…' : 'Добавить устройства'}
          </button>
          {payError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{payError}</p>}
        </div>
      </div>

      <div className="toasts" aria-live="polite" />
      <div className="confetti" aria-hidden />
    </div>
  );
}
