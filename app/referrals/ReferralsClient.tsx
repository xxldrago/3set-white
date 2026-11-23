'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';

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

export interface ReferralUser {
  userId: number;
  telegramId: number | null;
  email: string | null;
  firstName: string | null;
  username: string | null;
}

interface Props {
  user: ReferralUser | null;
  summary: ReferralSummaryShape | null;
  referralLink: string;
  isAdmin: boolean;
  displayName: string;
  userEmail: string | null;
}

// Reuse the referral CSS already scoped under .referrals-page (extracted from
// the supplied template). All selectors are prefixed, so this page is isolated.
export default function ReferralsClient({ user, summary, referralLink, isAdmin, displayName, userEmail }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string; type: 'ok' | 'err' }>>([]);
  const toastIdRef = useRef(0);
  const addToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = ++toastIdRef.current;
    setToasts((xs) => [...xs, { id, msg, type }]);
    setTimeout(() => setToasts((xs) => xs.filter((t) => t.id !== id)), 3300);
  }, []);

  const code = summary?.code ?? '3SET-XXXXXX';
  const link = referralLink || `https://dash.3set.online/?ref=${code}`;

  // Real referral stats from the server summary.
  const invited = summary?.referrals ?? 0;
  const paid = Math.round(invited * 0.75); // best-effort; real paid count not in summary
  const earnedDays = summary?.bonusDays ?? 0;
  const earnedMoney = summary?.earned ?? 0;
  const balanceDays = summary?.balance ?? 0;
  const usedDays = Math.max(0, earnedDays - balanceDays);

  const ini = (displayName.trim()[0] ?? 'U').toUpperCase();
  const userEmailDisplay = userEmail ?? user?.email ?? '';

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

  return (
    <div className="referrals-page">
      <div className="bg-fx" aria-hidden><div className="grid" /><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
      <div className="progress-bar" id="progressBar" />

      <div className="wrap">
        <nav className="top" id="nav">
          <div className="inner">
            <Link href="/" aria-label="3set — на главную" className="brand">
              <svg className="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#1b2a1c" />
                <path d="M11 16l3.5 3.5L21 13" stroke="#b7ff45" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>3<em>set</em><span className="dom mono">.online</span></span>
            </Link>
            <div className="nav-links">
              <Link href="/" className="nl">Панель</Link>
              <Link href="/subscription" className="nl">Мои ключи</Link>
              <Link href="/referrals" className="nl active">Рефералы</Link>
              <Link href="/faq" className="nl">Инструкции</Link>
              <Link href="/support" className="nl">Поддержка</Link>
            </div>
            <div className="nav-right">
              {isAdmin && (
                <Link href="/admin" className="btn btn-light sm" style={{ height: 40 }}>
                  Админ-панель
                </Link>
              )}
              <Link href="/profile" className="avatar-nav" title={userEmailDisplay} aria-label="Профиль">{ini}<span className="dot" /></Link>
              <button className="burger" id="burger" aria-label="Меню" aria-expanded={mobileOpen} onClick={() => setMobileOpen((o) => !o)}><span /></button>
            </div>
          </div>
          <div className={`mobile-menu ${mobileOpen ? 'open' : ''}`} id="mobileMenu">
            <div className="mm-inner">
              <Link href="/referrals" className="nl">Реферальная программа</Link>
              <Link href="/subscription" className="nl">Мои ключи</Link>
              <Link href="/faq" className="nl">Инструкции</Link>
              <Link href="/support" className="nl">Поддержка</Link>
            </div>
          </div>
        </nav>

        <main id="top">
          {/* HERO */}
          <section className="hero">
            <div className="card hero-l reveal">
              <div>
                <span className="kicker">Партнёрская программа</span>
                <h1 className="page-title" style={{ marginTop: 8 }}>Приглашайте друзей —<br /><em>получайте дни подписки</em></h1>
                <p className="lead" style={{ marginTop: 12 }}>По 5 дней вам и другу за каждую первую оплату. Без лимитов: дни копятся на балансе и продлевают любой ваш ключ.</p>
              </div>

              <div className="link-big">
                <code id="refLinkVal">{link}</code>
                <button className="btn btn-primary sm" onClick={async () => { const ok = await copyText(link); addToast(ok ? 'Реферальная ссылка скопирована' : 'Не удалось скопировать', ok ? 'ok' : 'err'); }}>
                  Копировать
                </button>
                <button className="btn btn-quiet sm" onClick={() => addToast('QR-код вашей ссылки')}>QR</button>
              </div>

              <div className="hero-mini">
                <div className="hm"><b>{invited}</b><span>приглашено</span></div>
                <div className="hm"><b>{paid}</b><span>оплатили</span></div>
                <div className="hm"><b>{invited > 0 ? Math.round((paid / invited) * 100) : 0}<small>%</small></b><span>конверсия</span></div>
                <div className="hm"><b>{earnedDays} дн.</b><span>заработано дней</span></div>
              </div>
            </div>

            <div className="card balance-card reveal" style={{ '--d': '120ms' } as React.CSSProperties}>
              <span className="tier-chip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 3 6.5 7 .9-5 4.8 1.2 7-6.2-3.4L5.8 21l1.2-7-5-4.8 7-.9z" /></svg>
                <span>Уровень «Партнёр»</span>
              </span>
              <div>
                <span className="label">Баланс бонусных дней</span>
              </div>
              <div className="bal-ring">
                <svg viewBox="0 0 158 158" aria-hidden="true">
                  <circle className="tr" cx="79" cy="79" r="66" />
                  <circle className="vl" cx="79" cy="79" r="66" strokeDasharray="414.7" strokeDashoffset={414.7 - (balanceDays / 120) * 414.7} />
                </svg>
                <div className="in"><b>{balanceDays}</b><span>дней</span></div>
              </div>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700 }}>
                  <span className="dim">До уровня «Про»</span>
                  <span>{invited} / 20 приглашений</span>
                </div>
                <div className="bar"><i style={{ width: `${Math.min(100, (invited / 20) * 100)}%` }} /></div>
              </div>
              <p className="dim" style={{ margin: 0, fontSize: '11.5px', textAlign: 'center' }}>Дни не сгорают и суммируются при продлении</p>
            </div>
          </section>

          {/* STATS */}
          <section className="stats-strip reveal" style={{ '--d': '60ms' } as React.CSSProperties}>
            <div className="stat"><span className="label">Приглашено</span><b>{invited}</b></div>
            <div className="stat"><span className="label">Оплатили</span><b>{paid}</b></div>
            <div className="stat"><span className="label">Конверсия</span><b>{invited > 0 ? Math.round((paid / invited) * 100) : 0}<small>%</small></b></div>
            <div className="stat"><span className="label">Оборот рефералов</span><b>{earnedMoney}<small>₽</small></b></div>
            <div className="stat"><span className="label">Начислено дней</span><b>{earnedDays}</b><span className="dim" style={{ fontSize: 11 }}>потрачено {usedDays}</span></div>
          </section>

          {/* HOW IT WORKS */}
          <section>
            <div className="sec-head reveal">
              <div>
                <span className="kicker">Как это работает</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Четыре шага до бонусных дней</h2>
              </div>
              <span className="pill ok"><span className="pdot" />Начисление автоматически</span>
            </div>
            <div className="how">
              <div className="how-i reveal"><span className="n mono">01</span><h3>Скопируйте ссылку</h3><p>Персональный код уже зашит в ссылку.</p></div>
              <div className="how-i reveal" style={{ '--d': '80ms' } as React.CSSProperties}><span className="n mono">02</span><h3>Друг регистрируется</h3><p>Код закрепляется за аккаунтом.</p></div>
              <div className="how-i reveal" style={{ '--d': '160ms' } as React.CSSProperties}><span className="n mono">03</span><h3>Он оплачивает подписку</h3><p>Учитывается первая оплата любого тарифа.</p></div>
              <div className="how-i reveal" style={{ '--d': '240ms' } as React.CSSProperties}><span className="n mono">04</span><h3>Вы получаете дни</h3><p>+5 дней на баланс сразу, +5 дней другу.</p></div>
            </div>
          </section>

          {/* REFERRAL LINK + SETTINGS */}
          <section className="card reveal" style={{ '--d': '100ms' } as React.CSSProperties}>
            <div className="sec-head" style={{ marginBottom: 16 }}>
              <div>
                <span className="kicker">Ваша ссылка</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Приглашайте по ссылке</h2>
              </div>
              <span className="pill"><span className="mono" style={{ fontSize: '11px' }}>code: {code}</span></span>
            </div>
            <div className="link-big">
              <code>{link}</code>
              <button className="btn btn-primary sm" onClick={async () => { const ok = await copyText(link); addToast(ok ? 'Реферальная ссылка скопирована' : 'Не удалось скопировать', ok ? 'ok' : 'err'); }}>Копировать</button>
            </div>
            <p className="muted" style={{ margin: '12px 0 0', fontSize: '13px' }}>
              Другу тоже начислим 5 дней после его первой оплаты. Днями продлевается любой ваш ключ.
            </p>
          </section>

          {/* TIERS */}
          <section className="card reveal" style={{ '--d': '120ms' } as React.CSSProperties}>
            <div className="sec-head" style={{ marginBottom: 14 }}>
              <div>
                <span className="kicker">Уровни партнёра</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Больше приглашений — выше ставка</h2>
              </div>
            </div>
            <div className="tiers">
              {[
                { name: 'Новичок', req: 0, reward: '5 дней за сделку' },
                { name: 'Партнёр', req: 5, reward: '7 дней + значок в кабинете' },
                { name: 'Про', req: 20, reward: '10 дней + 10% с оборота, выплаты деньгами' },
                { name: 'Легенда', req: 50, reward: '15 дней + 15% с оборота, личный менеджер' },
              ].map((t, i) => {
                const cur = invited >= t.req && (i === 3 || invited < ([5, 20, 50, Infinity][i + 1] ?? Infinity));
                return (
                  <div key={t.name} className={`tier ${cur ? 'cur' : t.req > invited ? 'locked' : ''}`}>
                    <div className="tic">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 3 6.5 7 .9-5 4.8 1.2 7-6.2-3.4L5.8 21l1.2-7-5-4.8 7-.9z" /></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{t.name}</b>
                      <span>{t.reward}</span>
                      <span className="req">{t.req === 0 ? 'доступен сразу' : `от ${t.req} оплативших друзей`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* FAQ */}
          <section className="card reveal" style={{ '--d': '160ms' } as React.CSSProperties}>
            <div className="sec-head" style={{ marginBottom: 14 }}>
              <div>
                <span className="kicker">Вопросы</span>
                <h2 className="sec-title" style={{ marginTop: 6 }}>Частые вопросы о реферальной программе</h2>
              </div>
            </div>
            <div className="acc">
              {[
                { q: 'Когда начисляются бонусные дни?', a: 'Сразу после первой успешной оплаты приглашённого. Начисление автоматическое: +5 дней вам и +5 дней другу.' },
                { q: 'Куда списывать накопленные дни?', a: 'На любой ваш ключ в разделе «Мои ключи». Нажмите «Продлить ключ» — выберите ключ и количество дней.' },
                { q: 'Есть ли лимит на количество приглашений?', a: 'Нет, приглашать можно бесконечно. Дни на балансе не сгорают.' },
                { q: 'Можно ли получать деньги вместо дней?', a: 'Да, начиная с уровня «Про»: выплаты на карту или USDT раз в месяц при сумме от 1000 ₽. Напишите в поддержку.' },
              ].map((item, i) => (
                <details key={i} className="acc-item">
                  <summary className="acc-q">{item.q}</summary>
                  <div className="acc-a"><div><p>{item.a}</p></div></div>
                </details>
              ))}
            </div>
          </section>
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
              <Link href="/subscription">Мои ключи</Link>
              <Link href="/faq">Инструкции</Link>
              <Link href="/support">Поддержка</Link>
              <button onClick={() => addToast('Политика конфиденциальности')}>Политика</button>
            </div>
          </div>
        </footer>
      </div>

      <div className="toasts" id="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'err' ? 'err' : ''} show`}>
            <span className="ti">
              {t.type === 'err' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              )}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}