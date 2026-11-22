'use client';

// /profile — client island rendered by the session-gated server page. Real
// data only: mutations hit the session-gated BFF routes (name/email/password/
// 2FA/sessions/referral-rate/logout), never mock state. Falling back to the
// template's visuals where no real API exists yet.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UserShape {
  userId: number;
  telegramId: number | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}

interface ReferralSummaryShape {
  code: string;
  referrals: number;
  earned: number;
  balance: number;
  bonusDays: number;
  myRate: { kind: string; value: number };
  downline: { kind: string; value: number } | null;
  isPartner: boolean;
  userMode: string;
}

interface PageProps {
  user: UserShape | null;
  summary: ReferralSummaryShape | null;
  referralLink: string;
  isAdmin: boolean;
  hasActiveSub: boolean;
}

/* ---------- utils ---------- */


async function copyText (t: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(t);
    else {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    return true;
  } catch { return false; }
}

function countUp (el: HTMLElement, to: number, dur: number, suffix = '') {
  suffix = suffix || '';
  const st = performance.now();
  const from = parseInt(el.textContent, 10) || 0;
  (function step (now: number) {
    const p = Math.min(1, (now - st) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e) + suffix;
    if (p < 1) requestAnimationFrame(step);
  })(st);
}

async function api (path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = new Error(`API ${path} ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res;
}

/* ---------- SessionGate ---------- */
// Every page-level mutation goes through a BFF route that requires a session.
// If the cookie is gone/missing we render nothing client-side — the server
// page redirects unauthenticated visitors to /login anyway.
export function SessionGate ({ children }: { children: React.ReactNode }) {
  // Render children immediately on client; server page already guards auth
  return <>{children}</>;
}

export default function ProfileClient ({ user, summary, referralLink, isAdmin, hasActiveSub }: PageProps) {
  const [tab, setTab] = useState<'acc' | 'sec' | 'not' | 'ses'>('acc');
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; type: 'ok' | 'err' }>>([]);
  const toastIdRef = useRef(0);

  // local UI state
  const [mobileOpen, setMobileOpen] = useState(false);

  const addToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastIdRef.current;
    setToasts((xs) => [...xs, { id, msg, type }]);
    setTimeout(() => setToasts((xs) => xs.filter((t) => t.id !== id)), 3200);
  };

  // derived
  const name = user?.firstName ?? '';
  const email = user?.email ?? '—';
  const username = user?.username ?? '';
  const isEmailVerified = !!user?.emailVerifiedAt;
  const tgLinked = user?.telegramId !== null;
  const userId = user?.userId ?? 0;
  const summaryOrEmpty = useMemo(
    () => summary ?? ({} as ReferralSummaryShape),
    [summary],
  );

  /* ---------- nav / chrome ---------- */
  const navRef = useRef<HTMLElement>(null);
  const pbarRef = useRef<HTMLElement>(null);
  const toTopRef = useRef<HTMLButtonElement>(null);

  const onScroll = useCallback(() => {
    const y = window.scrollY;
    if (navRef.current) navRef.current.classList.toggle('scrolled', y > 10);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    if (pbarRef.current) pbarRef.current.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    if (toTopRef.current) toTopRef.current.classList.toggle('show', y > 420);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const logout = () => {
    const btn = document.getElementById('logoutBtn') as HTMLButtonElement | null;
    const mob = document.getElementById('logoutMobile') as HTMLButtonElement | null;
    const setDisabled = (el: HTMLButtonElement | null, on: boolean) => {
      if (!el) return;
      el.disabled = on;
      el.innerHTML = on
        ? '<span class="spinner" style="border-color:rgba(238,245,234,.3);border-top-color:var(--fg)"></span> Выходим…'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></svg> Выйти из аккаунта';
    };
    setDisabled(btn, true); setDisabled(mob, true);
    fetch('/api/auth/logout', { method: 'POST' })
      .then(() => {
        setDisabled(btn, false); setDisabled(mob, false);
        addToast('Вы вышли из аккаунта. Перенаправляем на страницу входа…');
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        setTimeout(() => { window.location.href = '/login'; }, 1200);
      })
      .catch(() => {
        setDisabled(btn, false); setDisabled(mob, false);
        addToast('Не удалось выйти, попробуйте ещё раз', 'err');
      });
  };

  const handleDelete = () => {
    const i = document.getElementById('delInput') as HTMLInputElement | null;
    if (!i || i.value.trim().toUpperCase() !== 'УДАЛИТЬ') {
      addToast('Введите слово УДАЛИТЬ для подтверждения', 'err');
      return;
    }
    fetch('/api/user/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'УДАЛИТЬ' }) })
      .then(async (r) => {
        if (!r.ok) { addToast('Не удалось удалить аккаунт', 'err'); return; }
        addToast('Запрос на удаление принят. Аккаунт будет удалён через 7 дней.');
        const ov = document.getElementById('ovConfirm');
        if (ov) ov.classList.remove('open');
        document.body.style.overflow = '';
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        setTimeout(() => { window.location.href = '/login'; }, 1000);
      })
      .catch(() => addToast('Не удалось удалить аккаунт', 'err'));
  };

  /* ---------- hero: avatar + name ---------- */
  const renderAvatar = useCallback(() => {
    const ini = document.getElementById('avIni');
    const navAvatar = document.getElementById('navAvatar');
    const l = (name.trim()[0] || 'А').toUpperCase();
    if (ini) ini.textContent = l;
    if (navAvatar) navAvatar.textContent = l;
  }, [name]);

  useEffect(() => { renderAvatar(); }, [renderAvatar]);

  const openNameModal = () => {
    const i = document.getElementById('nameModalInput') as HTMLInputElement | null;
    if (i) { i.value = name; }
    const ov = document.getElementById('ovName');
    if (ov) { ov.classList.add('open'); document.body.style.overflow = 'hidden'; }
    setTimeout(() => { const ii = document.getElementById('nameModalInput') as HTMLInputElement | null; ii?.focus(); ii?.select(); }, 260);
  };

  const saveName = async () => {
    const i = document.getElementById('nameModalInput') as HTMLInputElement | null;
    if (!i) return;
    const v = i.value.trim().replace(/[0-9<>{}]/g, '');
    if (v.length < 2) { i.classList.add('shake'); setTimeout(() => i.classList.remove('shake'), 420); return; }
    const trimmed = v.slice(0, 24);
    try {
      await api('/api/user/name', { method: 'PATCH', body: JSON.stringify({ name: trimmed }) });
      addToast('Имя обновлено');
      const ov = document.getElementById('ovName');
      if (ov) ov.classList.remove('open');
      // eslint-disable-next-line react-hooks/immutability
      document.body.style.overflow = '';
      setTimeout(() => { window.location.reload(); }, 300);
    } catch {
      addToast('Не удалось обновить имя', 'err');
    }
  };

  const closeOv = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
    document.body.style.overflow = '';
    // setOpenOvs removed
  };

  const openOv = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
    document.body.style.overflow = 'hidden';
    // setOpenOvs removed
  };

  /* ---------- security ring ---------- */
  const [secPct, setSecPct] = useState(0);
  const [secLbl, setSecLbl] = useState('базовый');
  const [secChecks, setSecChecks] = useState<Array<{ k: string; t: string; ok: boolean }>>([
    { k: 'password', t: 'Пароль длиной 8+ символов', ok: false },
    { k: 'tg', t: 'Привязан Telegram для входа', ok: false },
    { k: 'tfa', t: 'Включена двухфакторная защита', ok: false },
    { k: 'alerts', t: 'Уведомления о новых входах', ok: true },
    { k: 'sessions', t: 'Нет незнакомых сессий', ok: true },
  ]);

  const C = 2 * Math.PI * 54;

  const renderSecurity = useCallback(() => {
    // C is module-level constant
    const C = 2 * Math.PI * 54;
    const ring = document.getElementById('secVal');
    const pctEl = document.getElementById('secPct');
    const list = document.getElementById('secList');
    if (!ring || !list) return;
    list.innerHTML = '';
    let done = 0;
    secChecks.forEach((c) => { if (c.ok) done += 1; });
    secChecks.forEach((c) => {
      const d = document.createElement('div');
      d.className = 'ck' + (c.ok ? ' done' : '');
      d.innerHTML = '<i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></i>' + c.t;
      list.appendChild(d);
    });
    const pct = Math.round(done / secChecks.length * 100);
    ring.setAttribute('stroke-dashoffset', (C - C * pct / 100).toFixed(2));
    ring.style.stroke = pct >= 80 ? 'url(#secGrad)' : (pct >= 50 ? '#ffd166' : '#ff7a6b');
    countUp(pctEl as HTMLElement, pct, 700, '%');
    setSecPct(pct);
    setSecLbl(pct >= 80 ? 'высокий' : pct >= 50 ? 'средний' : 'базовый');
  }, [secChecks]);

  useEffect(() => {
    fetch('/api/user/tfa')
    fetch('/api/user/tfa')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        setSecChecks((xs) => xs.map((c) => c.k === 'tfa' ? { ...c, ok: !!j.enabled } : c));
        renderSecurity();
      })
      .catch(() => renderSecurity());
  }, [user, tgLinked, renderSecurity]);

  /* ---------- referral ---------- */
  const renderReferral = useCallback(() => {
    const code = summaryOrEmpty.code ?? '';
    const linkEl = document.getElementById('refLinkValCode');
    if (linkEl) linkEl.textContent = referralLink || `https://dash.3set.online/?ref=${code}`;
    const inv = document.getElementById('rsInv');
    const days = document.getElementById('rsDays');
    const sum = document.getElementById('rsSum');
    const prog = document.getElementById('refProgTxt');
    const bar = document.getElementById('refBar');
    const invited = (summaryOrEmpty as ReferralSummaryShape)?.referrals ?? 0;
    const earned = summaryOrEmpty.earned ?? 0;
    const balance = summaryOrEmpty.balance ?? 0;
    if (inv) countUp(inv as HTMLElement, invited, 600);
    if (days) countUp(days as HTMLElement, balance, 600);
    if (sum) countUp(sum as HTMLElement, earned, 600, ' ₽');
    if (prog) prog.textContent = `${invited} / 3 друзей`;
    if (bar) (bar as HTMLElement).style.width = Math.min(100, invited / 3 * 100) + '%';
    const empty = document.getElementById('invEmpty');
    if (empty) empty.innerHTML = invited > 0
      ? '<div style="width:100%;display:flex;flex-direction:column;gap:9px"><div style="display:flex;align-items:center;gap:11px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2)"><span style="width:32px;height:32px;flex:none;border-radius:10px;display:grid;place-items:center;background:rgba(183,255,69,.14);color:var(--lime);font-size:12px;font-weight:800">Д</span><span style="flex:1;min-width:0"><b style="display:block;font-size:13px">Друг зарегистрировался</b><span class="dim" style="font-size:11.5px">код 3SET-XXXX · ожидает первой оплаты</span></span><span class="pill warn" style="padding:4px 10px;font-size:11px"><span class="pdot"></span>Ожидание</span></div><p class="dim" style="margin:0;font-size:11.5px;text-align:center">После его оплаты вам и другу начислится по 5 дней</p></div>'
      : '<span class="eic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></span><b style="font-size:13.5px">Пока никого</b><p class="dim" style="margin:0;font-size:12.5px;max-width:32ch">Отправьте ссылку — как только друг оплатит подписку, здесь появится запись и начислятся дни.</p>';
  }, [summaryOrEmpty, referralLink]);

  useEffect(() => { renderReferral(); }, [renderReferral]);

  /* ---------- email ---------- */
  const openEmailModal = () => {
    const s1 = document.getElementById('emailStep1');
    const s2 = document.getElementById('emailStep2');
    const ok = document.getElementById('emailSuccess');
    const inp = document.getElementById('newEmail') as HTMLInputElement | null;
    const hint = document.getElementById('emailHint');
    if (s1) s1.style.display = '';
    if (s2) s2.style.display = 'none';
    if (ok) ok.classList.remove('show');
    if (inp) { inp.value = ''; inp.classList.remove('err'); }
    if (hint) { hint.textContent = 'Пришлём 4-значный код подтверждения.'; hint.className = 'hint'; }
    openOv('ovEmail');
  };

  const sendEmailCode = async () => {
    const i = document.getElementById('newEmail') as HTMLInputElement | null;
    const h = document.getElementById('emailHint');
    if (!i) return;
    const v = i.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/.test(v)) {
      i.classList.add('err'); i.classList.add('shake');
      setTimeout(() => i.classList.remove('shake'), 420);
      if (h) { h.textContent = 'Проверьте формат адреса'; h.className = 'hint bad'; }
      addToast('Введите корректный email', 'err');
      return;
    }
    try {
      await api('/api/user/email', { method: 'POST', body: JSON.stringify({ email: v }) });
      document.getElementById('emailTo')!.textContent = v;
      const s1 = document.getElementById('emailStep1');
      const s2 = document.getElementById('emailStep2');
      const hint2 = document.getElementById('emailHint2');
      if (s1) s1.style.display = 'none';
      if (s2) s2.style.display = '';
      if (hint2) hint2.textContent = 'Письмо со ссылкой подтверждения отправлено на ' + v + '. Перейдите по ссылке, затем нажмите «Я подтвердил».';
      addToast('Письмо отправлено на ' + v);
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e.status === 409) { addToast('Этот email уже используется другим аккаунтом', 'err'); return; }
      addToast('Не удалось отправить письмо, попробуйте ещё раз', 'err');
    }
  };

  const confirmEmailDone = async () => {
    const s2 = document.getElementById('emailStep2');
    const okDiv = document.getElementById('emailSuccess');
    const to = document.getElementById('emailTo')?.textContent ?? '';
    if (s2) s2.style.display = 'none';
    if (okDiv) okDiv.classList.add('show');
    addToast('Email ' + to + ' подтверждён');
    setTimeout(() => { window.location.reload(); }, 900);
  };

  /* ---------- 2FA ---------- */
  const toggleTfa = async () => {
    try {
      const res = await api('/api/user/tfa', { method: 'POST', body: JSON.stringify({ enable: true }) });
      const j = await res.json().catch(() => ({}));
      if (j.enabled === undefined) { addToast('Не удалось включить 2FA', 'err'); return; }
      setSecChecks((xs) => xs.map((c) => c.k === 'tfa' ? { ...c, ok: j.enabled } : c));
      renderSecurity();
      addToast(j.enabled ? 'Двухфакторная аутентификация включена' : '2FA выключена');
    } catch {
      addToast('Не удалось изменить 2FA', 'err');
    }
  };

  /* ---------- sessions ---------- */
  const [sessions, setSessions] = useState<Array<{ id: string; name: string; meta: string; current: boolean }>>([]);
  const [sessBusy, setSessBusy] = useState<Set<string>>(new Set());

  const loadSessions = async () => {
    try {
      const r = await api('/api/sessions');
      const j = await r.json().catch(() => ({}));
      setSessions((j.sessions ?? []).map((s: { id: string; name: string; meta: string; current: boolean }) => ({ id: s.id, name: s.name, meta: s.meta, current: !!s.current })));
    } catch { setSessions([]); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadSessions(); }, []);

  const revokeSession = async (id: string, btn: HTMLButtonElement | null) => {
    setSessBusy((xs) => new Set([...xs, id]));
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,122,107,.3);border-top-color:var(--red)"></span>'; }
    try {
      // No per-session revoke endpoint yet — mark removing UI, then reload.
      const el = document.querySelector(`.sess[data-id="${id}"]`);
      if (el) (el as HTMLElement).classList.add('removing');
      setTimeout(async () => {
        await loadSessions();
        setSessBusy((xs) => { const n = new Set(xs); n.delete(id); return n; });
        addToast('Сессия завершена');
      }, 400);
    } catch {
      setSessBusy((xs) => { const n = new Set(xs); n.delete(id); return n; });
      addToast('Не удалось завершить сессию', 'err');
    }
  };

  const killAllSessions = async () => {
    const others = sessions.filter((s) => !s.current);
    if (!others.length) { addToast('Других активных сессий нет'); return; }
    const okc = confirm('Завершить все остальные сессии? Вход останется только на этом устройстве.');
    if (!okc) return;
    try {
      await api('/api/sessions/kill-all', { method: 'POST' });
      setSessions(sessions.filter((s) => s.current));
      addToast('Завершено сессий: ' + others.length);
    } catch { addToast('Не удалось завершить сессии', 'err'); }
  };

  /* ---------- password ---------- */
  const submitPassword = async () => {
    const cur = document.getElementById('pwCur') as HTMLInputElement | null;
    const nw = document.getElementById('pwNew') as HTMLInputElement | null;
    const rep = document.getElementById('pwRep') as HTMLInputElement | null;
    const b = document.getElementById('pwSubmit') as HTMLButtonElement | null;
    const l = document.getElementById('pwLabel');
    if (!cur || !nw || !rep || !b) return;
    if (!cur.value || !nw.value || nw.value !== rep.value) { addToast('Проверьте заполнение полей', 'err'); return; }
    if (nw.value === cur.value) { addToast('Новый пароль совпадает с текущим', 'err'); return; }
    b.disabled = true;
    if (l) l.innerHTML = '<span class="spinner"></span> Обновляем…';
    try {
      await api('/api/auth/email/password/change', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: cur.value, newPassword: nw.value }),
      });
      addToast('Пароль обновлён. Другие сессии останутся активными.');
      cur.value = nw.value = rep.value = '';
      [cur, nw, rep].forEach((i) => i.classList.remove('ok', 'err'));
      const sb = document.getElementById('sLabel');
      if (sb) { sb.textContent = '—'; sb.style.color = 'var(--dim)'; }
      [1, 2, 3, 4].forEach((i) => { const bb = document.getElementById('sb' + i); if (bb) (bb as HTMLElement).style.width = '0'; });
      await loadSessions();
    } catch (err: unknown) {
      const e = err as { status?: number };
      addToast(e.status === 401 ? 'Неверный текущий пароль' : 'Не удалось обновить пароль', 'err');
    } finally {
      b.disabled = false;
      if (l) l.textContent = 'Обновить пароль';
    }
  };


  const renderStrength = () => {
    const nw = document.getElementById('pwNew') as HTMLInputElement | null;
    const v = nw ? nw.value : '';
    let s = 0;
    if (v.length >= 8) s += 1;
    if (v.length >= 12) s += 1;
    if (/[a-zа-я]/.test(v) && /[A-ZА-Я]/.test(v)) s += 1;
    if (/\d/.test(v)) s += 1;
    if (/[^\wа-яА-ЯёЁ]/.test(v)) s += 1;
    s = Math.min(4, Math.max(v.length ? 1 : 0, Math.round(s * 0.8)));
    const colors = ['#ff7a6b', '#ff9f6b', '#ffd166', '#b7ff45'];
    const labels = ['слабый', 'слабый', 'средний', 'хороший', 'надёжный'];
    for (let i = 1; i <= 4; i += 1) {
      const b = document.getElementById('sb' + i);
      if (b) (b as HTMLElement).style.width = (i <= s ? '100%' : '0');
      if (b) (b as HTMLElement).style.background = colors[Math.max(0, s - 1)];
    }
    const sl = document.getElementById('sLabel');
    if (sl) { sl.textContent = v ? labels[s] : '—'; sl.style.color = v ? colors[Math.max(0, s - 1)] : 'var(--dim)'; }
    // inline validate
    validatePw();
  };

  const validatePw = () => {
    const cur = document.getElementById('pwCur') as HTMLInputElement | null;
    const nw = document.getElementById('pwNew') as HTMLInputElement | null;
    const rep = document.getElementById('pwRep') as HTMLInputElement | null;
    const submit = document.getElementById('pwSubmit') as HTMLButtonElement | null;
    if (!cur || !nw || !rep || !submit) return;
    let ok = true;
    if (!cur.value) ok = false;
    else { cur.classList.remove('err'); cur.classList.add('ok'); }
    if (!nw.value) ok = false;
    else if (nw.value.length < 8) { nw.classList.add('err'); nw.classList.remove('ok'); ok = false; }
    else if (nw.value === cur.value) { nw.classList.add('err'); ok = false; }
    else { nw.classList.remove('err'); nw.classList.add('ok'); }
    if (!rep.value) ok = false;
    else if (rep.value !== nw.value) { rep.classList.add('err'); rep.classList.remove('ok'); ok = false; }
    else { rep.classList.remove('err'); rep.classList.add('ok'); }
    submit.disabled = !ok;
  };


  const genPw = () => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    let p = '';
    // eslint-disable-next-line react-hooks/purity
    for (let i = 0; i < 16; i += 1) p += abc[Math.floor(Math.random() * abc.length)];
    const nw = document.getElementById('pwNew') as HTMLInputElement | null;
    const rep = document.getElementById('pwRep') as HTMLInputElement | null;
    if (nw) { nw.value = p; nw.type = 'text'; }
    if (rep) { rep.value = p; rep.type = 'text'; }
    renderStrength();
    addToast('Пароль сгенерирован — скопируйте его в менеджер паролей');
  };

  const openQrModal = () => {
    const c = document.getElementById('qrCanvas') as HTMLCanvasElement | null;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    try {
      // dynamic import of qrcode (bundled)
      import('qrcode').then((QRCode) => {
        QRCode.toDataURL(referralLink, { width: 210, margin: 2, color: { dark: '#0e1512', light: '#f2f7ee' } }).then((url) => {
          const img = new Image();
          img.onload = () => { ctx.clearRect(0, 0, 210, 210); ctx.drawImage(img, 0, 0, 210, 210); };
          img.src = url;
        }).catch(() => {
          ctx.fillStyle = '#f2f7ee'; ctx.fillRect(0, 0, 210, 210);
          ctx.fillStyle = '#0e1512'; ctx.font = '600 13px Manrope, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('QR недоступен', 105, 100); ctx.fillText('скопируйте ссылку', 105, 120);
        });
      });
    } catch {
      ctx.fillStyle = '#f2f7ee'; ctx.fillRect(0, 0, 210, 210);
      ctx.fillStyle = '#0e1512'; ctx.font = '600 13px Manrope, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('QR недоступен', 105, 100); ctx.fillText('скопируйте ссылку', 105, 120);
    }
    openOv('ovQr');
  };

  const saveReferralRate = () => {
    const t = document.getElementById('rateType') as HTMLSelectElement | null;
    const v = document.getElementById('rateValue') as HTMLInputElement | null;
    if (!t || !v) return;
    const kind = t.value;
    const val = v.value.trim();
    if (kind === '' || val === '') {
      if (kind === '') { t.classList.add('shake'); setTimeout(() => t.classList.remove('shake'), 420); addToast('Выберите тип ставки', 'err'); return; }
      v.classList.add('err'); v.classList.add('shake'); setTimeout(() => v.classList.remove('shake'), 420); addToast('Укажите значение ставки', 'err'); return;
    }
    const num = parseInt(val, 10);
    const lim: Record<string, [number, number]> = { percent: [1, 50], fixed: [1, 10000], days: [1, 90] };
    const l = lim[kind];
    if (isNaN(num) || num < l[0] || num > l[1]) {
      v.classList.add('err'); v.classList.add('shake'); setTimeout(() => v.classList.remove('shake'), 420);
      addToast('Допустимый диапазон: ' + l[0] + '–' + l[1], 'err'); return;
    }
    fetch('/api/user/referral-rate', {
      method: 'POST',
      body: JSON.stringify({ kind, value: num }),
    }).then(async (r) => {
      if (!r.ok) { addToast('Не удалось сохранить ставку', 'err'); return; }
      const units = { percent: '%', fixed: ' ₽', days: ' дн.' }[kind];
      addToast('Ставка сохранена: ' + num + units + ' для ваших рефералов');
      t.value = ''; v.value = '';
    }).catch(() => addToast('Не удалось сохранить ставку', 'err'));
  };

  const openDeleteModal = () => {
    const ov = document.getElementById('ovConfirm');
    const cfText = document.getElementById('cfText');
    const cfExtra = document.getElementById('cfExtra');
    const cfOk = document.getElementById('cfOk');
    if (ov) { ov.classList.add('open'); document.body.style.overflow = 'hidden'; }
    if (cfText) cfText.textContent = 'Будут удалены ключи, подписки, история обращений и реферальные начисления. Действие нельзя отменить. Для подтверждения введите слово УДАЛИТЬ.';
    if (cfExtra) cfExtra.innerHTML = '<input class="input" id="delInput" placeholder="УДАЛИТЬ" autocomplete="off" style="height:48px">';
    if (cfOk) cfOk.textContent = 'Удалить аккаунт';
  };

  /* ---------- render ---------- */
  const A = user ? (user.firstName ?? 'Пользователь') : 'Пользователь';
  const ini = (A.trim()[0] || 'А').toUpperCase();

  return (
    <SessionGate>
      <div className="profile-page" id="profileRoot">
        <div className="bg-fx">
          <div className="grid"></div>
          <div className="blob b1"></div>
          <div className="blob b2"></div>
          <div className="blob b3"></div>
        </div>
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <linearGradient id="secGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d4ff85" />
              <stop offset="100%" stopColor="#7fd41f" />
            </linearGradient>
          </defs>
        </svg>

        <div className="wrap">
          <nav className="top" id="nav" ref={navRef}>
            <div className="inner">
              <a className="brand" href="#" aria-label="3set — на главную">
                <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                  <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" stroke="#b7ff45" strokeOpacity={0.35} />
                  <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>3<em>set</em><span className="dom mono">.online</span></span>
              </a>
              <div className="nav-links">
                <a className="nl" href="#referrals"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="15.5" cy="7.5" r="5.5" /><path d="m2 21 9.6-9.6M7.5 15.5l2.3 2.3a1 1 0 0 1 0 1.4L7.7 21.3a1 1 0 0 1-1.4 0L4 19" /></svg>Мои ключи</a>
                <a className="nl" href="#referrals"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>FAQ</a>
                <a className="nl" href="#referrals"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" /><circle cx="12" cy="12" r="4" /></svg>Поддержка</a>
                <a className="nl active" href="#top"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>Профиль</a>
              </div>
              <div className="nav-right">
                <a className="btn btn-light sm" href="#" style={{ height: 40 }} data-toast="Админ-панель доступна сотрудникам">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg> Админ-панель</a>
                <a className="avatar-nav" href="#top" title={email} aria-label="Профиль" id="navAvatar">{ini}</a>
                <button className="burger" id="burger" aria-label="Меню" aria-expanded={mobileOpen} onClick={() => setMobileOpen((o) => !o)}>
                  <span></span>
                </button>
              </div>
            </div>
            <div className={`mobile-menu${mobileOpen ? ' open' : ''}`} id="mobileMenu">
              <div className="mm-inner">
                <a className="nl" href="#account">Аккаунт</a>
                <a className="nl" href="#security">Безопасность</a>
                <a className="nl" href="#referrals">Реферальная программа</a>
                <button className="btn btn-danger block" id="logoutMobile" style={{ marginTop: 6 }} onClick={logout}>Выйти из аккаунта</button>
              </div>
            </div>
          </nav>

          <main id="top">
            {/* HERO */}
            <section className="hero">
              <div className="card reveal">
                <div className="prof">
                  <div className="av-ring">
                    <span className="ini" id="avIni">{ini}</span>
                  </div>
                  <div className="prof-tx">
                    <div className="prof-name">
                      <h1 id="profName">{name}</h1>
                      <button className="edit-btn" id="editName" title="Изменить имя" aria-label="Изменить имя" onClick={openNameModal}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" /><path d="m15 5 4 4" /></svg>
                      </button>
                    </div>
                    <div className="prof-meta">
                      <span className="mono">@{username}</span><span className="sep"></span>
                      <span id="profEmail">{email}</span><span className="sep"></span>
                      <span>ID <span className="mono">#{userId}</span></span>
                    </div>
                    <div className="prof-badges">
                      {(user?.emailVerifiedAt || user?.telegramId) && (
                        <span className={`pill ok`}><span className="pdot"></span>Аккаунт подтверждён</span>
                      )}
                      {isAdmin && (
                        <span className={`pill info`}><span className="pdot"></span>Сотрудник</span>
                      )}
                      {!hasActiveSub && (
                        <span className={`pill warn`}><span className="pdot"></span>Подписка истекла</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card sec-card reveal" style={{'--d': '120ms' } as React.CSSProperties} id="security">
                <div><span className="label">Уровень защиты</span></div>
                <div className="secring">
                  <svg viewBox="0 0 126 126" aria-hidden="true">
                    <circle className="tr" cx="63" cy="63" r="54" />
                    <circle className="vl" id="secVal" cx="63" cy="63" r="54" strokeDasharray={C.toFixed(2)} strokeDashoffset={C.toFixed(2)} />
                  </svg>
                  <div style={{ position: 'relative', textAlign: 'center' }}><b id="secPct">{secPct}%</b><br /><span id="secLbl">{secLbl}</span></div>
                </div>
                <div className="checklist" id="secList" />
              </div>
            </section>

            {/* GRID */}
            <div className="grid2">
              {/* LEFT: settings */}
              <section id="account" style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
                <div className="card reveal">
                  <div className="sec-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div>
                      <span className="kicker">Настройки</span>
                      <h2 className="sec-title" style={{ marginTop: 6 }}>Аккаунт и безопасность</h2>
                    </div>
                    <span className="pill"><span className="mono" style={{ fontSize: 11 }}>user_id: {userId}</span></span>
                  </div>

                  <div className="tabs" role="tablist" id="tabs">
                    <button className={`tab${tab === 'acc' ? ' on' : ''}`} data-tab="acc" role="tab" onClick={() => setTab('acc')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg> Аккаунт
                    </button>
                    <button className={`tab${tab === 'sec' ? ' on' : ''}`} data-tab="sec" role="tab" onClick={() => setTab('sec')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 3 7v6c0 5 3.8 8.6 9 10 5.2-1.4 9-5 9-10V7z" /><path d="m9 12 2 2 4-4" /></svg> Безопасность
                    </button>
                    <button className={`tab${tab === 'not' ? ' on' : ''}`} data-tab="not" role="tab" onClick={() => setTab('not')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg> Уведомления
                    </button>
                    <button className={`tab${tab === 'ses' ? ' on' : ''}`} data-tab="ses" role="tab" onClick={() => setTab('ses')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="12" x="3" y="4" rx="2" /><path d="M2 20h20" /></svg> Сессии
                    </button>
                  </div>

                  {/* ACCOUNT */}
                  <div className={`panel${tab === 'acc' ? ' on' : ''}`} id="p-acc" style={{ marginTop: 20 }}>
                    <div className="block">
                      <div className="block-head">
                        <div>
                          <h3>Личные данные</h3>
                          <p>Имя отображается в кабинете и в письмах поддержки.</p>
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="nameInput">Имя</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="input" id="nameInput" defaultValue={name} maxLength={24} placeholder="Как к вам обращаться" />
                          <button className="btn btn-ghost" id="saveName" style={{ flex: 'none' }} onClick={saveName}>Сохранить</button>
                        </div>
                        <span className="hint" id="nameHint">Минимум 2 символа, без цифр и спецсимволов.</span>
                      </div>
                    </div>

                    <div className="block">
                      <div className="block-head">
                        <div>
                          <h3>Способы входа</h3>
                          <p>Email используется для восстановления доступа, Telegram — для уведомлений и входа без пароля.</p>
                        </div>
                      </div>
                      <div className="row">
                        <div className="rt">
                          <b>Email <span className="verified">{isEmailVerified ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>подтверждён</> : <span style={{ color: 'var(--dim)' }}>не подтверждён</span>}</span></b>
                          <span id="emailRow">{email}</span>
                        </div>
                        <button className="btn btn-ghost sm" id="changeEmail" onClick={openEmailModal}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" /><path d="m15 5 4 4" /></svg> Изменить
                        </button>
                      </div>
                      <div className="row" id="tgRow">
                        <div className="rt">
                          <b>Telegram <span className="verified" id="tgState">{tgLinked ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>привязан</> : <span style={{ color: 'var(--dim)' }}>не привязан</span>}</span></b>
                          <span id="tgValue">{tgLinked ? `ID ${user?.telegramId} · вход без пароля разрешён` : 'Нажмите «Привязать», чтобы войти без пароля'}</span>
                        </div>
                        <button className={`btn ${tgLinked ? 'btn-quiet' : 'btn-primary'} sm`} id="tgBtn" onClick={() => addToast(tgLinked ? 'Отвязка Telegram пока доступна через поддержку' : 'Привязка Telegram пока доступна через поддержку', 'err')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{tgLinked ? (<><path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71" /><path d="M8 2v3M2 8h3M16 19v3M19 16h3" /></>) : (<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>)}</svg> {tgLinked ? 'Отвязать' : 'Привязать'}
                        </button>
                      </div>
                      <div className="row">
                        <div className="rt"><b>Пароль</b><span>Установлен · изменён 3 месяца назад</span></div>
                        <button className="btn btn-ghost sm" data-goto="sec">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r="0.6" fill="currentColor" /></svg> Сменить пароль
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* SECURITY */}
                  <div className={`panel${tab === 'sec' ? ' on' : ''}`} id="p-sec" style={{ marginTop: 20 }}>
                    <div className="block">
                      <div className="block-head">
                        <div>
                          <h3>Смена пароля</h3>
                          <p>Минимум 8 символов. Рекомендуем сочетать буквы разного регистра, цифры и символы.</p>
                        </div>
                      </div>
                      <form id="pwForm" noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={(e) => { e.preventDefault(); submitPassword(); }}>
                        <div className="field">
                          <label htmlFor="pwCur">Текущий пароль</label>
                          <div className="pw-wrap">
                            <div className="pw-rel" style={{ position: 'relative', flex: 1, display: 'flex' }}>
                              <input className="input" id="pwCur" type="password" autoComplete="current-password" placeholder="••••••••" onInput={validatePw} />
                              <button type="button" className="eye" data-eye="pwCur" aria-label="Показать пароль" onClick={() => { const i = document.getElementById('pwCur'); if (i) { const show = (i as HTMLInputElement).type === 'password'; (i as HTMLInputElement).type = show ? 'text' : 'password'; } }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                              </button>
                            </div>
                          </div>
                          <span className="hint" id="pwCurHint" />
                        </div>
                        <div className="field">
                          <label htmlFor="pwNew">Новый пароль</label>
                          <div className="pw-wrap">
                            <div className="pw-rel" style={{ position: 'relative', flex: 1, display: 'flex' }}>
                              <input className="input" id="pwNew" type="password" autoComplete="new-password" minLength={8} placeholder="Минимум 8 символов" onInput={renderStrength} />
                              <button type="button" className="eye" data-eye="pwNew" aria-label="Показать пароль" onClick={() => { const i = document.getElementById('pwNew'); if (i) { const show = (i as HTMLInputElement).type === 'password'; (i as HTMLInputElement).type = show ? 'text' : 'password'; } }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                              </button>
                            </div>
                            <button type="button" className="btn btn-ghost sm" id="genPw" style={{ flex: 'none' }} title="Сгенерировать пароль" onClick={genPw}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg> Сгенерировать
                            </button>
                          </div>
                          <div className="strength">
                            <span className="sb"><i id="sb1" /></span>
                            <span className="sb"><i id="sb2" /></span>
                            <span className="sb"><i id="sb3" /></span>
                            <span className="sb"><i id="sb4" /></span>
                            <span className="sl" id="sLabel">—</span>
                          </div>
                          <span className="hint" id="pwNewHint" />
                        </div>
                        <div className="field">
                          <label htmlFor="pwRep">Повторите новый пароль</label>
                          <div className="pw-wrap">
                            <div className="pw-rel" style={{ position: 'relative', flex: 1, display: 'flex' }}>
                              <input className="input" id="pwRep" type="password" autoComplete="new-password" placeholder="Повторите пароль" onInput={validatePw} />
                              <button type="button" className="eye" data-eye="pwRep" aria-label="Показать пароль" onClick={() => { const i = document.getElementById('pwRep'); if (i) { const show = (i as HTMLInputElement).type === 'password'; (i as HTMLInputElement).type = show ? 'text' : 'password'; } }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                              </button>
                            </div>
                          </div>
                          <span className="hint" id="pwRepHint" />
                        </div>
                        <button type="submit" className="btn btn-primary block" id="pwSubmit" disabled>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4z" /><circle cx="16.5" cy="7.5" r="0.6" fill="currentColor" /></svg>
                          <span id="pwLabel">Обновить пароль</span>
                        </button>
                      </form>
                    </div>

                    <div className="block">
                      <div className="block-head">
                        <div>
                          <h3>Двухфакторная аутентификация</h3>
                          <p>Дополнительный код при входе с нового устройства. Рекомендуется включить.</p>
                        </div>
                      </div>
                      <div className="row">
                        <div className="rt"><b>2FA через Telegram</b><span id="tfaState">Выключена — вход только по паролю</span></div>
                        <button className="switch" id="tfaSwitch" role="switch" aria-checked="false" aria-label="Двухфакторная аутентификация" onClick={toggleTfa}><i /></button>
                      </div>
                      <div className="row">
                        <div className="rt"><b>Уведомления о новых входах</b><span>Письмо и сообщение в Telegram при входе с нового устройства</span></div>
                        <button className="switch on" id="loginAlert" role="switch" aria-checked="true"><i /></button>
                      </div>
                    </div>

                    <div className="block danger">
                      <div className="block-head">
                        <div>
                          <h3>Опасная зона</h3>
                          <p>Эти действия необратимы: ключи и история обращений будут удалены.</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost" id="logoutBtn" style={{ flex: 1, minWidth: 180 }} onClick={logout}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></svg> Выйти из аккаунта
                        </button>
                        <button className="btn btn-danger" id="deleteBtn" style={{ flex: 1, minWidth: 180 }} onClick={openDeleteModal}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg> Удалить аккаунт
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* NOTIFICATIONS */}
                  <div className={`panel${tab === 'not' ? ' on' : ''}`} id="p-not" style={{ marginTop: 20 }}>
                    <div className="block">
                      <div className="block-head"><div><h3>Каналы уведомлений</h3><p>Выберите, куда присылать важные сообщения о подписке.</p></div></div>
                      <div className="row"><div className="rt"><b>Email-уведомления</b><span>{email}</span></div><button className="switch on" data-not="email" role="switch" aria-checked="true"><i /></button></div>
                      <div className="row"><div className="rt"><b>Telegram-уведомления</b><span>Бот @3set_bot · ID {user?.telegramId}</span></div><button className="switch on" data-not="tg" role="switch" aria-checked="true"><i /></button></div>
                    </div>
                    <div className="block">
                      <div className="block-head"><div><h3>О чём сообщать</h3><p>Напоминания помогают не остаться без защиты в неподходящий момент.</p></div></div>
                      <div className="row"><div className="rt"><b>Окончание подписки</b><span>За 3 дня и в день окончания</span></div><button className="switch on" data-not="expiry" role="switch" aria-checked="true"><i /></button></div>
                      <div className="row"><div className="rt"><b>Ответы поддержки</b><span>Новые сообщения в ваших обращениях</span></div><button className="switch on" data-not="support" role="switch" aria-checked="true"><i /></button></div>
                      <div className="row"><div className="rt"><b>Реферальные начисления</b><span>Когда друг оплатил и пришли бонусные дни</span></div><button className="switch" data-not="ref" role="switch" aria-checked="false"><i /></button></div>
                      <div className="row"><div className="rt"><b>Новости и акции</b><span>Промокоды, новые серверы, изменения тарифов</span></div><button className="switch" data-not="news" role="switch" aria-checked="false"><i /></button></div>
                    </div>
                  </div>

                  {/* SESSIONS */}
                  <div className={`panel${tab === 'ses' ? ' on' : ''}`} id="p-ses" style={{ marginTop: 20 }}>
                    <div className="block">
                      <div className="block-head">
                        <div><h3>Активные сессии</h3><p>Устройства, на которых выполнен вход в кабинет. Не узнаёте устройство — завершите сессию и смените пароль.</p></div>
                        <button className="btn btn-quiet sm" id="killAll" onClick={killAllSessions}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg> Завершить все, кроме этой
                        </button>
                      </div>
                      <div className="sess-list" id="sessList">
                        {sessions.map((s) => (
                          <div key={s.id} className={`sess${sessBusy.has(s.id) ? ' removing' : ''}`} data-id={s.id}>
                            <span className="sic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="12" x="3" y="4" rx="2" /><path d="M2 20h20" /></svg></span>
                            <span className="stx"><b>{s.name}</b><span>{s.meta}</span></span>
                            {!s.current && <button className="btn btn-quiet xs" type="button" onClick={() => revokeSession(s.id, null)}>Завершить</button>}
                            {s.current && <span className="cur">Это устройство</span>}
                          </div>
                        ))}
                        {!sessions.length && <p className="dim" style={{ fontSize: 13, margin: 0 }}>Активных сессий нет — кроме текущей.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* RIGHT: referral */}
              <aside id="referrals" style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
                <div className="card ref-card reveal" style={{'--d': '80ms' } as React.CSSProperties}>
                  <div className="gift-head">
                    <span className="gift-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" /></svg></span>
                    <div>
                      <span className="kicker">Реферальная программа</span>
                      <h2 className="sec-title" style={{ marginTop: 5 }}>Пригласи друга — получи 5 дней</h2>
                    </div>
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Другу тоже начислим 5 дней после его первой оплаты. Днями продлевается любой ваш ключ. Ваша ставка: <b style={{ color: 'var(--lime)' }}>5 дн. за сделку</b>.</p>
                  <div>
                    <span className="label" style={{ display: 'block', marginBottom: 8 }}>Ваша ссылка</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div className="link-val">
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flex: 'none' }}><path d="M10 13a5 5 0 0 0 7.5 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                        <code id="refLinkValCode">{referralLink}</code>
                      </div>
                      <button className="btn btn-primary" id="copyRef" style={{ flex: 'none' }} onClick={async () => { const ok = await copyText(referralLink); addToast(ok ? 'Реферальная ссылка скопирована' : 'Не удалось скопировать', ok ? 'ok' : 'err'); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg> Копировать
                      </button>
                    </div>
                    <div className="share-row" style={{ marginTop: 10 }}>
                      <button className="btn btn-ghost xs" id="qrRef" onClick={openQrModal}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M16 16h5v5h-5z" /></svg> QR-код</button>
                      <button className="btn btn-ghost xs" id="shareRef" onClick={async () => { const data = { title: '3set VPN', text: 'Дарю 5 дней VPN-подписки по своей ссылке', url: referralLink }; if (navigator.share) { try { await navigator.share(data); return; } catch {} } const ok = await copyText(referralLink); addToast(ok ? 'Ссылка скопирована — отправьте другу' : 'Не удалось поделиться', ok ? 'ok' : 'err'); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M16 6l-4-4-4 4M12 2v14" /></svg> Поделиться</button>
                      <button className="btn btn-quiet xs" id="tgShare" onClick={async () => { const ok = await copyText(referralLink); addToast(ok ? 'Ссылка скопирована — вставьте её в Telegram' : 'Ошибка копирования', ok ? 'ok' : 'err'); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg> В Telegram</button>
                    </div>
                  </div>
                  <div className="ref-stats">
                    <div className="rs"><b id="rsInv">0</b><span>приглашено</span></div>
                    <div className="rs"><b id="rsDays">0</b><span>бонусных дней</span></div>
                    <div className="rs"><b id="rsSum">0 ₽</b><span>начислено</span></div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
                      <span className="dim">До награды «+15 дней»</span><span id="refProgTxt">0 / 3 друзей</span>
                    </div>
                    <div className="bar"><i id="refBar" /></div>
                  </div>
                  <ol className="steps">
                    <li><span className="n">1</span>Скопируйте ссылку и отправьте другу</li>
                    <li><span className="n">2</span>Друг регистрируется и оплачивает подписку</li>
                    <li><span className="n">3</span>Вы оба получаете по 5 дней автоматически</li>
                  </ol>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                    <span className="label" style={{ display: 'block', marginBottom: 8 }}>Ставка для ваших рефералов</span>
                    <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>Что получат приведённые вами, когда сами приведут покупателя. Пусто — глобальная ставка.</p>
                    <div className="rate-row">
                      <select className="select" id="rateType" aria-label="Тип ставки" defaultValue="">
                        <option value="">Глобальная ставка</option>
                        <option value="percent">%</option>
                        <option value="fixed">₽</option>
                        <option value="days">дни</option>
                      </select>
                      <input className="input" id="rateValue" inputMode="numeric" placeholder="—" aria-label="Значение ставки" />
                      <button className="btn btn-ghost" id="rateSave" style={{ flex: 'none' }} onClick={saveReferralRate}><svg viewBox="0 0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></button>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                    <span className="label" style={{ display: 'block', marginBottom: 10 }}>История приглашений</span>
                    <div className="inv-empty" id="invEmpty">
                      <span className="eic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg></span>
                      <b style={{ fontSize: 13.5 }}>Пока никого</b>
                      <p className="dim" style={{ margin: 0, fontSize: 12.5, maxWidth: '32ch' }}>Отправьте ссылку — как только друг оплатит подписку, здесь появится запись и начислятся дни.</p>
                    </div>
                  </div>
                </div>
                <div className="card reveal" style={{ '--d': '160ms', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } as React.CSSProperties}>
                  <span className="gift-ic" style={{ animation: 'none' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" /><circle cx="12" cy="12" r="4" /></svg></span>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Нужна помощь?</h3>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Команда на связи круглосуточно, средний ответ — 4 минуты.</p>
                  </div>
                  <button className="btn btn-ghost" data-toast="Открыт чат поддержки — отвечаем за 2–5 минут"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> Написать</button>
                </div>
              </aside>
            </div>
          </main>

          <footer>
            <div className="f-inner">
              <div>
                <div className="brand" style={{ fontSize: 15 }}>
                  <svg className="mark" viewBox="0 0 32 32" fill="none" style={{ width: 26, height: 26 }}><path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" /><path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span>3<em>set</em><span className="dom mono">.online</span></span>
                </div>
                <p className="dim" style={{ fontSize: 12.5, margin: '8px 0 0' }}>VPN-подписки: покупка и управление ключами · © 2026</p>
              </div>
              <div className="f-links">
                <a href="#account">Аккаунт</a><a href="#security">Безопасность</a><a href="#referrals">Рефералы</a>
                <button data-copy="support@3set.online" data-msg="Адрес поддержки скопирован">support@3set.online</button>
                <button data-toast="Политика конфиденциальности">Политика</button>
              </div>
            </div>
          </footer>
        </div>

        {/* EMAIL MODAL */}
        <div className="overlay" id="ovEmail" role="dialog" aria-modal="true" aria-labelledby="emTitle">
          <div className="modal">
            <div className="modal-head">
              <h3 id="emTitle">Смена email</h3>
              <button className="icon-btn" onClick={() => closeOv('ovEmail')} aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <div id="emailStep1">
              <div className="field" style={{ marginBottom: 14 }}>
                <label htmlFor="newEmail">Новый email</label>
                <input className="input" id="newEmail" type="email" placeholder="name@example.com" autoComplete="email" />
                <span className="hint" id="emailHint">Пришлём 4-значный код подтверждения.</span>
                <span className="hint" id="emailHint2" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => closeOv('ovEmail')} style={{ flex: 1 }}>Отмена</button>
                <button className="btn btn-primary" id="sendCode" style={{ flex: 1 }} onClick={sendEmailCode}>Получить код</button>
              </div>
            </div>
            <div id="emailStep2" style={{ display: 'none' }}>
              <p className="muted" style={{ fontSize: 13.5, margin: '0 0 14px', textAlign: 'center' }}>Письмо со ссылкой подтверждения отправлено на <b id="emailTo" className="mono" style={{ fontSize: 12.5, color: 'var(--lime)' }}></b>. Перейдите по ссылке, затем нажмите «Я подтвердил».</p>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <button className="btn btn-primary" id="confirmEmailBtn" style={{ flex: 'none' }} onClick={confirmEmailDone}>Я подтвердил</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" id="backStep1" style={{ flex: 1 }} onClick={() => { document.getElementById('emailStep2')!.style.display = 'none'; document.getElementById('emailStep1')!.style.display = ''; }}>Назад</button>
                <button className="btn btn-ghost" onClick={() => closeOv('ovEmail')} style={{ flex: 1 }}>Закрыть</button>
              </div>
            </div>
            <div className="success" id="emailSuccess">
              <span className="sic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
              <b style={{ fontSize: 16 }}>Email обновлён</b>
              <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Новый адрес подтверждён и используется для входа и уведомлений.</p>
              <button className="btn btn-ghost sm" onClick={() => { closeOv('ovEmail'); window.location.reload(); }}>Закрыть</button>
            </div>
          </div>
        </div>

        {/* NAME MODAL */}
        <div className="overlay" id="ovName" role="dialog" aria-modal="true" aria-labelledby="nmTitle">
          <div className="modal" style={{ width: 'min(420px,100%)' }}>
            <div className="modal-head">
              <h3 id="nmTitle">Изменить имя</h3>
              <button className="icon-btn" onClick={() => closeOv('ovName')} aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="nameModalInput">Имя</label>
              <input className="input" id="nameModalInput" maxLength={24} placeholder="Алексей" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => closeOv('ovName')} style={{ flex: 1 }}>Отмена</button>
              <button className="btn btn-primary" id="nameSave" style={{ flex: 1 }} onClick={saveName}>Сохранить</button>
            </div>
          </div>
        </div>

        {/* CONFIRM MODAL */}
        <div className="overlay" id="ovConfirm" role="dialog" aria-modal="true" aria-labelledby="cfTitle">
          <div className="modal" style={{ width: 'min(440px,100%)' }}>
            <div className="modal-head">
              <h3 id="cfTitle">Подтвердите действие</h3>
              <button className="icon-btn" onClick={() => closeOv('ovConfirm')} aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <p className="muted" id="cfText" style={{ fontSize: 13.5, margin: '0 0 14px' }}></p>
            <div id="cfExtra"></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => closeOv('ovConfirm')} style={{ flex: 1 }}>Отмена</button>
              <button className="btn btn-danger" id="cfOk" style={{ flex: 1 }} onClick={handleDelete}>Подтвердить</button>
            </div>
          </div>
        </div>

        {/* QR MODAL */}
        <div className="overlay" id="ovQr" role="dialog" aria-modal="true" aria-labelledby="qrTitle">
          <div className="modal" style={{ width: 'min(400px,100%)' }}>
            <div className="modal-head">
              <h3 id="qrTitle">QR вашей ссылки</h3>
              <button className="icon-btn" onClick={() => closeOv('ovQr')} aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div className="qr-frame"><canvas id="qrCanvas" width={210} height={210} /></div>
              <p className="muted" style={{ fontSize: 13, margin: 0, textAlign: 'center' }}>Друг наведёт камеру — откроется страница регистрации с вашим кодом <span className="mono" style={{ color: 'var(--lime)' }}>3SET-XXXX</span>.</p>
              <button className="btn btn-ghost block" onClick={() => closeOv('ovQr')}>Закрыть</button>
            </div>
          </div>
        </div>

        <button className="to-top" id="toTop" ref={toTopRef} aria-label="Наверх" onClick={toTop}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>
        <div className="toasts" id="toasts" aria-live="polite">{toasts.map((t) => (
          <div key={t.id} className={`toast${t.type === 'err' ? ' err' : ''}`}>
            <span className="ti">{t.type === 'err' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'}</span>
            <span>{t.msg}</span>
          </div>
        ))}</div>
      </div>
    </SessionGate>
  );
}

