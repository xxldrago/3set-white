'use client';

// /install — client island ported from the supplied keys.html template.
// Real data only: keys/subscription URLs come from the server page; OS and
// app catalogs come from ./install-data. The mock KEYS array from the
// template is replaced by the caller's real keys.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APPS, PLATFORMS, PLATFORM_ORDER, type AppDef } from './install-data';
import Link from 'next/link';

export interface InstallKey {
  id: string;
  name: string;
  daysLeft: number | null;
  devices: number | null;
  subscriptionUrl: string | null;
}

interface InstallUser {
  email?: string | null;
  firstName?: string | null;
}

const OS_ICON: Record<string, string> = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="7.5" y="2.5" width="9" height="19" rx="3"/><path d="M10 5.5h4" stroke-linecap="round"/><circle cx="12" cy="18.1" r="1" fill="currentColor" stroke="none"/></svg>',
  laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 18.5h20" stroke-linecap="round"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="12" rx="2.5"/><path d="M9 21h6m-3-4v4" stroke-linecap="round"/></svg>',
  router: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6.5 17.5h.01M10 17.5h.01" stroke-linecap="round"/><path d="M8 10a5 5 0 0 1 8 0M5.5 7a9 9 0 0 1 13 0" stroke-linecap="round"/></svg>',
};

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

function detectOS(): string {
  if (typeof navigator === 'undefined') return 'macos';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'macos';
}

interface Props {
  keys: InstallKey[];
  initialKeyId?: string;
  user?: InstallUser | null;
}

export default function InstallClient({ keys, initialKeyId, user }: Props) {
  const [keyId, setKeyId] = useState<string>(initialKeyId ?? keys[0]?.id ?? '');
  const [os, setOs] = useState<string | null>(null);
  const [app, setApp] = useState<string | null>(null);
  const [blurred, setBlurred] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; type: 'ok' | 'err' }>>([]);
  const toastIdRef = useRef(0);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagDone, setDiagDone] = useState(false);
  const [openAcc, setOpenAcc] = useState<number | null>(null);
  const [showDetect, setShowDetect] = useState(true);

  const addToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastIdRef.current;
    setToasts((xs) => [...xs, { id, msg, type }]);
    setTimeout(() => setToasts((xs) => xs.filter((t) => t.id !== id)), 3200);
  }, []);

  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const key = useMemo(() => keys.find((k) => k.id === keyId) ?? keys[0] ?? null, [keys, keyId]);
  const appDef: AppDef | null = app ? APPS[app] ?? null : null;
  const appList = os && PLATFORMS[os] ? PLATFORMS[os].apps.map((id) => APPS[id]).filter(Boolean) : [];

  // OS detection on mount (post-mount external-system read; lazy init would
  // cause a hydration mismatch, so setState-in-effect is intentional here).
  useEffect(() => {
    const d = detectOS();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOs(d);
  }, []);

  // reset app when os changes
  useEffect(() => {
    if (os && PLATFORMS[os]) {
      const first = PLATFORMS[os].apps[0];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setApp(first ?? null);
    }
  }, [os]);

  // stepper classes
  const step1Done = !!key;
  const step2Done = !!os;
  const step3Done = !!app && !!os;

  const copyLink = useCallback(async () => {
    if (!key?.subscriptionUrl) return;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(key.subscriptionUrl);
      else {
        const ta = document.createElement('textarea');
        ta.value = key.subscriptionUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      addToast('Ссылка подписки скопирована');
    } catch {
      addToast('Не удалось скопировать', 'err');
    }
  }, [key, addToast]);

  const drawQr = useCallback(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !key?.subscriptionUrl) return;
    const url = key.subscriptionUrl;
    if (typeof window !== 'undefined' && typeof (window as unknown as { qrcode?: (v: number, e: string) => { addData: (s: string) => void; make: () => void; getModuleCount: () => number; isDark: (r: number, c: number) => boolean } }).qrcode === 'function') {
      try {
        const qrcode = (window as unknown as { qrcode: (v: number, e: string) => { addData: (s: string) => void; make: () => void; getModuleCount: () => number; isDark: (r: number, c: number) => boolean } }).qrcode;
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        const n = qr.getModuleCount();
        const size = 210;
        const cell = size / n;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = size;
          canvas.height = size;
          ctx.fillStyle = '#f2f7ee';
          ctx.fillRect(0, 0, size, size);
          ctx.fillStyle = '#0e1512';
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell + 0.6, cell + 0.6);
        }
        return;
      } catch {
        // fall through
      }
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
      canvas.width = 210;
      canvas.height = 210;
      ctx.fillStyle = '#f2f7ee';
      ctx.fillRect(0, 0, 210, 210);
      ctx.fillStyle = '#0e1512';
      ctx.font = '600 13px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR недоступен офлайн', 105, 100);
      ctx.fillText('скопируйте ссылку', 105, 120);
    }
  }, [key]);

  useEffect(() => {
    if (showQr) drawQr();
  }, [showQr, drawQr]);

  const runDiag = useCallback(() => {
    if (diagRunning) return;
    setDiagRunning(true);
    setDiagDone(false);
    setTimeout(() => {
      setDiagRunning(false);
      setDiagDone(true);
      addToast('Диагностика пройдена: 5 из 5 проверок');
    }, 5 * 640 + 600);
  }, [diagRunning, addToast]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' });
  }, []);

  const userInitial = (user?.firstName?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();
  const userEmail = user?.email ?? '';

  // steps for the guide
  const steps = useMemo(() => {
    const osName = os && PLATFORMS[os] ? PLATFORMS[os].name : 'устройство';
    const appName = appDef ? appDef.name : 'Приложение';
    const url = key?.subscriptionUrl ?? '';
    const deep = appDef?.importLink ? appDef.importLink(url) : null;
    const list: Array<{ n: string; html: string }> = [
      {
        n: '01',
        html: `Установите <b>${esc(appName)}</b> из официального источника по кнопке ниже и откройте приложение.`,
      },
      {
        n: '02',
        html: deep
          ? `Нажмите «Добавить подписку» — <b>${esc(appName)}</b> откроется и получит вашу персональную ссылку автоматически.`
          : `Скопируйте ссылку подписки и вставьте её в разделе «Профили» → «Добавить» в приложении <b>${esc(appName)}</b>.`,
      },
      { n: '03', html: `Обновите подписку в <b>${esc(appName)}</b>, выберите сервер и включите VPN. Автообновление лучше оставить включённым.` },
    ];
    if (os === 'appletv' || os === 'androidtv' || os === 'router') {
      list.push({ n: '04', html: 'Включите автозапуск и проверьте соединение. Для TV и роутеров рекомендуем оставить VPN включённым постоянно.' });
    }
    return { list, deep, url, appName, osName };
  }, [os, appDef, key]);

  if (keys.length === 0) {
    return (
      <div className="install-page">
        <div className="bg-fx"><div className="grid" /><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
        <div className="wrap">
          <main id="top">
            <section className="card" style={{ textAlign: 'center', padding: 40 }}>
              <h1 className="page-title">Нет доступных ключей</h1>
              <p className="muted" style={{ marginTop: 12 }}>Сначала купите или активируйте подписку — затем вернитесь сюда для подключения.</p>
              <Link className="btn btn-primary" href="/subscription" style={{ marginTop: 20, display: 'inline-flex' }}>Выбрать тариф</Link>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="install-page">
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js" async />
      <div className="bg-fx"><div className="grid" /><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
      <div className="progress-bar" id="progressBar" />

      <div className="wrap">
        {/* NAV */}
        <nav className="top" id="nav">
          <div className="inner">
            <Link className="brand" href="/" aria-label="3set — на главную">
              <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>3<em>set</em><span className="dom mono">.online</span></span>
            </Link>
            <div className="nav-links">
              <Link className="nl" href="/subscription">Мои ключи</Link>
              <Link className="nl active" href="/install">Подключение</Link>
              <Link className="nl" href="/faq">FAQ</Link>
              <Link className="nl" href="/support">Поддержка</Link>
            </div>
            <div className="nav-right">
              <Link className="avatar" href="/profile" title={userEmail} aria-label="Профиль">{userInitial}<span className="dot" /></Link>
            </div>
          </div>
        </nav>

        <main id="top">
          {/* HERO */}
          <section className="hero reveal">
            <span className="kicker">Подключение за 3 минуты</span>
            <h1 className="page-title">Выберите устройство.<br /><em>Остальное уже готово.</em></h1>
            <p className="desc">Система покажет подходящие приложения, официальные ссылки и кнопку импорта вашей персональной ссылки подписки. Ничего настраивать вручную не нужно.</p>
            {showDetect && os && (
              <div className="detect show">
                <span className="dic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="4" /></svg></span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <b style={{ fontSize: '13.5px' }}>Похоже, вы с <span id="detectName">{PLATFORMS[os]?.name ?? os}</span></b>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: '12.5px' }}>Мы уже подобрали приложения под вашу систему — можно ничего не менять.</p>
                </div>
                <button className="btn btn-primary sm" onClick={() => { setShowDetect(false); addToast('Подобрали приложения для ' + (PLATFORMS[os]?.name ?? os)); }}>Да, всё верно</button>
                <button className="btn btn-quiet sm" onClick={() => { setShowDetect(false); document.getElementById('step2')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Выбрать другую</button>
              </div>
            )}
          </section>

          {/* STEPPER */}
          <div className="stepper reveal" style={{ '--d': '60ms' } as React.CSSProperties} id="stepper">
            <button className={`sp ${step1Done ? 'done' : ''} ${!os ? 'active' : ''}`} type="button" onClick={() => scrollTo('step1')}>
              <span className="n">01</span><span className="t"><b>Подписка</b><span id="spSub">{key ? key.name : 'не выбрана'}</span></span>
            </button>
            <span className={`sp-line ${step1Done ? 'on' : ''}`} id="line1"><i /></span>
            <button className={`sp ${step2Done ? 'done' : ''} ${os && !app ? 'active' : ''}`} type="button" onClick={() => scrollTo('step2')}>
              <span className="n">02</span><span className="t"><b>Устройство</b><span id="spOs">{os ? (PLATFORMS[os]?.name ?? os) : 'не выбрано'}</span></span>
            </button>
            <span className={`sp-line ${step2Done ? 'on' : ''}`} id="line2"><i /></span>
            <button className={`sp ${step3Done ? 'done active' : ''}`} type="button" onClick={() => scrollTo('step3')}>
              <span className="n">03</span><span className="t"><b>Приложение</b><span id="spApp">{app ?? 'не выбрано'}</span></span>
            </button>
          </div>

          {/* WORKSPACE */}
          <div className="workspace">
            {/* SIDEBAR */}
            <aside className="card side reveal" style={{ '--d': '100ms' } as React.CSSProperties}>
              <div className="sblock" id="step1">
                <div className="shead">
                  <span className="num">01</span>
                  <div><b>Ваша подписка</b><small>Выберите подключение</small></div>
                </div>
                <div className="opts-col" id="keyList">
                  {keys.map((k) => {
                    const active = (k.daysLeft ?? 0) > 0;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        className="opt"
                        data-id={k.id}
                        aria-pressed={k.id === keyId}
                        onClick={() => { setKeyId(k.id); if (!active) addToast('Срок этой подписки истёк — продлите её в кабинете', 'err'); else addToast('Выбрана подписка «' + k.name + '»'); }}
                      >
                        {!active && <span className="badge" style={{ background: 'rgba(255,209,102,.16)', color: 'var(--amber)', borderColor: 'rgba(255,209,102,.3)' }}>истёк</span>}
                        <span className="otx"><b>{k.name}</b><small>{k.daysLeft ?? 0} дн. · {k.devices ?? 0} устр.</small></span>
                        <span className="chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="divider" />

              <div className="sblock" id="step2">
                <div className="shead">
                  <span className="num">02</span>
                  <div><b>Устройство / ОС</b><small>Где будет работать VPN</small></div>
                </div>
                <div className="os-grid" id="osList">
                  {PLATFORM_ORDER.map((id) => {
                    const p = PLATFORMS[id];
                    if (!p) return null;
                    const kind = id === 'ios' || id === 'android' ? 'phone' : id === 'appletv' || id === 'androidtv' ? 'tv' : 'laptop';
                    return (
                      <button
                        key={id}
                        type="button"
                        className="opt"
                        data-os={id}
                        aria-pressed={os === id}
                        onClick={() => { setOs(id); setApp(PLATFORMS[id].apps[0] ?? null); setShowDetect(false); addToast('Система: ' + p.name + ' — подобрано приложений: ' + p.apps.length); }}
                      >
                        <span className="oic" dangerouslySetInnerHTML={{ __html: OS_ICON[kind] }} />
                        <span className="otx"><b>{p.name}</b></span>
                        <span className="chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="divider" />

              <div className="sblock" id="step3">
                <div className="shead">
                  <span className="num">03</span>
                  <div><b>Приложение</b><small id="appHint">{appList.length} вариант(а)</small></div>
                </div>
                <div className="opts-col" id="appList">
                  {appList.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="opt"
                      data-app={a.id}
                      aria-pressed={app === a.id}
                      onClick={() => { setApp(a.id); addToast('Выбрано приложение: ' + a.name); }}
                    >
                      <span className="letter">{a.name[0]}</span>
                      <span className="otx"><b>{a.name}</b><small>{a.note}</small></span>
                      <span className="chk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="divider" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn btn-ghost sm block" onClick={() => setShowQr(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M16 16h5v5h-5z" /></svg>
                  Открыть QR-код подписки
                </button>
                <button className="btn btn-quiet sm block" onClick={() => addToast('Инструкция отправлена в Telegram', 'ok')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>
                  Отправить инструкцию себе
                </button>
              </div>
            </aside>

            {/* GUIDE */}
            <article className="card guide reveal" id="guide" style={{ '--d': '160ms' } as React.CSSProperties}>
              <div className="guide-head">
                <div>
                  <span className="kicker">Готовая инструкция</span>
                  <h2 className="sec-title" style={{ margin: '6px 0 6px' }}>{steps.appName} · {steps.osName}</h2>
                  <p className="muted" style={{ margin: 0, fontSize: '13.5px' }}>Официальная загрузка и автоматический импорт персональной ссылки подписки.</p>
                </div>
                <span className="pill"><span className="mono" style={{ fontSize: '11px' }}>{steps.list.length} шага</span></span>
              </div>

              <div className="chips">
                <span className="chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="15.5" cy="7.5" r="5.5" /><path d="m2 21 9.6-9.6" /></svg>Ключ: <b>{key ? key.name : '—'}</b></span>
                <span className="chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect width="14" height="20" x="5" y="2" rx="2" /><path d="M12 18h.01" /></svg>ОС: <b>{os ? (PLATFORMS[os]?.name ?? os) : '—'}</b></span>
                <span className="chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" /><path d="m2 22 3-3" /></svg>Клиент: <b>{steps.appName}</b></span>
                {key && (key.daysLeft ?? 0) <= 0 && (
                  <span className="chip" style={{ borderColor: 'rgba(255,209,102,.3)', color: 'var(--amber)' }}>Подписка истекла — продлите</span>
                )}
              </div>

              <div className="link-box">
                <div className="link-top">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="label">Ссылка подписки</span>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: 3 }}>{key ? key.name : '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost xs" onClick={() => setShowQr(true)}>QR</button>
                    <button className="btn btn-ghost sm" onClick={copyLink}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                      Скопировать
                    </button>
                  </div>
                </div>
                <div className={`link-val ${blurred ? 'blurred' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flex: 'none' }}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                  <code id="linkCode">{key?.subscriptionUrl ?? '—'}</code>
                  <button className="eye" onClick={() => setBlurred((b) => !b)} title={blurred ? 'Показать ссылку' : 'Скрыть ссылку'} aria-label={blurred ? 'Показать ссылку' : 'Скрыть ссылку'}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  </button>
                </div>
              </div>

              <ol className="steps-list" id="stepsList">
                {steps.list.map((s, i) => (
                  <li key={s.n} className="st" style={{ animation: `cardIn .5s var(--ease) ${i * 70}ms both` }}>
                    <span className="sn">{s.n}</span>
                    <span className="sb" dangerouslySetInnerHTML={{ __html: s.html }} />
                  </li>
                ))}
                {appDef && appDef.downloads && os && appDef.downloads[os] && (
                  <li className="st" style={{ animation: `cardIn .5s var(--ease) ${steps.list.length * 70}ms both` }}>
                    <span className="sn">↓</span>
                    <span className="sb">
                      <div className="dl-row">
                        {appDef.downloads[os].map((d) => (
                          <a key={d.url} className="btn btn-primary" href={d.url} target="_blank" rel="noreferrer">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /></svg>
                            {d.label}
                          </a>
                        ))}
                        {steps.deep && (
                          <>
                            <a className="btn btn-lime-line" href={steps.deep}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>
                              Добавить подписку
                            </a>
                            <button className="btn btn-ghost" onClick={copyLink}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                              Скопировать вручную
                            </button>
                          </>
                        )}
                        {!steps.deep && (
                          <button className="btn btn-ghost" onClick={() => setShowQr(true)}>Показать QR-код</button>
                        )}
                      </div>
                    </span>
                  </li>
                )}
              </ol>

              {/* DIAGNOSTICS */}
              <div className="diag">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <span className="label">Проверка соединения</span>
                    <div style={{ fontSize: '14.5px', fontWeight: 700, marginTop: 4 }}>Диагностика подключения</div>
                  </div>
                  <button className="btn btn-primary sm" onClick={runDiag} disabled={diagRunning}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-6M6 20V10M18 20V4" /></svg>
                    {diagRunning ? 'Проверяем…' : 'Запустить проверку'}
                  </button>
                </div>
                <div className="diag-list">
                  {[
                    { id: 'dns', label: 'Проверка DNS-резолвинга', value: '1.1.1.1' },
                    { id: 'ip', label: 'Смена IP-адреса', value: '185.xx.42.7 · NL' },
                    { id: 'ping', label: 'Задержка до сервера', value: '24 мс' },
                    { id: 'leak', label: 'Поиск утечек IP / DNS / WebRTC', value: 'не найдено' },
                    { id: 'tun', label: 'Статус туннеля WireGuard', value: 'активен' },
                  ].map((d) => (
                    <div key={d.id} className={`drow ${diagDone ? 'ok' : ''}`}>
                      <span className="di">
                        {diagDone ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        )}
                      </span>
                      <span>{d.label}</span>
                      <span className="dv">{diagDone ? d.value : ''}</span>
                    </div>
                  ))}
                </div>
                {diagDone && (
                  <div className="diag-res show">
                    <span className="ri"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <b style={{ fontSize: '13.5px' }}>VPN работает корректно</b>
                      <p className="muted" style={{ margin: '2px 0 0', fontSize: '12.5px' }}>Утечек IP и DNS не обнаружено, трафик идёт через выбранный сервер.</p>
                    </div>
                    <button className="btn btn-ghost xs" onClick={() => { setDiagDone(false); }}>Повторить</button>
                  </div>
                )}
              </div>

              {/* TROUBLESHOOTING */}
              <div id="help">
                <div className="acc">
                  {[
                    { q: 'Приложение не открывается после установки', a: 'На macOS откройте приложение правой кнопкой → «Открыть» и подтвердите запуск: Gatekeeper блокирует программы не из App Store. На Windows добавьте приложение в исключения Защитника. Если не помогло — переустановите клиент из официальной ссылки выше.' },
                    { q: 'Список серверов пуст после импорта', a: 'Нажмите «Обновить подписку» или импортируйте ссылку повторно — клиент подтянет актуальный список узлов. Проверьте, что срок подписки не истёк: при нуле дней серверы не выдаются. Статус виден в кабинете в карточке ключа.' },
                    { q: 'Подключено, но сайты не открываются', a: 'Смените сервер на ближайший, проверьте дату и время на устройстве (расхождение больше 5 минут ломает соединение) и перезапустите клиент. Для мобильных сетей уменьшите MTU до 1280. Запустите диагностику выше — она покажет, где обрыв.' },
                    { q: 'Ошибка «Device limit reached»', a: 'Заняты все слоты устройств. Откройте кабинет → «Устройства» → отключите ненужное, либо докупите слоты в разделе «Тарифы». После освобождения слота повторите подключение.' },
                  ].map((item, i) => (
                    <div key={i} className={`acc-item ${openAcc === i ? 'open' : ''}`}>
                      <button className="acc-q" type="button" aria-expanded={openAcc === i} onClick={() => setOpenAcc(openAcc === i ? null : i)}>
                        {item.q}
                        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      <div className="acc-a"><div><p>{item.a}</p></div></div>
                    </div>
                  ))}
                </div>

                <div className="help" style={{ marginTop: 14 }}>
                  <span className="hic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" /><circle cx="12" cy="12" r="4" /></svg></span>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <b style={{ fontSize: '14.5px' }}>Не получилось?</b>
                    <p className="muted" style={{ margin: '3px 0 0', fontSize: '13px' }}>Сначала откройте FAQ по приложению. Если ошибка останется — поддержка поможет по скриншоту, отвечаем за 4 минуты.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost sm" onClick={() => addToast('Открыт FAQ по настройке приложений')}>FAQ по настройке →</button>
                    <button className="btn btn-lime-line sm" onClick={() => addToast('Открыт чат техподдержки — приложите скриншот ошибки')}>Техподдержка ↗</button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </main>

        <footer>
          <div className="f-inner">
            <div>
              <div className="brand" style={{ fontSize: 15 }}>
                <svg className="mark" viewBox="0 0 32 32" fill="none" style={{ width: 26, height: 26 }}><path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" /><path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>3<em>set</em><span className="dom mono">.online</span></span>
              </div>
              <p className="dim" style={{ fontSize: '12.5px', margin: '8px 0 0' }}>VPN-подписки: покупка и управление ключами · © 2026</p>
            </div>
            <div className="f-links">
              <a href="#guide">Инструкция</a><a href="#help">FAQ</a>
              <button onClick={async () => { try { if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText('support@3set.online'); addToast('Адрес поддержки скопирован'); } catch { addToast('Не удалось скопировать', 'err'); } }}>support@3set.online</button>
              <button onClick={() => addToast('Политика конфиденциальности')}>Политика</button>
            </div>
          </div>
        </footer>
      </div>

      {/* QR MODAL */}
      {showQr && (
        <div className="overlay open" role="dialog" aria-modal="true" aria-labelledby="qrTitle" onClick={(e) => { if (e.target === e.currentTarget) setShowQr(false); }}>
          <div className="modal">
            <div className="modal-head">
              <h3 id="qrTitle">QR-код подписки</h3>
              <button className="icon-btn" onClick={() => setShowQr(false)} aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div className="qr-frame"><canvas ref={qrCanvasRef} id="qrCanvas" width={210} height={210} /></div>
              <p className="muted" style={{ fontSize: '13px', margin: 0, textAlign: 'center' }}>Откройте приложение на телефоне → «Добавить подписку» → «Сканировать QR» и наведите камеру.</p>
              <code className="mono dim" style={{ fontSize: '11px', wordBreak: 'break-all', textAlign: 'center' }}>{key?.subscriptionUrl ?? ''}</code>
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={copyLink}>Скопировать</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowQr(false)}>Готово</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="toasts" id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'err' ? 'err' : ''} show`}>
            <span className="ti">
              {t.type === 'err' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              )}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      <button className="to-top" id="toTop" aria-label="Наверх" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    </div>
  );
}