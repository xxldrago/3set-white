'use client';

// /admin/referrals — template-styled program console.
//
// Server data (settings, partners, withdrawals, journal, sources) arrives as
// one snapshot; the island owns the interactions: settings save, payout
// decisions, per-partner rate overrides and the period/granularity funnel
// fetch. Every mutation goes through the existing role-gated BFF routes, so
// the UI never becomes the authority.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Link2,
  MonitorSmartphone,
  MousePointerClick,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type { AdminReferralPartner, AdminReferrals } from '@/lib/admin-referrals';
import type { ReferralSettings } from '@/lib/referrals';
import type { FunnelBucket, FunnelStats } from '@/lib/referral-stats';

const nf = new Intl.NumberFormat('ru-RU');
const pctFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const rub = (n: number) => `${nf.format(Math.round(n))} ₽`;
const pctOf = (n: number | null) => (n === null ? '—' : `${pctFmt.format(n * 100)}%`);
const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
// Bucket starts are instants; render them in the viewer's local day, not UTC.
const fmtIsoDay = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
};
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

type Granularity = 'day' | 'week' | 'month' | 'year';
type ToastKind = 'ok' | 'warn' | 'err';
type Toast = { id: number; msg: string; kind: ToastKind };

const REASON_LABEL: Record<string, string> = {
  referral_bonus: 'Награда партнёру',
  referral_days: 'Начислены дни подписки',
  withdrawal_hold: 'Заявка на вывод',
  withdrawal_refund: 'Возврат заявки',
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Ожидает', cls: 'warn' },
  approved: { label: 'Выплачено', cls: 'ok' },
  rejected: { label: 'Отклонено', cls: 'bad' },
};

function Mini({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: '' | 'cy' | 'am' }) {
  return (
    <div className={`anl-mini ${tone}`}>
      <span className="anl-lbl">{label}</span>
      <b>{value}</b>
      {hint ? <span className="anl-mini-h">{hint}</span> : null}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = '',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: '' | 'cy' | 'am';
}) {
  return (
    <div className="anl-kpi">
      <div className="anl-kpi-top">
        <span className={`anl-ic ${tone}`}>{icon}</span>
        <span className="anl-lbl">{label}</span>
      </div>
      <b>{value}</b>
      <span className="anl-kpi-sub">{sub}</span>
      <div className="anl-kpi-foot" />
    </div>
  );
}

export default function ReferralsApp({ initial }: { initial: AdminReferrals }) {
  const [settings, setSettings] = useState<ReferralSettings>(initial.settings);
  const [partners, setPartners] = useState<AdminReferralPartner[]>(initial.partners);
  const [withdrawals, setWithdrawals] = useState(initial.withdrawals);
  const [stats, setStats] = useState<FunnelStats>(initial.stats);
  const [series, setSeries] = useState<FunnelBucket[] | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [period, setPeriod] = useState<number>(30);
  const [gran, setGran] = useState<Granularity>('day');
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86_400_000);
    return { from: isoDay(from), to: isoDay(to) };
  });
  const [wrFilter, setWrFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<null | {
    title: string;
    body: ReactNode;
    actions: { label: string; cls: string; onClick: () => void | Promise<void>; disabled?: boolean }[];
  }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  // settings form
  const [sys, setSys] = useState<'days' | 'money'>(settings.userMode);
  const [kind, setKind] = useState<'percent' | 'fixed'>(settings.inviterKind);
  const [inviter, setInviter] = useState(String(settings.inviterValue));
  const [invitee, setInvitee] = useState(String(settings.inviteeValue));
  const [minWithdraw, setMinWithdraw] = useState(String(settings.minWithdraw));
  const [userDays, setUserDays] = useState(String(settings.userDays));
  const [inviteeDays, setInviteeDays] = useState(String(settings.inviteeDays));
  const [saving, setSaving] = useState(false);

  const toast = useCallback((msg: string, kind: ToastKind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, msg, kind }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3600);
  }, []);

  useEffect(() => {
    if (!modal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const loadStats = useCallback(
    async (from: string, to: string, granularity: Granularity) => {
      setChartLoading(true);
      try {
        const params = new URLSearchParams({
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59`).toISOString(),
          granularity,
        });
        const res = await fetch(`/api/admin/referrals/stats?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('stats');
        const json = (await res.json()) as { stats: FunnelStats; series: FunnelBucket[] };
        setStats(json.stats);
        setSeries(json.series);
      } catch {
        toast('Не удалось загрузить воронку', 'err');
      } finally {
        setChartLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    // Deferred so the fetch's loading state is not a synchronous setState in
    // the effect body; handlers below fetch explicitly on user changes.
    const timer = window.setTimeout(() => {
      void loadStats(range.from, range.to, gran);
    }, 0);
    return () => window.clearTimeout(timer);
    // Initial mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPeriod = (p: number) => {
    setPeriod(p);
    const to = new Date();
    const from = new Date(to.getTime() - (p - 1) * 86_400_000);
    const next = { from: isoDay(from), to: isoDay(to) };
    setRange(next);
    void loadStats(next.from, next.to, gran);
  };

  const applyGran = (g: Granularity) => {
    setGran(g);
    void loadStats(range.from, range.to, g);
  };

  const applyRange = (next: { from?: string; to?: string }) => {
    const merged = { ...range, ...next };
    if (!merged.from || !merged.to || new Date(merged.from) > new Date(merged.to)) {
      toast('Проверьте диапазон дат', 'err');
      return;
    }
    setRange(merged);
    setPeriod(0);
    void loadStats(merged.from, merged.to, gran);
  };

  const saveSettings = async () => {
    const nums = {
      inviterValue: Number(inviter),
      inviteeValue: Number(invitee),
      minWithdraw: Number(minWithdraw),
      userDays: Number(userDays),
      inviteeDays: Number(inviteeDays),
    };
    if (Object.values(nums).some((n) => !Number.isSafeInteger(n) || n < 0)) {
      toast('Поля должны быть целыми неотрицательными числами', 'err');
      return;
    }
    if (kind === 'percent' && (nums.inviterValue < 1 || nums.inviterValue > 90)) {
      toast('Процент: от 1 до 90', 'err');
      return;
    }
    if (kind === 'fixed' && (nums.inviterValue < 1 || nums.inviterValue > 100_000)) {
      toast('Фикс. сумма: от 1 до 100 000 ₽', 'err');
      return;
    }
    if (nums.userDays > 365 || nums.inviteeDays > 365) {
      toast('Дней: 0–365', 'err');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/referrals/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...nums, inviterKind: kind, userMode: sys }),
      });
      if (!res.ok) throw new Error('save');
      const json = (await res.json()) as { settings: ReferralSettings };
      setSettings(json.settings);
      toast('Настройки реферальной программы сохранены');
    } catch {
      toast('Не удалось сохранить настройки', 'err');
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = () => {
    setSys(settings.userMode);
    setKind(settings.inviterKind);
    setInviter(String(settings.inviterValue));
    setInvitee(String(settings.inviteeValue));
    setMinWithdraw(String(settings.minWithdraw));
    setUserDays(String(settings.userDays));
    setInviteeDays(String(settings.inviteeDays));
    toast('Форма сброшена к сохранённым значениям', 'warn');
  };

  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/referrals/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approve }),
      });
      if (!res.ok) throw new Error('decide');
      setWithdrawals((list) =>
        list.map((row) => (row.id === id ? { ...row, status: approve ? 'approved' : 'rejected' } : row)),
      );
      toast(approve ? 'Заявка выплачена' : 'Заявка отклонена, сумма возвращена на баланс', approve ? 'ok' : 'warn');
    } catch {
      toast('Не удалось обработать заявку', 'err');
    } finally {
      setBusy(null);
      setModal(null);
    }
  };

  const saveRate = async (partner: AdminReferralPartner, nextKind: 'percent' | 'fixed', amount: number | null) => {
    setBusy(`rate-${partner.id}`);
    try {
      const res = await fetch(`/api/admin/users/${partner.id}/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, kind: amount === null ? null : nextKind }),
      });
      if (!res.ok) throw new Error('rate');
      setPartners((list) =>
        list.map((row) =>
          row.id === partner.id
            ? { ...row, customReward: amount, customKind: amount === null ? null : nextKind }
            : row,
        ),
      );
      toast(amount === null ? 'Ставка сброшена на глобальную' : 'Личная ставка партнёра сохранена');
    } catch {
      toast('Не удалось сохранить ставку', 'err');
    } finally {
      setBusy(null);
      setModal(null);
    }
  };

  const copyLink = async (code: string | null) => {
    if (!code) {
      toast('У партнёра ещё нет реферального кода', 'warn');
      return;
    }
    const url = `https://dash.3set.online/signup?ref=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка скопирована');
    } catch {
      toast(url, 'warn');
    }
  };

  const exportCsv = () => {
    const rows = [
      ['section', 'key', 'value'].join(';'),
      ['funnel', 'clicks', stats.clicks].join(';'),
      ['funnel', 'registrations', stats.registrations].join(';'),
      ['funnel', 'purchases', stats.purchases].join(';'),
      ['funnel', 'revenue', stats.revenue].join(';'),
      ['funnel', 'devices', stats.devices].join(';'),
      ['settings', 'user_mode', settings.userMode].join(';'),
      ['settings', 'inviter_kind', settings.inviterKind].join(';'),
      ['settings', 'inviter_value', settings.inviterValue].join(';'),
      ['settings', 'invitee_value', settings.inviteeValue].join(';'),
      ['settings', 'min_withdraw', settings.minWithdraw].join(';'),
      ...partners.map((p) =>
        ['partner', p.id, p.name, p.code ?? '', p.clicks, p.regs, p.purchases, p.revenue, p.accrued, p.balance].join(';'),
      ),
      ...withdrawals.map((w) => ['withdrawal', w.id, w.userId, w.amount, w.status].join(';')),
    ];
    const blob = new Blob([`\ufeff${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `3set-referrals-${range.from}-${range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1200);
    toast('Экспорт реферальной программы готов');
  };

  const copyRules = async () => {
    const text = [
      'Правила реферальной программы 3set VPN:',
      '1. Награда начисляется после первой оплаты друга.',
      settings.userMode === 'days'
        ? `2. Пользователи получают ${settings.userDays} дн., приглашённый — ${settings.inviteeDays} дн.`
        : `2. Пользователи получают ${settings.inviterKind === 'percent' ? `${settings.inviterValue}%` : `${settings.inviterValue} ₽`} с оплаты.`,
      `3. Минимальный вывод — ${settings.minWithdraw} ₽.`,
      '4. Самоприведение и накрутки запрещены.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('Правила программы скопированы');
    } catch {
      toast('Правила: награда после первой оплаты друга', 'warn');
    }
  };

  const visibleWithdrawals = useMemo(
    () =>
      withdrawals
        .filter((row) => (wrFilter === 'all' ? true : row.status === wrFilter))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [withdrawals, wrFilter],
  );

  const pending = useMemo(
    () => withdrawals.filter((row) => row.status === 'pending'),
    [withdrawals],
  );
  const pendingSum = pending.reduce((sum, row) => sum + row.amount, 0);
  const paidSum = withdrawals.filter((row) => row.status === 'approved').reduce((sum, row) => sum + row.amount, 0);
  const counts = useMemo(
    () => ({
      all: withdrawals.length,
      pending: pending.length,
      approved: withdrawals.filter((row) => row.status === 'approved').length,
      rejected: withdrawals.filter((row) => row.status === 'rejected').length,
    }),
    [withdrawals, pending.length],
  );

  const convClicks = stats.clicks > 0 ? stats.registrations / stats.clicks : null;
  const convRegs = stats.registrations > 0 ? stats.purchases / stats.registrations : null;
  const sourceTotal = initial.sources.referral + initial.sources.promo + initial.sources.organic;
  const partnersWithPays = partners.filter((p) => p.purchases > 0).length;
  const accruedTotal = partners.reduce((sum, p) => sum + p.accrued, 0);
  const balancesTotal = partners.reduce((sum, p) => sum + p.balance, 0);

  const rateLabel = (p: AdminReferralPartner) => {
    if (p.customReward !== null) {
      return `${p.customKind === 'percent' ? `${p.customReward}%` : `${p.customReward} ₽`} · личная`;
    }
    return `${settings.inviterKind === 'percent' ? `${settings.inviterValue}%` : `${settings.inviterValue} ₽`} · глобальная`;
  };

  const maxWeekly = Math.max(1, ...initial.weekly.map((w) => w.money));
  const funnelRows = series ?? [];
  const maxBar = Math.max(1, ...funnelRows.map((r) => Math.max(r.clicks, r.registrations, r.purchases))) * 1.15;
  const maxLine = Math.max(1, ...funnelRows.map((r) => r.revenue)) * 1.15;
  const W = 760;
  const H = 220;
  const PL = 34;
  const PR = 46;
  const PT = 12;
  const PB = 26;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  const slot = funnelRows.length > 0 ? iw / funnelRows.length : iw;
  const bw = Math.max(2, Math.min(9, slot * 0.2));
  const hovered = hover !== null ? funnelRows[hover] : null;

  return (
    <div className="anl ref-page">
      <header className="anl-head">
        <div className="anl-head-text">
          <span className="anl-kick">Партнёрская программа · МСК</span>
          <h2>Рефералы</h2>
          <p>
            Награда пригласившему и бонус приглашённому. Процент считается от оплаченной суммы заказа.
            Партнёры получают деньгами, обычные пользователи — выбранной системой.
          </p>
        </div>
        <div className="anl-head-side">
          <div className="anl-pills">
            <span className="anl-pill ok"><i />программа активна</span>
            <span className="anl-pill info">
              <i />ставка: {settings.userMode === 'days' ? `${settings.userDays} дн. / ${settings.inviteeDays} дн.` : `${settings.inviterValue}${settings.inviterKind === 'percent' ? '%' : ' ₽'}`}
            </span>
            {pending.length > 0 && (
              <span className="anl-pill warn"><i />{pending.length} заявка ждёт</span>
            )}
          </div>
          <div className="anl-tools">
            <button type="button" className="anl-btn" onClick={() => void copyRules()}>Правила программы</button>
            <button type="button" className="anl-btn" onClick={exportCsv}>Экспорт CSV</button>
          </div>
        </div>
      </header>

      <nav className="anl-subnav" aria-label="Разделы страницы">
        {[
          ['ref-settings', 'Настройки'],
          ['ref-requests', 'Заявки'],
          ['ref-funnel', 'Воронка'],
          ['ref-partners', 'Партнёры'],
          ['ref-accruals', 'Начисления'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>{label}</a>
        ))}
      </nav>

      <section className="anl-sec" id="ref-kpi">
        <div className="anl-kpis ref-kpis">
          <KpiCard icon={<MousePointerClick size={14} />} label="Клики по ссылкам" value={nf.format(stats.clicks)} sub={`за ${period || 'выбранный'} период`} />
          <KpiCard icon={<UserPlus size={14} />} label="Регистраций" value={nf.format(stats.registrations)} sub={`конверсия ${pctOf(convClicks)} из кликов`} />
          <KpiCard icon={<CreditCard size={14} />} label="Покупок" value={nf.format(stats.purchases)} sub={`конверсия ${pctOf(convRegs)} из регистраций`} tone="cy" />
          <KpiCard icon={<TrendingUp size={14} />} label="Выручка рефералов" value={rub(stats.revenue)} sub="оборот приведённых клиентов" />
          <KpiCard icon={<Users size={14} />} label="Партнёров" value={nf.format(partners.length)} sub={`${partnersWithPays} с оплатами`} />
          <KpiCard icon={<Wallet size={14} />} label="Начислено партнёрам" value={rub(accruedTotal)} sub={`балансы к выводу ${rub(balancesTotal)}`} tone="am" />
          <KpiCard icon={<Link2 size={14} />} label="Заявок на вывод" value={nf.format(pending.length)} sub={pendingSum > 0 ? `${rub(pendingSum)} к выплате` : 'очередь пуста'} />
          <KpiCard icon={<MonitorSmartphone size={14} />} label="Устройств у рефералов" value={nf.format(stats.devices)} sub="подключено приведёнными" tone="cy" />
        </div>

        <div className="ref-how">
          {[
            ['01', 'Партнёр делится ссылкой', 'Персональный код зашит в ссылку кабинета', <Link2 key="a" size={18} />],
            ['02', 'Друг регистрируется', 'Код закрепляется за аккаунтом', <UserPlus key="b" size={18} />],
            ['03', 'Друг оплачивает подписку', 'Учитывается оплата любого тарифа', <CreditCard key="c" size={18} />],
            ['04', 'Оба получают награду', 'Деньги на баланс или дни подписки', <Wallet key="d" size={18} />],
          ].map(([n, title, text, icon]) => (
            <div className="ref-how-i" key={n as string}>
              <span className="ref-how-n mono">{n}</span>
              <span className="ref-how-ic">{icon}</span>
              <h4>{title}</h4>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="anl-sec" id="ref-settings">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Конфигурация</span>
            <h2>Настройки наград</h2>
          </div>
          <div className="anl-tools">
            <button type="button" className="anl-btn" onClick={resetSettings}>Сбросить</button>
            <button type="button" className="anl-btn primary" onClick={() => void saveSettings()} disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить настройки'}
            </button>
          </div>
        </div>

        <div className="anl-grid-2">
          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Система для пользователей</h3>
                <p>Партнёры всегда получают деньгами. Обычные пользователи — выбранной системой.</p>
              </div>
              <span className="anl-pill dim">режим: {sys === 'days' ? 'дни' : 'деньги'}</span>
            </div>

            <div className="ref-sys" role="group" aria-label="Система для пользователей">
              {([
                ['money', 'Деньги', 'процент или фикс от оплаты друга', <CreditCard key="m" size={18} />],
                ['days', 'Дни', 'дни подписки на баланс пользователя', <CalendarDays key="d" size={18} />],
              ] as const).map(([value, title, text, icon]) => (
                <button
                  key={value}
                  type="button"
                  className={`ref-sys-b${sys === value ? ' on' : ''}`}
                  onClick={() => setSys(value)}
                  aria-pressed={sys === value}
                >
                  <span className="ref-sys-chk">✓</span>
                  <span className="ref-sys-ic">{icon}</span>
                  <b>{title}</b>
                  <span>{text}</span>
                </button>
              ))}
            </div>

            <div className={`ref-set${sys === 'money' ? '' : ' off'}`}>
              <h4><span className="ref-dot am" />Деньги (партнёры и money-режим)</h4>
              <div className="ref-form-2">
                <label className="ref-field">
                  <span>Награда пригласившему</span>
                  <select className="ref-select" value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'fixed')} disabled={sys === 'days'}>
                    <option value="percent">Процент от оплаты (%)</option>
                    <option value="fixed">Фикс. сумма (₽)</option>
                  </select>
                </label>
                <label className="ref-field">
                  <span>Размер награды</span>
                  <input className="ref-input" inputMode="numeric" value={inviter} onChange={(e) => setInviter(e.target.value.replace(/\D/g, ''))} disabled={sys === 'days'} />
                  <em>{kind === 'percent' ? `${inviter || 0}% от каждой оплаты друга` : `${inviter || 0} ₽ за каждую оплату`}</em>
                </label>
              </div>
              <div className="ref-form-2">
                <label className="ref-field">
                  <span>Бонус приглашённому (₽, 0 — выкл)</span>
                  <input className="ref-input" inputMode="numeric" value={invitee} onChange={(e) => setInvitee(e.target.value.replace(/\D/g, ''))} disabled={sys === 'days'} />
                </label>
                <label className="ref-field">
                  <span>Минимальный вывод (₽)</span>
                  <input className="ref-input" inputMode="numeric" value={minWithdraw} onChange={(e) => setMinWithdraw(e.target.value.replace(/\D/g, ''))} />
                  <em>заявки ниже порога отклоняются</em>
                </label>
              </div>
            </div>

            <div className={`ref-set${sys === 'days' ? '' : ' off'}`}>
              <h4><span className="ref-dot" />Дни (days-режим)</h4>
              <div className="ref-form-2">
                <label className="ref-field">
                  <span>Дней пригласившему</span>
                  <input className="ref-input" inputMode="numeric" value={userDays} onChange={(e) => setUserDays(e.target.value.replace(/\D/g, ''))} disabled={sys === 'money'} />
                </label>
                <label className="ref-field">
                  <span>Дней приглашённому</span>
                  <input className="ref-input" inputMode="numeric" value={inviteeDays} onChange={(e) => setInviteeDays(e.target.value.replace(/\D/g, ''))} disabled={sys === 'money'} />
                </label>
              </div>
              <div className="ref-preview">
                Пользователь получит <b>+{userDays || 0} дн.</b> за друга, друг — <b>+{inviteeDays || 0} дн.</b> после первой оплаты.
                Дни падают на баланс и продлевают любой ключ.
              </div>
            </div>

            <div className="ref-set">
              <h4><span className="ref-dot cy" />Дополнительно</h4>
              <div className="anl-kv"><span>Антифрод: самоприведение</span><b className="lime">заблокировано</b></div>
              <div className="anl-kv"><span>Антифрод: один платёжный метод</span><b className="lime">заблокировано</b></div>
              <div className="anl-kv"><span>Начисление</span><b>мгновенно после оплаты</b></div>
              <div className="anl-kv"><span>Дней на балансах пользователей</span><b>{nf.format(initial.totals.daysOnBalances)}</b></div>
            </div>
          </div>

          <div className="anl-col">
            <div className="anl-card">
              <div className="anl-card-h">
                <div>
                  <span className="anl-kick">Предпросмотр</span>
                  <h3 style={{ marginTop: 6 }}>Так видит пользователь</h3>
                </div>
              </div>
              <div className="ref-phone">
                <div className="ref-phone-h">
                  <span className="ref-phone-av">3S</span>
                  <span><b>Реферальная программа</b><span>личный кабинет · 3set VPN</span></span>
                </div>
                <div className="ref-phone-bub">
                  {sys === 'days' ? (
                    <>Пригласите друга — и вы, и он получите по <b>+{inviteeDays || 0} дн.</b> подписки после его первой оплаты. Днями можно продлить любой ваш ключ.</>
                  ) : (
                    <>Приводите друзей: вы получаете <b>{kind === 'percent' ? `${inviter || 0}%` : rub(Number(inviter) || 0)}</b> с каждой оплаты, друг — <b>{Number(invitee) > 0 ? rub(Number(invitee)) : 'бонус дней'}</b>. Вывод от {rub(Number(minWithdraw) || 0)}.</>
                  )}
                </div>
                <div className="ref-phone-cta">{sys === 'days' ? 'Скопировать ссылку' : 'Стать партнёром'}</div>
              </div>
              <p className="anl-hint">Текст обновляется при изменении настроек — пользователи увидят его в кабинете и в рассылках.</p>
            </div>

            <div className="anl-card">
              <div className="anl-card-h">
                <div>
                  <span className="anl-kick">Источники</span>
                  <h3 style={{ marginTop: 6 }}>Откуда приходят регистрации</h3>
                  <p>За последние 30 дней</p>
                </div>
              </div>
              <div className="anl-donut-wrap">
                <div className="anl-donut">
                  <svg viewBox="0 0 132 132" aria-hidden="true">
                    <circle cx="66" cy="66" r="54" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="14" />
                    {(() => {
                      const total = Math.max(1, sourceTotal);
                      const segments = [
                        { value: initial.sources.referral, color: 'var(--lime)' },
                        { value: initial.sources.promo, color: 'var(--cyan)' },
                        { value: initial.sources.organic, color: 'var(--cream)' },
                      ];
                      const C = 2 * Math.PI * 54;
                      let offset = 0;
                      return segments.map((seg, i) => {
                        const len = (seg.value / total) * C;
                        const el = (
                          <circle
                            key={i}
                            cx="66"
                            cy="66"
                            r="54"
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="14"
                            strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                            strokeDashoffset={(-offset).toFixed(2)}
                          />
                        );
                        offset += len;
                        return el;
                      });
                    })()}
                  </svg>
                  <div className="anl-donut-ct"><b>{nf.format(sourceTotal)}</b><span>регистр.</span></div>
                </div>
                <div className="anl-dlist">
                  <div className="anl-dl"><i className="lime" /><span>Реферальные ссылки</span><b>{nf.format(initial.sources.referral)}</b></div>
                  <div className="anl-dl"><i className="cy" /><span>Промокоды</span><b>{nf.format(initial.sources.promo)}</b></div>
                  <div className="anl-dl"><i className="dim" /><span>Органика</span><b>{nf.format(initial.sources.organic)}</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="anl-sec" id="ref-requests">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Выплаты</span>
            <h2>Заявки на вывод</h2>
          </div>
          <div className="anl-chips">
            {([
              ['all', 'Все', counts.all],
              ['pending', 'Ожидают', counts.pending],
              ['approved', 'Выплачено', counts.approved],
              ['rejected', 'Отклонено', counts.rejected],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                className={`anl-chip${wrFilter === value ? ' on' : ''}`}
                onClick={() => setWrFilter(value)}
              >
                {label} <span className="ref-chip-n">{count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="anl-card">
          {visibleWithdrawals.length === 0 ? (
            <div className="ref-empty">
              <span className="ref-empty-ic"><Wallet size={22} /></span>
              <b>Заявок пока нет</b>
              <p>Как только партнёр накопит минимальную сумму и оформит вывод, заявка появится здесь.</p>
            </div>
          ) : (
            <div className="anl-tbl-wrap">
              <table className="anl-tbl ref-tbl">
                <thead>
                  <tr>
                    <th>Заявка</th>
                    <th>Партнёр</th>
                    <th className="num">Сумма</th>
                    <th>Реквизиты</th>
                    <th>Создана</th>
                    <th>Статус</th>
                    <th style={{ textAlign: 'right' }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleWithdrawals.map((row) => {
                    const st = STATUS_LABEL[row.status] ?? { label: row.status, cls: 'dim' };
                    return (
                      <tr key={row.id}>
                        <td><span className="ref-code">{row.id.slice(0, 8)}</span></td>
                        <td>
                          <span className="ref-who">
                            <span className="ref-who-av">{row.userName.slice(0, 1).toUpperCase()}</span>
                            <span><b>{row.userName}</b><span className="mono">#{row.userId}</span></span>
                          </span>
                        </td>
                        <td className="num">{rub(row.amount)}</td>
                        <td><span className="mono dim ref-small">{row.contact ?? '—'}</span></td>
                        <td><span className="mono dim ref-small">{fmtDateTime(row.createdAt)}</span></td>
                        <td><span className={`anl-pill ${st.cls}`}><i />{st.label}</span></td>
                        <td>
                          <div className="ref-acts">
                            {row.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  className="anl-btn small primary"
                                  disabled={busy !== null}
                                  onClick={() =>
                                    setModal({
                                      title: `Выплатить заявку ${row.id.slice(0, 8)}?`,
                                      body: (
                                        <div>
                                          <div className="anl-kv"><span>Партнёр</span><b>{row.userName} · #{row.userId}</b></div>
                                          <div className="anl-kv"><span>Сумма</span><b className="lime">{rub(row.amount)}</b></div>
                                          <div className="anl-kv"><span>Реквизиты</span><b className="mono">{row.contact ?? '—'}</b></div>
                                          <div className="ref-preview" style={{ marginTop: 12 }}>
                                            Заявка перейдёт в статус «Выплачено». Убедитесь, что перевод по реквизитам уже сделан.
                                          </div>
                                        </div>
                                      ),
                                      actions: [
                                        { label: 'Отмена', cls: 'anl-btn', onClick: () => setModal(null) },
                                        { label: 'Подтвердить выплату', cls: 'anl-btn primary', onClick: () => decide(row.id, true) },
                                      ],
                                    })
                                  }
                                >
                                  Выплатить
                                </button>
                                <button
                                  type="button"
                                  className="anl-btn small danger"
                                  disabled={busy !== null}
                                  onClick={() =>
                                    setModal({
                                      title: `Отклонить заявку ${row.id.slice(0, 8)}?`,
                                      body: (
                                        <div>
                                          <div className="anl-kv"><span>Партнёр</span><b>{row.userName}</b></div>
                                          <div className="anl-kv"><span>Сумма</span><b>{rub(row.amount)}</b></div>
                                          <div className="ref-preview" style={{ marginTop: 12 }}>
                                            Сумма вернётся на баланс партнёра. Причину отклонения в этом диалоге сохранить нельзя — напишите партнёру отдельно.
                                          </div>
                                        </div>
                                      ),
                                      actions: [
                                        { label: 'Отмена', cls: 'anl-btn', onClick: () => setModal(null) },
                                        { label: 'Отклонить', cls: 'anl-btn danger', onClick: () => decide(row.id, false) },
                                      ],
                                    })
                                  }
                                >
                                  Отклонить
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="anl-btn small"
                                onClick={() =>
                                  setModal({
                                    title: `Заявка ${row.id.slice(0, 8)}`,
                                    body: (
                                      <div>
                                        <div className="anl-kv"><span>Партнёр</span><b>{row.userName} · #{row.userId}</b></div>
                                        <div className="anl-kv"><span>Сумма</span><b>{rub(row.amount)}</b></div>
                                        <div className="anl-kv"><span>Реквизиты</span><b className="mono">{row.contact ?? '—'}</b></div>
                                        <div className="anl-kv"><span>Создана</span><b>{fmtDateTime(row.createdAt)}</b></div>
                                        <div className="anl-kv"><span>Статус</span><b>{st.label}</b></div>
                                      </div>
                                    ),
                                    actions: [{ label: 'Закрыть', cls: 'anl-btn', onClick: () => setModal(null) }],
                                  })
                                }
                              >
                                Подробности
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="anl-minis ref-wr-summary">
            <Mini label="Ожидает выплаты" value={rub(pendingSum)} hint={`${counts.pending} заявок`} />
            <Mini label="Выплачено" value={rub(paidSum)} hint={`${counts.approved} заявок`} />
            <Mini label="Накоплено партнёрами" value={rub(balancesTotal)} hint={`порог вывода ${rub(settings.minWithdraw)}`} tone="cy" />
            <Mini label="Всего заявок" value={nf.format(counts.all)} hint={`${counts.rejected} отклонено`} />
          </div>
        </div>
      </section>

      <section className="anl-sec" id="ref-funnel">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Воронка</span>
            <h2>Воронка рефералов</h2>
          </div>
          <div className="anl-tools">
            <div className="anl-seg">
              {([7, 30, 90] as number[]).map((p) => (
                <button key={p} type="button" className={period === p ? 'on' : ''} onClick={() => applyPeriod(p)}>
                  {p} дн.
                </button>
              ))}
            </div>
            <div className="anl-seg">
              {([
                ['day', 'Дни'],
                ['week', 'Недели'],
                ['month', 'Месяцы'],
                ['year', 'Годы'],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" className={gran === value ? 'on' : ''} onClick={() => applyGran(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="anl-card">
          <div className="ref-dates">
            <label className="ref-field">
              <span>С</span>
              <input className="ref-input" type="date" value={range.from} max={range.to} onChange={(e) => applyRange({ from: e.target.value })} />
            </label>
            <label className="ref-field">
              <span>По</span>
              <input className="ref-input" type="date" value={range.to} min={range.from} onChange={(e) => applyRange({ to: e.target.value })} />
            </label>
          </div>

          <div className="anl-minis ref-funnel-kpi">
            <Mini label="Клики" value={nf.format(stats.clicks)} hint="переходы по ссылкам" />
            <Mini label="Регистрации" value={nf.format(stats.registrations)} hint={`конверсия ${pctOf(convClicks)}`} />
            <Mini label="Покупки" value={nf.format(stats.purchases)} hint={`конверсия ${pctOf(convRegs)}`} />
            <Mini label="Выручка" value={rub(stats.revenue)} hint="cash приведённых" tone="cy" />
            <Mini label="Устройства" value={nf.format(stats.devices)} hint="подключено у рефералов" />
          </div>

          <div className="ref-chart-box">
            {chartLoading && <div className="ref-chart-loading">Загружаем воронку…</div>}
            <svg className="anl-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 220 }} role="img" aria-label="Воронка рефералов по периодам">
              {[0, 1, 2, 3].map((k) => {
                const y = PT + (ih * k) / 3;
                return (
                  <g key={k}>
                    <line x1={PL} y1={y} x2={W - PR} y2={y} className="anl-grid" />
                    <text className="anl-axis" x={PL - 6} y={y + 3.4} textAnchor="end">{Math.round(maxBar * (1 - k / 3))}</text>
                    <text className="anl-axis cy" x={W - PR + 6} y={y + 3.4} textAnchor="start">{nf.format(Math.round(maxLine * (1 - k / 3)))}</text>
                  </g>
                );
              })}
              {funnelRows.map((row, i) => {
                const cx = PL + slot * i + slot / 2;
                const bars: { v: number; fill: string; dx: number }[] = [
                  { v: row.clicks, fill: 'var(--deep)', dx: -bw - 1 },
                  { v: row.registrations, fill: 'var(--lime)', dx: 0 },
                  { v: row.purchases, fill: 'var(--cream)', dx: bw + 1 },
                ];
                return (
                  <g key={row.start}>
                    {bars.map((bar) => {
                      if (bar.v <= 0) return null;
                      const h = Math.max(1.5, (bar.v / maxBar) * ih);
                      return (
                        <rect
                          key={bar.fill}
                          x={cx + bar.dx - bw / 2}
                          y={PT + ih - h}
                          width={bw}
                          height={h}
                          rx={1.5}
                          fill={bar.fill}
                        >
                          <title>{`${fmtIsoDay(row.start)} · ${bar.v}`}</title>
                        </rect>
                      );
                    })}
                    {(i % Math.max(1, Math.round(funnelRows.length / 9)) === 0 || i === funnelRows.length - 1) && (
                      <text className="anl-axis" x={cx} y={H - 8} textAnchor="middle">{fmtIsoDay(row.start)}</text>
                    )}
                    <rect
                      x={PL + slot * i}
                      y={PT}
                      width={slot}
                      height={ih}
                      fill="transparent"
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                    />
                  </g>
                );
              })}
              {funnelRows.length > 1 && (
                <polyline
                  fill="none"
                  stroke="var(--cyan)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  points={funnelRows
                    .map((row, i) => `${(PL + slot * i + slot / 2).toFixed(1)},${(PT + ih - (row.revenue / maxLine) * ih).toFixed(1)}`)
                    .join(' ')}
                />
              )}
            </svg>
            {hovered && (
              <div
                className="ref-tip show"
                style={{ left: `${((PL + slot * (hover ?? 0) + slot / 2) / W) * 100}%`, top: 8 }}
              >
                <span>{fmtIsoDay(hovered.start)}</span>
                <div>Клики: {nf.format(hovered.clicks)}</div>
                <div>Регистрации: {nf.format(hovered.registrations)}</div>
                <div>Покупки: {nf.format(hovered.purchases)}</div>
                <div>Выручка: {rub(hovered.revenue)}</div>
              </div>
            )}
          </div>

          <div className="anl-legend" style={{ marginTop: 12 }}>
            <span><i className="org" />Клики</span>
            <span><i className="ref" />Регистрации</span>
            <span><i className="cream" />Покупки</span>
            <span><i className="cy" />Выручка</span>
          </div>
        </div>
      </section>

      <section className="anl-sec" id="ref-partners">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Партнёры</span>
            <h2>Партнёрские аккаунты и ставки</h2>
          </div>
          <button type="button" className="anl-btn" onClick={exportCsv}>Экспорт</button>
        </div>
        <div className="anl-card">
          {partners.length === 0 ? (
            <div className="ref-empty">
              <span className="ref-empty-ic"><Users size={22} /></span>
              <b>Партнёров пока нет</b>
              <p>Партнёр появляется здесь после первого клика по его ссылке, реферала или начисления.</p>
            </div>
          ) : (
            <div className="anl-tbl-wrap">
              <table className="anl-tbl ref-tbl wide">
                <thead>
                  <tr>
                    <th>Партнёр</th>
                    <th>Код / ссылка</th>
                    <th className="num">Клики</th>
                    <th className="num">Рег.</th>
                    <th className="num">Оплаты</th>
                    <th className="num">Оборот</th>
                    <th className="num">Начислено</th>
                    <th className="num">Баланс</th>
                    <th style={{ textAlign: 'right' }}>Ставка</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span className="ref-who">
                          <span className="ref-who-av cy">{p.name.slice(0, 1).toUpperCase()}</span>
                          <span>
                            <b>{p.name}</b>
                            <span>{p.contact}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="ref-code">{p.code ?? '—'}</span>
                        <button type="button" className="ref-ibtn" title="Скопировать ссылку" onClick={() => void copyLink(p.code)}>
                          <Link2 size={13} />
                        </button>
                      </td>
                      <td className="num">{nf.format(p.clicks)}</td>
                      <td className="num">{nf.format(p.regs)}</td>
                      <td className="num">{nf.format(p.purchases)}</td>
                      <td className="num">{p.revenue > 0 ? rub(p.revenue) : '—'}</td>
                      <td className="num lime">{p.accrued > 0 ? rub(p.accrued) : '—'}</td>
                      <td className="num">{p.balance > 0 ? rub(p.balance) : '—'}</td>
                      <td>
                        <div className="ref-acts">
                          <button
                            type="button"
                            className="anl-btn small"
                            onClick={() => {
                              const baseKind = p.customKind === 'percent' || p.customKind === 'fixed' ? p.customKind : settings.inviterKind;
                              const baseValue = p.customReward ?? settings.inviterValue;
                              setModal({
                                title: `Ставка партнёра ${p.name}`,
                                body: (
                                  <RateEditor
                                    initialKind={baseKind}
                                    initialValue={String(baseValue)}
                                    custom={p.customReward !== null}
                                    onSave={(nextKind, value) => void saveRate(p, nextKind, value)}
                                    onReset={() => void saveRate(p, 'fixed', null)}
                                  />
                                ),
                                actions: [],
                              });
                            }}
                          >
                            {rateLabel(p)}
                          </button>
                          <Link className="ref-ibtn" href={`/admin/users/${p.id}`} title="Открыть профиль">→</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="anl-sec" id="ref-accruals">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Журнал</span>
            <h2>Начисления наград</h2>
          </div>
          <span className="anl-pill dim">записей: <b className="lime">{nf.format(initial.accruals.length)}</b></span>
        </div>
        <div className="anl-grid-2">
          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Последние начисления</h3>
                <p>Деньги и дни по журналу wallet_tx</p>
              </div>
            </div>
            {initial.accruals.length === 0 ? (
              <p className="anl-empty">Начислений ещё не было.</p>
            ) : (
              <div className="anl-list">
                {initial.accruals.map((row) => {
                  const isDays = row.reason === 'referral_days';
                  const negative = row.amount < 0;
                  return (
                    <div className="anl-row" key={row.id}>
                      <span className={`ref-journal-ic${isDays ? ' days' : negative ? ' neg' : ''}`}>
                        {isDays ? <CalendarDays size={15} /> : negative ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />}
                      </span>
                      <span className="anl-row-t">
                        <b>{row.userName}</b>
                        <span>{REASON_LABEL[row.reason] ?? row.reason} · {fmtDateTime(row.createdAt)}</span>
                      </span>
                      <span className={`anl-num ${isDays ? 'lime' : negative ? 'dim' : 'lime'}`}>
                        {isDays ? 'дни' : `${negative ? '−' : '+'}${rub(Math.abs(row.amount))}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Награды по неделям</h3>
                <p>Денежные начисления, 8 недель</p>
              </div>
            </div>
            <svg className="anl-chart" viewBox="0 0 420 180" preserveAspectRatio="none" style={{ height: 180 }} role="img" aria-label="Денежные начисления по неделям">
              {[0, 1, 2].map((k) => {
                const y = 14 + (140 * k) / 2;
                return <line key={k} x1={26} y1={y} x2={410} y2={y} className="anl-grid" />;
              })}
              {initial.weekly.map((week, i) => {
                const slotW = (420 - 26 - 10) / Math.max(1, initial.weekly.length);
                const cx = 26 + slotW * i + slotW / 2;
                const h = week.money > 0 ? Math.max(2, (week.money / maxWeekly) * 140) : 0;
                return (
                  <g key={week.week}>
                    {h > 0 && (
                      <rect x={cx - 11} y={14 + 140 - h} width={22} height={h} rx={4} fill="var(--lime)">
                        <title>{`${ddmm(week.week)} · ${rub(week.money)}`}</title>
                      </rect>
                    )}
                    <text className="anl-axis" x={cx} y={172} textAnchor="middle">{ddmm(week.week)}</text>
                  </g>
                );
              })}
            </svg>
            <div className="anl-kv" style={{ marginTop: 12 }}><span>Начислено денег всего</span><b className="lime">{rub(accruedTotal)}</b></div>
            <div className="anl-kv"><span>Дней на балансах пользователей</span><b>{nf.format(initial.totals.daysOnBalances)}</b></div>
            <div className="anl-kv"><span>Средняя денежная награда</span><b>{rub(accruedTotal / Math.max(1, partners.filter((p) => p.accrued > 0).length))}</b></div>
          </div>
        </div>
      </section>

      {modal && (
        <div className="ref-overlay open" role="dialog" aria-modal="true" aria-label={modal.title} onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="ref-modal">
            <div className="ref-modal-h">
              <h3>{modal.title}</h3>
              <button type="button" className="ref-ibtn" aria-label="Закрыть" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div>{modal.body}</div>
            {modal.actions.length > 0 && (
              <div className="ref-modal-actions">
                {modal.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={action.cls}
                    disabled={action.disabled || busy !== null}
                    onClick={() => void action.onClick()}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="ref-toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`ref-toast ${item.kind}`}>
            <span className="ref-toast-i">{item.kind === 'err' ? '!' : item.kind === 'warn' ? '!' : '✓'}</span>
            <span>{item.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rate editor inside the modal: kind + value, or reset to the global rate. */
function RateEditor({
  initialKind,
  initialValue,
  custom,
  onSave,
  onReset,
}: {
  initialKind: 'percent' | 'fixed';
  initialValue: string;
  custom: boolean;
  onSave: (kind: 'percent' | 'fixed', value: number) => void;
  onReset: () => void;
}) {
  const [kind, setKind] = useState<'percent' | 'fixed'>(initialKind);
  const [value, setValue] = useState(initialValue);

  return (
    <div>
      <div className="ref-form-2">
        <label className="ref-field">
          <span>Тип ставки</span>
          <select className="ref-select" value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'fixed')}>
            <option value="percent">Процент с оплаты</option>
            <option value="fixed">Фикс. сумма, ₽</option>
          </select>
        </label>
        <label className="ref-field">
          <span>Значение</span>
          <input className="ref-input" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <div className="ref-preview">
        {custom
          ? 'Личная ставка перекрывает глобальную. Изменение применяется к новым оплатам.'
          : 'Сейчас действует глобальная ставка. Личная ставка перекроет её для этого партнёра.'}
      </div>
      <div className="ref-modal-actions">
        <button type="button" className="anl-btn" onClick={() => onSave(kind, Math.max(0, Number(value) || 0))}>
          Сохранить ставку
        </button>
        {custom && (
          <button type="button" className="anl-btn danger" onClick={onReset}>
            Сбросить на глобальную
          </button>
        )}
      </div>
    </div>
  );
}
