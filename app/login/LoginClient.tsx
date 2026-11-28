'use client';

// /login + /signup — client island ported from the supplied keys.html
// template. Real API-backed auth only: email login/register, Telegram
// bot-redirect login, Telegram Login Widget, forgot-password flow. No mock
// state. Falls back to the template's visuals where no real API exists yet.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

const LOGIN_ENDPOINT = '/api/auth/email/login';
const REGISTER_ENDPOINT = '/api/auth/email/register';
const FORGOT_REQUEST_ENDPOINT = '/api/auth/email/password/request';
const TG_REQUEST_ENDPOINT = '/api/auth/telegram-bot/request';
const TG_STATUS_ENDPOINT = '/api/auth/telegram-bot/status';
const TG_CONSUME_ENDPOINT = '/api/auth/telegram-bot/consume';
const TG_WIDGET_ENDPOINT = '/api/auth/telegram';
const REF_CLICK_ENDPOINT = '/api/referrals/click';

type Mode = 'login' | 'register';
type BotState = 'idle' | 'waiting' | 'ready' | 'expired' | 'error';
type ForgotStep = 'form' | 'sent' | null;

/** Russian plural picker: 1 пользователь / 2 пользователя / 5 пользователей. */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string } };
  }
}

interface LoginClientProps {
  initialMode: Mode;
  // Never name this prop `ref`: React reserves it, and a Server Component
  // passing it to a Client Component throws at render (digest 1362685469).
  referralCode: string | null;
  activeKeys: number;
  legalBaseUrl: string;
}

export default function LoginClient({
  initialMode,
  referralCode: refParam,
  activeKeys,
  legalBaseUrl,
}: LoginClientProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [terms, setTerms] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [password2Error, setPassword2Error] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [rateWaitSec, setRateWaitSec] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(() => refParam);
  const [refBanner, setRefBanner] = useState<boolean>(!!refParam);
  const [botState, setBotState] = useState<BotState>('idle');
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [tgToken, setTgToken] = useState<string | null>(null);
  const [tgCode, setTgCode] = useState('');
  const [tgCodeWrong, setTgCodeWrong] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotStep>(null);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotHint, setForgotHint] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; type: 'ok' | 'err' }>>([]);
  const toastIdRef = useRef(0);
  const router = useRouter();

  const rateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tgInFlight = useRef(false);
  const tgCancelled = useRef(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const locked = loading || rateWaitSec !== null;
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode !== 'register' || (password2.length > 0 && terms)) &&
    !locked;

  const addToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastIdRef.current;
    setToasts((xs) => [...xs, { id, msg, type }]);
    setTimeout(() => setToasts((xs) => xs.filter((t) => t.id !== id)), 3200);
  }, []);

  const stopTgTimers = useCallback(() => {
    if (pollTimer.current !== null) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    if (expiryTimer.current !== null) {
      clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      tgCancelled.current = true;
      stopTgTimers();
      if (rateTimer.current !== null) clearTimeout(rateTimer.current);
    },
    [stopTgTimers],
  );

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setPassword('');
    setPassword2('');
    setEmailError(null);
    setPasswordError(null);
    setPassword2Error(null);
    setFormError(null);
  }, []);

  const validate = useCallback(() => {
    setEmailError(null);
    setPasswordError(null);
    setPassword2Error(null);
    setFormError(null);

    const trimmed = email.trim();
    let ok = true;
    if (!trimmed) {
      setEmailError(t('auth.fieldRequired'));
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(t('auth.emailInvalid'));
      ok = false;
    }

    if (!password) {
      setPasswordError(t('auth.fieldRequired'));
      ok = false;
    } else if (mode === 'register' && password.length < 8) {
      setPasswordError(t('auth.passwordTooShort'));
      ok = false;
    }

    if (mode === 'register') {
      if (password2 !== password) {
        setPassword2Error(t('auth.passwordsMismatch'));
        ok = false;
      }
      if (!terms) {
        ok = false;
      }
    }

    return ok;
  }, [email, password, password2, terms, mode]);

  const renderStrength = useCallback(() => {
    const v = password;
    let s = 0;
    if (v.length >= 8) s++;
    if (v.length >= 12) s++;
    if (/[a-zа-я]/.test(v) && /[A-ZА-Я]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^\wа-яА-ЯёЁ]/.test(v)) s++;
    s = Math.min(4, Math.max(v.length ? 1 : 0, Math.round(s * 0.8)));
    for (let i = 1; i <= 4; i++) {
      const el = document.getElementById(`sb${i}`);
      if (el) el.style.width = i <= s ? '100%' : '0';
    }
    const label = document.getElementById('sLabel');
    const colors = ['#ff7a6b', '#ff9f6b', '#ffd166', '#b7ff45'];
    const labels = ['—', 'слабый', 'слабый', 'средний', 'хороший', 'надёжный'];
    if (label) {
      label.textContent = v ? labels[s] : '—';
      label.style.color = v ? colors[Math.max(0, s - 1)] : '';
    }
  }, [password]);

  useEffect(() => {
    if (mode === 'register') renderStrength();
  }, [mode, password, renderStrength]);

  /* ---------- email login/register submit ---------- */
  const submit = useCallback(async () => {
    if (!validate()) {
      const first =
        document.querySelector('.input.err') ??
        (mode === 'register' && !terms ? document.getElementById('fTerms') : null);
      if (first) {
        first.classList.add('shake');
        setTimeout(() => first.classList.remove('shake'), 420);
      }
      addToast('Проверьте выделенные поля', 'err');
      return;
    }
    setLoading(true);
    setFormError(null);
    try {
      const endpoint = mode === 'login' ? LOGIN_ENDPOINT : REGISTER_ENDPOINT;
      const body: Record<string, unknown> = { email: email.trim(), password };
      if (mode === 'register' && refCode) {
        body.ref = refCode;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // Funnel-top beacon (public, no session) + post-login pin for the
        // signed-in account. Registration carries `ref` in the body itself;
        // login has to pin after the cookie exists. Both are best-effort and
        // never block the redirect.
        if (refCode) {
          void fetch(REF_CLICK_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: refCode }),
            keepalive: true,
          }).catch(() => undefined);
          if (mode === 'login') {
            void fetch('/api/referrals/pin', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ code: refCode }),
              keepalive: true,
            }).catch(() => undefined);
          }
        }
        setLoading(false);
        document.body.style.overflow = '';
        const pb = document.getElementById('progBar');
        if (pb) {
          pb.style.animation = 'none';
          void pb.offsetWidth;
          pb.style.animation = '';
        }
        document.getElementById('authForm')?.style.setProperty('display', 'none');
        document.getElementById('altLogin')?.style.setProperty('display', 'none');
        document.getElementById('refCodeBtn')?.style.setProperty('display', 'none');
        document.getElementById('successBox')?.classList.add('show');
        const title = document.getElementById('successTitle');
        const text = document.getElementById('successText');
        if (title)
          title.textContent = mode === 'register' ? 'Аккаунт создан' : 'Вход выполнен';
        if (text)
          text.textContent = mode === 'register'
            ? `Аккаунт ${email.trim()} создан. Перенаправляем в личный кабинет…`
            : 'С возвращением! Загружаем ваши ключи и подписки…';
        // Confetti burst on the success panel (template parity).
        const box = document.getElementById('confetti');
        if (box) {
          const colors = ['#b7ff45', '#d4ff85', '#8fdc2c', '#eef5ea', '#63d7c8'];
          for (let i = 0; i < 48; i++) {
            const p = document.createElement('i');
            p.className = 'cf';
            p.style.left = `${Math.random() * 100}vw`;
            p.style.background = colors[i % colors.length];
            p.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
            p.style.animationDelay = `${Math.random() * 0.5}s`;
            box.appendChild(p);
            setTimeout(() => p.remove(), 3600);
          }
        }
        addToast(mode === 'register' ? 'Регистрация успешна — добро пожаловать!' : 'Вы вошли в кабинет');
        setTimeout(() => { router.push('/'); }, 1400);
        return;
      }
      let payload: { error?: unknown; retryAfterSec?: unknown };
      try {
        payload = (await res.json()) as { error?: unknown; retryAfterSec?: unknown };
      } catch {
        payload = {};
      }
      if (res.status === 429 && payload.error === 'rate_limited') {
        const wait =
          typeof payload.retryAfterSec === 'number' && Number.isFinite(payload.retryAfterSec)
            ? Math.max(1, Math.ceil(payload.retryAfterSec))
            : 60;
        setFormError(null);
        setRateWaitSec(wait);
        if (rateTimer.current !== null) clearTimeout(rateTimer.current);
        rateTimer.current = setTimeout(() => setRateWaitSec(null), wait * 1000);
        setPassword('');
        return;
      }
      if (payload.error === 'invalid_credentials' || payload.error === 'email_taken') {
        setFormError(t('auth.invalidCredentials'));
        setPassword('');
        return;
      }
      // Upstream/provider outages are worth separating from a generic failure:
      // the visitor should retry in a minute, not doubt their password.
      if (res.status === 502 || res.status === 503) {
        setFormError(t('common.errorUnavailable'));
        return;
      }
      if (res.status === 429) {
        const wait =
          typeof payload.retryAfterSec === 'number' && Number.isFinite(payload.retryAfterSec)
            ? Math.max(1, Math.ceil(payload.retryAfterSec))
            : 60;
        setFormError(t('common.errorRateLimit', { seconds: wait }));
        return;
      }
      setFormError(t('login.error'));
    } catch {
      setFormError(t('login.error'));
    } finally {
      setLoading(false);
    }
  }, [email, password, refCode, mode, validate, router, terms, addToast]);

  /* ---------- telegram bot-redirect login ---------- */
  const pollTgRef = useRef<(tok: string) => void>(() => {});
  const pollTg = useCallback(async (tok: string) => {
    if (tgCancelled.current) return;
    try {
      const res = await fetch(TG_STATUS_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tok }),
      });
      if (tgCancelled.current) return;
      if (!res.ok) { setBotState('error'); return; }
      const data = (await res.json()) as { status?: string };
      if (data.status === 'ready') {
        stopTgTimers();
        setTgToken(tok);
        setBotState('ready');
        return;
      }
      if (data.status === 'expired' || data.status === 'consumed') { setBotState('expired'); return; }
    } catch {
      // transient: keep polling
    }
    if (tgCancelled.current) return;
    if (pollTimer.current !== null) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(() => pollTgRef.current(tok), 2000);
  }, [stopTgTimers]);

  useEffect(() => {
    pollTgRef.current = (tok: string) => void pollTg(tok);
  }, [pollTg]);

  const issueTgToken = useCallback(async () => {
    if (tgInFlight.current) return;
    tgInFlight.current = true;
    setTgBusy(true);
    stopTgTimers();
    setTgToken(null);
    setBotUrl(null);
    setTgCode('');
    setTgCodeWrong(false);
    try {
      const res = await fetch(TG_REQUEST_ENDPOINT, { method: 'POST' });
      if (tgCancelled.current) return;
      if (!res.ok) { setBotState('error'); return; }
      const data = (await res.json()) as { token?: unknown; botUrl?: unknown; expiresInSec?: unknown };
      if (typeof data.token !== 'string' || typeof data.botUrl !== 'string') { setBotState('error'); return; }
      setBotUrl(data.botUrl);
      setBotState('waiting');
      const ttl = typeof data.expiresInSec === 'number' && Number.isFinite(data.expiresInSec) ? data.expiresInSec : 0;
      if (ttl > 0) {
        expiryTimer.current = setTimeout(() => { if (!tgCancelled.current) setBotState('expired'); }, ttl * 1000);
      }
      void pollTg(data.token);
    } catch {
      if (!tgCancelled.current) setBotState('error');
    } finally {
      tgInFlight.current = false;
      setTgBusy(false);
    }
  }, [stopTgTimers, pollTg]);

  const submitTgCode = useCallback(async () => {
    if (tgInFlight.current || tgToken === null) return;
    if (!/^\d{6}$/.test(tgCode)) { setTgCodeWrong(true); return; }
    tgInFlight.current = true;
    setTgBusy(true);
    try {
      const res = await fetch(TG_CONSUME_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tgToken, code: tgCode }),
      });
      if (tgCancelled.current) return;
      if (res.ok) {
        document.body.style.overflow = '';
        router.push('/');
        return;
      }
      if (res.status === 401) { setTgCodeWrong(true); setTgCode(''); return; }
      setBotState(res.status === 409 ? 'expired' : 'error');
    } catch {
      if (!tgCancelled.current) setBotState('error');
    } finally {
      tgInFlight.current = false;
      setTgBusy(false);
    }
  }, [tgCode, tgToken, router]);

  // Telegram Mini App bridge: inside the bot's webview the widget cannot run,
  // but `initData` is already signed — post it to the same verified route.
  // useSyncExternalStore reads a browser-only global without a hydration
  // mismatch: the server snapshot is always false, the client re-reads after
  // hydration.
  const webappAvailable = useSyncExternalStore(
    () => () => {},
    () => Boolean(window.Telegram?.WebApp?.initData),
    () => false,
  );

  const loginFromWebapp = useCallback(async () => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      addToast(t('login.error'), 'err');
      return;
    }
    setTgBusy(true);
    try {
      const res = await fetch(TG_WIDGET_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      if (res.ok) {
        router.push('/');
        return;
      }
      addToast(t('login.error'), 'err');
    } catch {
      addToast(t('login.error'), 'err');
    } finally {
      setTgBusy(false);
    }
  }, [router, addToast]);

  const drawTgQr = useCallback((url: string) => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const fallback = () => {
      canvas.width = 190;
      canvas.height = 190;
      ctx.fillStyle = '#f2f7ee';
      ctx.fillRect(0, 0, 190, 190);
      ctx.fillStyle = '#0e1512';
      ctx.font = '600 13px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR недоступен', 95, 92);
      ctx.fillText('откройте ссылку', 95, 112);
    };
    void import('qrcode')
      .then((QRCode) =>
        QRCode.toDataURL(url, {
          width: 190,
          margin: 1,
          color: { dark: '#0e1512', light: '#f2f7ee' },
        }),
      )
      .then((dataUrl) => {
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = '#f2f7ee';
          ctx.fillRect(0, 0, 190, 190);
          ctx.drawImage(img, 0, 0, 190, 190);
        };
        img.src = dataUrl;
      })
      .catch(fallback);
  }, []);

  const openTgModal = useCallback(() => {
    document.getElementById('ovTg')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }, []);

  const closeTgModal = useCallback(() => {
    document.getElementById('ovTg')?.classList.remove('open');
    document.body.style.overflow = '';
    setBotState('idle');
  }, []);

  const startTgLogin = useCallback(() => {
    openTgModal();
    void issueTgToken();
  }, [openTgModal, issueTgToken]);

  useEffect(() => {
    if (botState === 'waiting' && botUrl) drawTgQr(botUrl);
  }, [botState, botUrl, drawTgQr]);

  /* ---------- forgot password ---------- */
  const openForgot = useCallback(() => {
    setForgotStep('form');
    setForgotEmail(email.trim());
    setForgotHint(null);
    setForgotBusy(false);
    document.getElementById('ovForgot')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }, [email]);

  const sendForgotCode = useCallback(async () => {
    const trimmed = forgotEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setForgotHint(t('auth.emailInvalid'));
      return;
    }
    setForgotBusy(true);
    try {
      const res = await fetch(FORGOT_REQUEST_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.ok) {
        setForgotStep('sent');
        setForgotHint(null);
        return;
      }
      let payload: { error?: unknown } = {};
      try { payload = (await res.json()) as { error?: unknown }; } catch { /* ignore */ }
      if (res.status === 404 || payload.error === 'reset_no_account') {
        setForgotHint(t('auth.resetNoAccount'));
        return;
      }
      if (res.status === 429) {
        setForgotHint(t('auth.rateLimited', { n: 60 }));
        return;
      }
      setForgotHint(t('auth.resetError'));
    } catch {
      setForgotHint(t('auth.resetError'));
    } finally {
      setForgotBusy(false);
    }
  }, [forgotEmail]);

  const closeForgot = useCallback(() => {
    document.getElementById('ovForgot')?.classList.remove('open');
    document.body.style.overflow = '';
    setForgotStep(null);
    setForgotHint(null);
  }, []);

  const openRefModal = useCallback(() => {
    const input = document.getElementById('refInput') as HTMLInputElement | null;
    if (input) input.value = '';
    document.getElementById('ovRef')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => input?.focus(), 260);
  }, []);

  const applyRefCode = useCallback(() => {
    const input = document.getElementById('refInput') as HTMLInputElement | null;
    const v = (input?.value ?? '').trim().toUpperCase();
    if (!/^3SET-[A-Z0-9]{6}$/.test(v)) {
      input?.classList.add('shake');
      setTimeout(() => input?.classList.remove('shake'), 420);
      addToast('Формат кода: 3SET-XXXXXX', 'err');
      return;
    }
    setRefCode(v);
    setRefBanner(true);
    document.getElementById('ovRef')?.classList.remove('open');
    document.body.style.overflow = '';
    addToast(`Код ${v} применён — бонус после первой оплаты`);
  }, [addToast]);

  /* ---------- reveal animations + counters ---------- */
  useEffect(() => {
    const io = new IntersectionObserver(
      (ents) => {
        ents.forEach((en) => {
          if (en.isIntersecting) {
            (en.target as HTMLElement).classList.add('in');
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const countUp = (el: HTMLElement, to: number, dur: number, suffix = '') => {
      const st = performance.now();
      const from = parseInt(el.textContent ?? '0', 10) || 0;
      const step = (now: number) => {
        const p = Math.min(1, (now - st) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (to - from) * e) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const t1 = setTimeout(() => {
      const k = document.getElementById('stKeys');
      if (k) {
        if (activeKeys >= 100) countUp(k, activeKeys, 1400);
        else k.textContent = String(activeKeys);
      }
    }, 350);
    return () => clearTimeout(t1);
  }, [activeKeys]);

  /* ---------- render ---------- */
  return (
    <div className="auth-page">
      <div className="bg-fx">
        <div className="grid" aria-hidden="true" />
        <div className="blob b1" aria-hidden="true" />
        <div className="blob b2" aria-hidden="true" />
        <div className="blob b3" aria-hidden="true" />
      </div>

      <div className="page">
        {/* LEFT brand panel */}
        <section className="brand-panel">
          <div className="orbits" aria-hidden="true">
            <div className="ring"><span className="dotp" /></div>
            <div className="ring r2"><span className="dotp" style={{ background: 'var(--cyan)', boxShadow: '0 0 12px rgba(99,215,200,.9)' }} /></div>
            <div className="ring r3"><span className="dotp" /></div>
          </div>
          <a className="brand reveal" href={legalBaseUrl} style={{ '--d': '0ms' } as React.CSSProperties}>
            <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
              <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>3<em>set</em><span className="dom mono">.online</span></span>
          </a>
          <div className="bp-title reveal" style={{ '--d': '80ms' } as React.CSSProperties}>
            <h1>VPN который <em>работает</em> везде.</h1>
            <p>Один ключ — все ваши устройства. WireGuard-подключение, безлимитный трафик и личный кабинет, где всё под контролем.</p>
          </div>
          <div className="feats reveal" style={{ '--d': '160ms' } as React.CSSProperties}>
            <div className="feat">
              <span className="fic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 3 7v6c0 5 3.8 8.6 9 10 5.2-1.4 9-5 9-10V7z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <div>
                <b>Без логов трафика</b>
                <span>В кабинете виден только срок ключа, трафик и число устройств</span>
              </div>
            </div>
            <div className="feat">
              <span className="fic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m13 2-9 12h7l-1 8 9-12h-7z" />
                </svg>
              </span>
              <div>
                <b>WireGuard и VLESS</b>
                <span>Сервер подбирается автоматически — или вручную в клиенте</span>
              </div>
            </div>
            <div className="feat">
              <span className="fic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="14" height="20" x="5" y="2" rx="2" />
                  <path d="M12 18h.01" />
                </svg>
              </span>
              <div>
                <b>Все устройства на одном ключе</b>
                <span>Телефон, ноутбук, планшет и Smart TV — одна ссылка подписки</span>
              </div>
            </div>
          </div>
          <div className="bp-stats reveal" style={{ '--d': '240ms' } as React.CSSProperties}>
            <div className="bs">
              <b>∞</b>
              <span>любое количество пользователей</span>
            </div>
            <div className="bs">
              <b id="stKeys">{activeKeys}</b>
              <span>{ruPlural(activeKeys, 'активный ключ', 'активных ключа', 'активных ключей')}</span>
            </div>
            <div className="bs">
              <b>WG</b>
              <span>WireGuard · VLESS</span>
            </div>
          </div>
        </section>

        {/* RIGHT form panel */}
        <section className="form-panel">
          <div className="form-wrap">
            <div className="m-brand">
              <a className="brand" href={legalBaseUrl}>
                <svg className="mark" viewBox="0 0 32 32" fill="none" style={{ width: 34, height: 34 }}>
                  <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                  <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>3<em>set</em><span className="dom mono">.online</span></span>
              </a>
              <span className="mono dim" style={{ fontSize: 11 }}>WireGuard · VLESS</span>
            </div>

            <header className="head reveal" style={{ '--d': '80ms' } as React.CSSProperties}>
              <h2 id="headTitle">{mode === 'register' ? 'Создать аккаунт' : 'Вход в кабинет'}</h2>
              <p id="headText">
                {mode === 'register'
                  ? 'Регистрация займёт минуту: email, пароль — и можно покупать подписку. Или войдите через Telegram.'
                  : 'Войдите по email или через Telegram. Вы останетесь в системе на этом устройстве.'}
              </p>
            </header>

            <div className="card reveal" style={{ '--d': '160ms' } as React.CSSProperties}>
              <div className={`seg-tabs ${mode === 'register' ? 'right' : ''}`} id="segTabs" role="group" aria-label="Вход или регистрация">
                <span className="ind" />
                <button
                  type="button"
                  id="tabLogin"
                  onClick={() => switchMode('login')}
                  disabled={locked}
                  aria-pressed={mode === 'login'}
                  className={mode === 'login' ? 'on' : ''}
                >
                  {t('auth.modeLogin')}
                </button>
                <button
                  type="button"
                  id="tabReg"
                  onClick={() => switchMode('register')}
                  disabled={locked}
                  aria-pressed={mode === 'register'}
                  className={mode === 'register' ? 'on' : ''}
                >
                  {t('auth.modeRegister')}
                </button>
              </div>

              {refBanner && refCode && (
                <div className="ref-banner show" id="refBanner" style={{ marginTop: 16 }}>
                  <span className="ric">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 12v9H4v-9" />
                      <path d="M2 7h20v5H2z" />
                      <path d="M12 22V7" />
                      <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                  </span>
                  <div>
                    <b>Вы пришли по ссылке друга</b>
                    <span>
                      Код <span className="mono" id="refCode" style={{ color: 'var(--lime)' }}>{refCode}</span>
                      &middot; бонус после первой оплаты
                    </span>
                  </div>
                  <button id="refRemove" onClick={() => setRefBanner(false)} title="Убрать код">
                    убрать
                  </button>
                </div>
              )}

              <form id="authForm" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                <div className="field">
                  <label htmlFor="fEmail">Email <span className="req">*</span></label>
                  <div className="inp-wrap">
                    <svg className="lic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m2 7 10 6 10-6" />
                    </svg>
                    <input
                      id="fEmail"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      disabled={locked}
                      className={`input ${emailError ? 'err' : ''}`}
                    />
                  </div>
                  <span className={`hint ${emailError ? 'bad' : 'good'}`} id="hEmail">
                    {emailError || (email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Адрес указан верно' : '')}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="fPass">Пароль <span className="req">*</span></label>
                  <div className="inp-wrap">
                    <svg className="lic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="11" x="3" y="10" rx="2" />
                      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
                    </svg>
                    <input
                      id="fPass"
                      type={mode === 'register' ? 'password' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      minLength={8}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (mode === 'register') renderStrength(); }}
                      placeholder={mode === 'register' ? 'Минимум 8 символов' : 'Ваш пароль'}
                      disabled={locked}
                      className={`input ${passwordError ? 'err' : ''} ${mode === 'register' ? '' : ''}`}
                      style={{ paddingRight: 48 }}
                    />
                    <button
                      type="button"
                      className="eye"
                      id="eyePass"
                      onClick={() => {
                        const inp = document.getElementById('fPass') as HTMLInputElement | null;
                        const btn = document.getElementById('eyePass');
                        if (!inp || !btn) return;
                        const show = inp.type === 'password';
                        inp.type = show ? 'text' : 'password';
                        btn.style.color = show ? 'var(--lime)' : '';
                        btn.title = show ? 'Скрыть' : 'Показать';
                        inp.focus();
                      }}
                      aria-label="Показать пароль"
                      title="Показать"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                  {mode === 'register' && (
                    <>
                      <div className="strength" id="strengthBox">
                        <span className="sb"><i id="sb1" /></span>
                        <span className="sb"><i id="sb2" /></span>
                        <span className="sb"><i id="sb3" /></span>
                        <span className="sb"><i id="sb4" /></span>
                        <span className="sl" id="sLabel">—</span>
                      </div>
                      <span className="hint" id="hPass">
                        {passwordError || (password.length > 0 && password.length < 8 ? `Минимум 8 символов — сейчас ${password.length}` : password.length > 0 ? 'Отличный пароль' : 'Минимум 8 символов.')}
                      </span>
                    </>
                  )}
                  {mode !== 'register' && <span className="hint" id="hPass">{passwordError || ''}</span>}
                </div>

                {mode === 'register' && (
                  <div className="field" id="repeatField">
                    <label htmlFor="fPass2">Повторите пароль <span className="req">*</span></label>
                    <div className="inp-wrap">
                      <svg className="lic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M8 16H3v5" />
                      </svg>
                      <input
                        id="fPass2"
                        type="password"
                        autoComplete="new-password"
                        value={password2}
                        onChange={(e) => setPassword2(e.target.value)}
                        placeholder="Ещё раз"
                        disabled={locked}
                        className={`input ${password2Error ? 'err' : ''}`}
                        style={{ paddingRight: 48 }}
                      />
                      <button
                        type="button"
                        className="eye"
                        id="eyePass2"
                        onClick={() => {
                          const inp = document.getElementById('fPass2') as HTMLInputElement | null;
                          const btn = document.getElementById('eyePass2');
                          if (!inp || !btn) return;
                          const show = inp.type === 'password';
                          inp.type = show ? 'text' : 'password';
                          btn.style.color = show ? 'var(--lime)' : '';
                          btn.title = show ? 'Скрыть' : 'Показать';
                          inp.focus();
                        }}
                        aria-label="Показать пароль"
                        title="Показать"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                    <span className={`hint ${password2Error ? 'bad' : 'good'}`} id="hPass2">
                      {password2Error || (password2 && password2 === password ? 'Пароли совпадают' : '')}
                    </span>
                  </div>
                )}

                <div className="form-row">
                  {mode === 'register' ? (
                    <label className="check" id="termsWrap">
                      <input
                        type="checkbox"
                        id="fTerms"
                        checked={terms}
                        onChange={(e) => setTerms(e.target.checked)}
                        disabled={locked}
                      />
                      Принимаю{' '}
                      <a
                        href={`${legalBaseUrl}/terms`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-btn"
                      >
                        условия
                      </a>
                    </label>
                  ) : (
                    // No "remember me": the session cookie is always 30 days
                    // (buildSessionCookie), so a toggle here would be a lie.
                    <span />
                  )}
                  {mode === 'login' && (
                    <button type="button" className="link-btn" id="forgotBtn" onClick={openForgot}>
                      {t('auth.forgotPassword')}
                    </button>
                  )}
                </div>

                {(formError || rateWaitSec !== null) && (
                  <p className="hint bad" style={{ margin: '0 0 12px', textAlign: 'center' }} role="alert">
                    {rateWaitSec !== null
                      ? t('auth.rateLimited', { n: rateWaitSec })
                      : formError}
                  </p>
                )}

                <button
                  type="submit"
                  className={`btn btn-primary block ${locked || !canSubmit ? '' : ''}`}
                  id="submitBtn"
                  disabled={locked || !canSubmit}
                >
                  <svg id="submitIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {mode === 'register' ? (
                      <>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M19 8v6M22 11h-6" />
                      </>
                    ) : (
                      <>
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <path d="m10 17 5-5-5-5" />
                        <path d="M15 12H3" />
                      </>
                    )}
                  </svg>
                  <span id="submitLabel">
                    {loading
                      ? mode === 'register'
                        ? t('auth.registerCtaLoading')
                        : t('auth.loginCtaLoading')
                      : mode === 'register'
                        ? t('auth.registerCta')
                        : t('auth.loginCta')}
                  </span>
                </button>
              </form>

              <button
                type="button"
                className="btn btn-quiet block sm"
                id="refCodeBtn"
                onClick={openRefModal}
                style={{ marginTop: 12, height: 38 }}
              >                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
                  <path d="m15 9-6 6M9 9h.01M15 15h.01" />
                </svg>
                У меня есть реферальный код
              </button>

              {/* success panel */}
              <div className="success" id="successBox">
                <span className="s-circle">
                  <svg viewBox="0 0 24 24">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <div>
                  <b style={{ fontSize: 17 }} id="successTitle">Аккаунт создан</b>
                  <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }} id="successText">
                    Перенаправляем в личный кабинет…
                  </p>
                </div>
                <div className="prog"><i id="progBar" /></div>
              </div>
            </div>

            <div className="reveal" id="altLogin" style={{ '--d': '240ms', display: 'flex', flexDirection: 'column', gap: 14 } as React.CSSProperties}>
              <button className="btn btn-tg block" id="tgBtn" onClick={startTgLogin} disabled={tgBusy}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m22 2-7 20-4-9-9-4z" />
                  <path d="M22 2 11 13" />
                </svg>
                <span id="tgLabel">{t('auth.loginViaBot')}</span>
              </button>

               <div className="divider" style={{ marginTop: 4 }}><i></i><span>{t('auth.orContinue')}</span><i></i></div>

               {webappAvailable && (
                 <>
                   <button
                     type="button"
                     className="btn btn-tg block sm"
                     onClick={() => void loginFromWebapp()}
                     disabled={tgBusy}
                     style={{ marginTop: 8 }}
                   >
                     {t('home.loginCta')}
                   </button>
                   <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--dim)' }}>
                     {t('login.webappNote')}
                   </p>
                 </>
               )}
            </div>

            <p className="legal">
              Регистрируясь, вы соглашаетесь с{' '}
              <a href={`${legalBaseUrl}/terms`} target="_blank" rel="noopener noreferrer">
                офертой
              </a>{' '}
              и{' '}
              <a href={`${legalBaseUrl}/privacy`} target="_blank" rel="noopener noreferrer">
                политикой конфиденциальности
              </a>
              . В кабинете виден только объём трафика, а не история посещений.
            </p>
          </div>
        </section>
      </div>

      {/* FORGOT MODAL */}
      <div className="overlay" id="ovForgot" role="dialog" aria-modal="true" aria-labelledby="fgTitle">
        <div className="modal">
          <div className="modal-head">
            <h3 id="fgTitle">Восстановление пароля</h3>
            <button className="icon-btn" onClick={closeForgot} aria-label="Закрыть">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {forgotStep === 'sent' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span className="s-circle" style={{ margin: '0 auto', width: 68, height: 68 }}>
                <svg viewBox="0 0 24 24">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <p className="muted" style={{ fontSize: 13.5, margin: 0, textAlign: 'center' }}>
                Письмо со ссылкой для смены пароля отправлено на{' '}
                <b className="mono" style={{ color: 'var(--lime)', fontSize: 12.5 }}>{forgotEmail}</b>.
                Ссылка действует 1 час. Проверьте папку «Спам», если письма нет.
              </p>
              <button className="btn btn-primary block sm" onClick={closeForgot}>
                Понятно
              </button>
            </div>
          ) : (
            <div>
              <p className="muted" style={{ fontSize: 13.5, margin: '0 0 14px' }}>
                Укажите email аккаунта — пришлём ссылку для смены пароля (действует 1 час).
              </p>
              <div className="field">
                <label htmlFor="fgEmail">Email</label>
                <div className="inp-wrap">
                  <svg className="lic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m2 7 10 6 10-6" />
                  </svg>
                  <input
                    id="fgEmail"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className={`input ${forgotHint ? 'err' : ''}`}
                    disabled={forgotBusy}
                  />
                </div>
                <span className={`hint ${forgotHint ? 'bad' : ''}`} id="fgHint">
                  {forgotHint}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost sm" onClick={closeForgot} style={{ flex: 1 }}>
                  Отмена
                </button>
                <button
                  className="btn btn-primary sm"
                  id="fgSend"
                  onClick={() => void sendForgotCode()}
                  disabled={forgotBusy}
                  style={{ flex: 1 }}
                >
                  {forgotBusy ? 'Отправляем…' : 'Отправить ссылку'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TELEGRAM MODAL */}
      <div className="overlay" id="ovTg" role="dialog" aria-modal="true" aria-labelledby="tgTitle">
        <div className="modal">
          <div className="modal-head">
            <h3 id="tgTitle">Вход через Telegram</h3>
            <button className="icon-btn" onClick={closeTgModal} aria-label="Закрыть">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {botState === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '8px 0' }}>
              <p className="hint bad" style={{ margin: 0, textAlign: 'center' }}>
                {t('login.error')}
              </p>
              <button className="btn btn-tg block sm" onClick={() => void issueTgToken()}>
                {t('common.retry')}
              </button>
            </div>
          )}

          {botState === 'expired' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '8px 0' }}>
              <p className="hint bad" style={{ margin: 0, textAlign: 'center' }}>
                {t('auth.botLoginExpired')}
              </p>
              <button className="btn btn-tg block sm" onClick={() => void issueTgToken()}>
                {t('common.retry')}
              </button>
            </div>
          )}

          {(botState === 'idle' || botState === 'waiting' || botState === 'ready') && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              {botState === 'waiting' && !botUrl && (
                <p className="muted" style={{ margin: '8px 0', fontSize: 13.5, textAlign: 'center' }}>
                  Готовим вход через Telegram…
                </p>
              )}
              {botState === 'waiting' && botUrl && (
                <>
                  <div className="qr-frame">
                    <canvas ref={qrCanvasRef} id="tgQr" width={190} height={190} />
                  </div>
                  <ol className="tg-steps" style={{ width: '100%' }}>
                    <li><span className="n">1</span>Откройте Telegram на телефоне</li>
                    <li>
                      <span className="n">2</span>Отсканируйте QR-код или перейдите по ссылке к боту
                    </li>
                    <li>
                      <span className="n">3</span>Нажмите «Старт» в боте — он пришлёт 6-значный код
                    </li>
                  </ol>
                  <a
                    className="btn btn-tg block sm"
                    href={botUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ width: '100%' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m22 2-7 20-4-9-9-4z" />
                      <path d="M22 2 11 13" />
                    </svg>
                    Открыть Telegram
                  </a>
                </>
              )}

              {botState === 'ready' && (
                <>
                  <p className="muted" style={{ margin: 0, fontSize: 13.5, textAlign: 'center' }}>
                    {t('auth.botLoginCodePrompt')}
                  </p>
                  <div className="code-row" style={{ marginTop: 2 }}>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <input
                        key={i}
                        className={`code-cell mono ${tgCodeWrong ? 'err' : ''}`}
                        maxLength={1}
                        inputMode="numeric"
                        aria-label={`${t('auth.botLoginCodeLabel')} ${i}`}
                        value={tgCode[i - 1] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 1);
                          setTgCode((prev) => {
                            const arr = (prev + '      ').slice(0, 6).split('');
                            arr[i - 1] = v;
                            return arr.join('').trimEnd();
                          });
                          setTgCodeWrong(false);
                          if (v && i < 6) {
                            const cells = document.querySelectorAll('#ovTg .code-cell');
                            (cells[i] as HTMLInputElement | null)?.focus();
                          }
                        }}
                      />
                    ))}
                  </div>
                  {tgCodeWrong && (
                    <p className="hint bad" style={{ margin: 0, textAlign: 'center' }}>
                      {t('auth.botLoginCodeWrong')}
                    </p>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
                <button className="btn btn-ghost sm" onClick={closeTgModal} style={{ flex: 1 }}>
                  Отмена
                </button>
                {botState === 'ready' ? (
                  <button
                    className="btn btn-tg sm"
                    onClick={() => void submitTgCode()}
                    disabled={tgBusy || tgCode.length !== 6}
                    style={{ flex: 1 }}
                  >
                    {t('auth.botLoginCodeSubmit')}
                  </button>
                ) : (
                  <button
                    className="btn btn-tg sm"
                    onClick={() => void issueTgToken()}
                    disabled={tgBusy || (botState === 'waiting' && Boolean(botUrl))}
                    style={{ flex: 1 }}
                  >
                    {tgBusy ? 'Готовим…' : botState === 'waiting' ? t('auth.botLoginWaiting') : 'Открыть бота'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* REF CODE MODAL */}
      <div className="overlay" id="ovRef" role="dialog" aria-modal="true" aria-labelledby="rfTitle">
        <div className="modal" style={{ width: 'min(400px,100%)' }}>
          <div className="modal-head">
            <h3 id="rfTitle">Реферальный код</h3>
            <button className="icon-btn" onClick={() => { document.getElementById('ovRef')?.classList.remove('open'); document.body.style.overflow = ''; }} aria-label="Закрыть">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
            Введите код друга — после вашей первой оплаты бонус получат оба.
          </p>
          <div className="inp-wrap" style={{ marginBottom: 14 }}>
            <input
              id="refInput"
              className="input noicon mono"
              placeholder="3SET-XXXXXX"
              style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost sm" onClick={() => { document.getElementById('ovRef')?.classList.remove('open'); document.body.style.overflow = ''; }} style={{ flex: 1 }}>
              Отмена
            </button>
            <button className="btn btn-primary sm" id="refApply" onClick={applyRefCode} style={{ flex: 1 }}>
              Применить
            </button>
          </div>
        </div>
      </div>

      <div className="toasts" id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.type === 'err' ? ' err' : ''}`}>
            <span className="ti">
              {t.type === 'err' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
      <div className="confetti" id="confetti" />
    </div>
  );
};




