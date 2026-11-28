// /admin/analytics — template-styled dashboard over real data.
//
// The page is server-rendered: the period (7/30/90) and the cohort channel are
// URL params, so every number is computed on the server and the browser gets
// plain HTML + SVG (no chart library, no client state). Data comes from
// loadAdminAnalytics (lib/admin-analytics.ts), which reuses the analytics
// derivation core (MRR, LTV, margin, funnel, timings, cohorts) and adds the
// per-day series, partners, promos and trials the template needs.
//
// The role gate is repeated here on purpose: a directly fetched RSC payload
// skips layouts, so the page must enforce administrator/manager itself.
import type { ComponentType } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  KeyRound,
  Link2,
  MonitorSmartphone,
  Tag,
  Ticket,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import {
  loadAdminAnalytics,
  type AdminAnalytics,
  type AnalyticsPeriod,
  type CohortRow,
  type DayRegistrations,
  type DayRevenue,
} from '@/lib/admin-analytics';
import type { ChannelFilter } from '@/lib/analytics/cohorts';

export const dynamic = 'force-dynamic';

const nf = new Intl.NumberFormat('ru-RU');
const pctFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const rub = (n: number) => `${nf.format(Math.round(n))} ₽`;
const rubOr = (n: number | null) => (n == null ? '—' : rub(n));
const pctOf = (n: number | null) => (n == null ? '—' : `${pctFmt.format(n * 100)}%`);
const ddmm = (label: string) => `${label.slice(8, 10)}.${label.slice(5, 7)}`;

const PERIOD_LABEL: Record<AnalyticsPeriod, string> = { 7: '7 дней', 30: '30 дней', 90: '90 дней' };
const CHANNEL_LABEL: Record<ChannelFilter, string> = {
  all: 'Все',
  referral: 'Реферал',
  promo: 'Промокод',
  organic: 'Органика',
};

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;

function Spark({ values, tone = '' }: { values: number[]; tone?: '' | 'cy' | 'am' }) {
  if (values.length < 2) return null;
  const w = 70;
  const h = 26;
  const max = Math.max(1, ...values);
  const pts = values.map(
    (v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`,
  );
  return (
    <svg className={`anl-spark ${tone}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} />
      <path d={`M${pts.join(' L')}`} />
    </svg>
  );
}

function deltaOf(current: number, previous: number): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (previous === 0) return { text: current > 0 ? 'новые за период' : 'нет данных', dir: 'flat' };
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 0.5) return { text: 'как в пред. периоде', dir: 'flat' };
  return {
    text: `${diff > 0 ? '+' : '−'}${pctFmt.format(Math.abs(diff))}% к пред.`,
    dir: diff > 0 ? 'up' : 'down',
  };
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  spark,
  tone = '',
}: {
  icon: Icon;
  label: string;
  value: string;
  sub: string;
  delta?: { text: string; dir: 'up' | 'down' | 'flat' };
  spark?: number[];
  tone?: '' | 'cy' | 'am';
}) {
  return (
    <div className="anl-kpi">
      <div className="anl-kpi-top">
        <span className={`anl-ic ${tone}`}>
          <Icon size={14} strokeWidth={2} />
        </span>
        <span className="anl-lbl">{label}</span>
      </div>
      <b>{value}</b>
      <span className="anl-kpi-sub">{sub}</span>
      <div className="anl-kpi-foot">
        {delta ? (
          <span className={`anl-delta ${delta.dir}`}>
            {delta.dir === 'up' && <ArrowUpRight size={11} strokeWidth={2.6} />}
            {delta.dir === 'down' && <ArrowDownRight size={11} strokeWidth={2.6} />}
            {delta.text}
          </span>
        ) : (
          <span />
        )}
        {spark ? <Spark values={spark} tone={tone === 'cy' ? 'cy' : tone === 'am' ? 'am' : ''} /> : null}
      </div>
    </div>
  );
}

function Mini({ label, value, hint, tone = '' }: { label: string; value: string; hint: string; tone?: '' | 'cy' | 'am' }) {
  return (
    <div className={`anl-mini ${tone}`}>
      <span className="anl-lbl">{label}</span>
      <b>{value}</b>
      <span className="anl-mini-h">{hint}</span>
    </div>
  );
}

function RegistrationChart({ series }: { series: DayRegistrations[] }) {
  const W = 720;
  const H = 230;
  const PL = 30;
  const PR = 10;
  const PT = 14;
  const PB = 26;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  const days = Math.max(1, series.length);
  const max = Math.max(2, ...series.map((d) => d.total)) * 1.2;
  const slot = iw / days;
  const bw = Math.max(2, Math.min(14, slot * 0.62));
  const every = Math.max(1, Math.round(days / 8));

  return (
    <svg
      className="anl-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height: 230 }}
      role="img"
      aria-label="Регистрации по дням с разбивкой по каналам"
    >
      {[0, 1, 2, 3].map((k) => {
        const y = PT + (ih * k) / 3;
        return (
          <g key={k}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} className="anl-grid" />
            <text className="anl-axis" x={PL - 6} y={y + 3.4} textAnchor="end">
              {Math.round(max * (1 - k / 3))}
            </text>
          </g>
        );
      })}
      {series.map((day, i) => {
        const cx = PL + slot * i + slot / 2;
        let y = PT + ih;
        const segs: { cls: string; value: number; name: string }[] = [
          { cls: 'org', value: day.organic, name: 'Органика' },
          { cls: 'ref', value: day.referral, name: 'Реферал' },
          { cls: 'prm', value: day.promo, name: 'Промокод' },
        ];
        return (
          <g key={day.day}>
            {segs.map((seg) => {
              if (seg.value <= 0) return null;
              const h = (seg.value / max) * ih;
              y -= h;
              return (
                <rect key={seg.cls} className={`anl-seg ${seg.cls}`} x={cx - bw / 2} y={y} width={bw} height={h} rx={2}>
                  <title>{`${ddmm(day.day)} · ${seg.name}: ${seg.value}`}</title>
                </rect>
              );
            })}
            {(i % every === 0 || i === days - 1) && (
              <text className="anl-axis" x={cx} y={H - 8} textAnchor="middle">
                {ddmm(day.day)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function RevenueChart({ series }: { series: DayRevenue[] }) {
  const W = 720;
  const H = 230;
  const PL = 44;
  const PR = 40;
  const PT = 14;
  const PB = 26;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  const days = Math.max(1, series.length);
  const maxBar = Math.max(100, ...series.map((d) => d.cash)) * 1.2;
  const maxLine = Math.max(100, ...series.map((d) => d.cumulative)) * 1.15;
  const slot = iw / days;
  const bw = Math.max(2, Math.min(13, slot * 0.55));
  const every = Math.max(1, Math.round(days / 8));
  const points = series
    .map((d, i) => `${(PL + slot * i + slot / 2).toFixed(1)},${(PT + ih - (d.cumulative / maxLine) * ih).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      className="anl-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ height: 230 }}
      role="img"
      aria-label="Выручка по дням и накопительный итог"
    >
      {[0, 1, 2, 3].map((k) => {
        const y = PT + (ih * k) / 3;
        return (
          <g key={k}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} className="anl-grid" />
            <text className="anl-axis" x={PL - 7} y={y + 3.4} textAnchor="end">
              {nf.format(Math.round(maxBar * (1 - k / 3)))}
            </text>
            <text className="anl-axis cy" x={W - PR + 7} y={y + 3.4} textAnchor="start">
              {nf.format(Math.round(maxLine * (1 - k / 3)))}
            </text>
          </g>
        );
      })}
      {series.map((day, i) => {
        const cx = PL + slot * i + slot / 2;
        const h = day.cash > 0 ? Math.max(2, (day.cash / maxBar) * ih) : 0;
        return (
          <g key={day.day}>
            {h > 0 && (
              <rect className="anl-seg bar" x={cx - bw / 2} y={PT + ih - h} width={bw} height={h} rx={3}>
                <title>{`${ddmm(day.day)} · оплаты ${rub(day.cash)}`}</title>
              </rect>
            )}
            {(i % every === 0 || i === days - 1) && (
              <text className="anl-axis" x={cx} y={H - 8} textAnchor="middle">
                {ddmm(day.day)}
              </text>
            )}
          </g>
        );
      })}
      {series.length > 1 && (
        <polyline className="anl-line" points={points} fill="none" strokeDasharray="5 4">
          <title>Накопительный итог за период</title>
        </polyline>
      )}
    </svg>
  );
}

function DeviceDonut({ used, free }: { used: number; free: number }) {
  const total = used + free;
  const R = 54;
  const C = 2 * Math.PI * R;
  const usedLen = total > 0 ? (used / total) * C : 0;
  return (
    <div className="anl-donut">
      <svg viewBox="0 0 132 132" aria-hidden="true">
        <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="14" />
        {usedLen > 0 && (
          <circle
            cx="66"
            cy="66"
            r={R}
            fill="none"
            stroke="var(--lime)"
            strokeWidth="14"
            strokeDasharray={`${usedLen.toFixed(2)} ${(C - usedLen).toFixed(2)}`}
          />
        )}
      </svg>
      <div className="anl-donut-ct">
        <b>{nf.format(total)}</b>
        <span>слотов</span>
      </div>
    </div>
  );
}

function FunnelBar({ label, count, width, note }: { label: string; count: string; width: number; note: string }) {
  return (
    <div className="anl-fn">
      <span className="anl-fn-label">{label}</span>
      <span className="anl-fn-bar">
        <i style={{ width: `${Math.max(4, Math.min(100, width))}%` }} />
        <b>{count}</b>
      </span>
      <span className="anl-fn-value">{note}</span>
    </div>
  );
}

function CohortTable({ cohorts }: { cohorts: CohortRow[] }) {
  if (cohorts.length === 0) {
    return <p className="anl-empty">За последние 12 месяцев когорт с регистрациями нет.</p>;
  }
  const maxOffset = cohorts.reduce<number>((max, cohort) => {
    return cohort.retained.reduce<number>((last, value, index) => (value != null ? index : last), max);
  }, 0);

  return (
    <div className="anl-coh-wrap">
      <table className="anl-coh">
        <caption className="anl-sr">Когортная матрица удержания по регистрациям</caption>
        <thead>
          <tr>
            <th scope="col">Месяц</th>
            <th scope="col" className="num">Размер</th>
            {Array.from({ length: maxOffset + 1 }, (_, i) => (
              <th key={i} scope="col">M{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort.month}>
              <th scope="row" className="mono">
                {cohort.month.slice(5, 7)}.{cohort.month.slice(0, 4)}
              </th>
              <td className="num">{nf.format(cohort.size)}</td>
              {cohort.retained.slice(0, maxOffset + 1).map((value, index) => {
                if (value == null) {
                  return (
                    <td key={index}>
                      <span className="anl-cell empty">—</span>
                    </td>
                  );
                }
                const ratio = cohort.size > 0 ? value / cohort.size : 0;
                return (
                  <td key={index}>
                    <span
                      className="anl-cell"
                      style={{ background: `linear-gradient(rgba(183,255,69,${(0.05 + ratio * 0.55).toFixed(3)}),rgba(183,255,69,${(0.02 + ratio * 0.18).toFixed(3)}))` }}
                      title={`${cohort.month.slice(5, 7)}.${cohort.month.slice(0, 4)} · M${index}: ${value} из ${cohort.size}`}
                    >
                      <b>{pctFmt.format(ratio * 100)}%</b>
                      <em>{value}/{cohort.size}</em>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function seconds(ms: number | null): string {
  if (ms == null) return '—';
  return `${pctFmt.format(ms / 1000)} сек`;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; regCh?: string }>;
} = {}) {
  try {
    await requireRole('administrator', 'manager');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const params = await (searchParams ??
    Promise.resolve({} as { period?: string; regCh?: string }));
  const rawPeriod = Number(params.period ?? 30);
  const period: AnalyticsPeriod = rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30;
  const channel: ChannelFilter = (['all', 'referral', 'promo', 'organic'] as const).includes(
    (params.regCh ?? 'all') as ChannelFilter,
  )
    ? ((params.regCh ?? 'all') as ChannelFilter)
    : 'all';

  const data: AdminAnalytics = await loadAdminAnalytics(period, channel);
  const k = data.kpi;

  const href = (next: { period?: AnalyticsPeriod; regCh?: ChannelFilter }) => {
    const sp = new URLSearchParams();
    sp.set('period', String(next.period ?? period));
    const ch = next.regCh ?? channel;
    if (ch !== 'all') sp.set('regCh', ch);
    return `/admin/analytics?${sp.toString()}`;
  };

  const regDelta = deltaOf(k.registrations, k.prevRegistrations);
  const revenueDelta = deltaOf(k.revenue, k.prevRevenue);
  const updated = new Date(data.generatedAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
  const coverage =
    data.money && data.money.coverageTotal > 0
      ? `${nf.format(data.money.coverageKnown)} из ${nf.format(data.money.coverageTotal)}`
      : '—';

  const kpiCards: {
    label: string;
    value: string;
    sub: string;
    icon: Icon;
    delta?: { text: string; dir: 'up' | 'down' | 'flat' };
    spark?: number[];
    tone?: '' | 'cy' | 'am';
  }[] = [
    {
      label: 'Регистраций',
      value: nf.format(k.registrations),
      sub: `${nf.format(data.regSeries.reduce((s, d) => s + d.organic, 0))} органика · ${nf.format(k.referrals)} реферал · ${nf.format(data.regSeries.reduce((s, d) => s + d.promo, 0))} промо`,
      icon: Users,
      delta: regDelta,
      spark: data.regSeries.map((d) => d.total),
    },
    {
      label: 'Активных подписок',
      value: nf.format(k.activeKeys),
      sub: `${nf.format(k.activeUsers)} пользователей с активным ключом`,
      icon: KeyRound,
      spark: data.activeSeries.length > 1 ? data.activeSeries.map((d) => d.keys) : undefined,
      tone: 'cy',
    },
    {
      label: 'Всего пользователей',
      value: nf.format(k.totalUsers),
      sub: 'аккаунтов за всё время',
      icon: UserCheck,
    },
    {
      label: 'Устройств',
      value: nf.format(k.devices),
      sub: `из ${nf.format(k.deviceSlots)} слотов в активных ключах`,
      icon: MonitorSmartphone,
      tone: 'cy',
    },
    {
      label: 'Средний доход (ARPPU)',
      value: rubOr(k.arppu),
      sub: 'на платящего за период',
      icon: Wallet,
      tone: 'am',
    },
    {
      label: 'Выручка за период',
      value: rub(k.revenue),
      sub: `${nf.format(k.paidOrdersInWindow)} оплаченных заказов`,
      icon: CreditCard,
      delta: revenueDelta,
      spark: data.revenueSeries.map((d) => d.cash),
    },
    {
      label: 'Доход от партнёров',
      value: rub(k.partnerRevenue),
      sub: k.revenue > 0 ? `${pctFmt.format((k.partnerRevenue / k.revenue) * 100)}% выручки периода` : 'партнёрских оплат нет',
      icon: Link2,
      tone: 'cy',
    },
    {
      label: 'Рефералов',
      value: nf.format(k.referrals),
      sub: `${nf.format(k.refClicks)} кликов по ссылкам`,
      icon: Users,
    },
    {
      label: 'Применений промокодов',
      value: nf.format(k.promoUses),
      sub: `скидка ${rub(k.promoDiscount)} за период`,
      icon: Tag,
      tone: 'am',
    },
    {
      label: 'Триал-ключей',
      value: nf.format(k.trialIssued),
      sub: `${nf.format(k.trialActive)} активны сейчас · всего выдано ${nf.format(k.trialTotal)}`,
      icon: Ticket,
      tone: 'cy',
    },
  ];

  const paidBase = data.funnel.steps[0]?.count ?? 0;
  const payConv = paidBase > 0 ? data.funnel.paid / paidBase : null;
  const trialConv = k.trialTotal > 0 ? k.trialConverted / k.trialTotal : null;
  const promoShare = k.paidOrdersInWindow > 0 ? k.promoUses / k.paidOrdersInWindow : null;
  const avgDiscount = k.promoUses > 0 ? k.promoDiscount / k.promoUses : 0;
  const maxPromoUses = Math.max(1, ...data.promos.rows.map((r) => r.uses));

  return (
    <div className="anl">
      <header className="anl-head">
        <div className="anl-head-text">
          <span className="anl-kick">
            Аналитика · {ddmm(data.window.from)} — {ddmm(data.window.to)} · МСК
          </span>
          <h2>Ключевые метрики продукта</h2>
          <p>
            Регистрации, активные подписки, устройства, доходы, партнёры, промокоды, триалы и воронка
            платежей — на реальных данных за выбранный период.
          </p>
        </div>
        <div className="anl-head-side">
          <div className="anl-pills">
            <span className="anl-pill ok">
              <i /> MRR {data.money ? rub(data.money.mrr) : '—'}
            </span>
            <span className="anl-pill info">
              <i /> {nf.format(k.activeKeys)} активных подписок
            </span>
            <span className="anl-pill dim">обновлено {updated} МСК</span>
          </div>
          <div className="anl-tools">
            <div className="anl-seg" role="group" aria-label="Период статистики">
              {([7, 30, 90] as AnalyticsPeriod[]).map((p) => (
                <Link key={p} href={href({ period: p })} className={p === period ? 'on' : ''} scroll={false}>
                  {PERIOD_LABEL[p]}
                </Link>
              ))}
            </div>
            <a className="anl-btn" href={`/api/admin/analytics/export?period=${period}`}>
              Экспорт CSV
            </a>
          </div>
        </div>
      </header>

      <nav className="anl-subnav" aria-label="Разделы аналитики">
        {[
          ['anl-kpi', 'Метрики'],
          ['anl-growth', 'Рост'],
          ['anl-revenue', 'Доходы'],
          ['anl-partners', 'Партнёры'],
          ['anl-promos', 'Промокоды'],
          ['anl-trials', 'Триалы'],
          ['anl-funnel', 'Платежи'],
          ['anl-cohorts', 'Когорты'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <section className="anl-sec" id="anl-kpi">
        <div className="anl-kpis">
          {kpiCards.map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>
        <div className="anl-strip">
          <Mini label="MRR" value={data.money ? rub(data.money.mrr) : '—'} hint={`${nf.format(k.activeKeys)} платящих подписок`} />
          <Mini label="ARR" value={data.money ? rub(data.money.arr) : '—'} hint="MRR × 12" />
          <Mini label="ARPU" value={data.money ? rubOr(data.money.arpu) : '—'} hint={`на ${nf.format(k.totalUsers)} пользователей`} />
          <Mini label="ARPPU" value={rubOr(k.arppu)} hint={`${nf.format(k.paidOrdersInWindow)} оплат в периоде`} />
          <Mini label="Покрытие себестоимости" value={coverage} hint="заказы с известной себестоимостью" tone="cy" />
        </div>
      </section>

      <section className="anl-sec" id="anl-growth">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Рост</span>
            <h2>Регистрации и активность</h2>
          </div>
          <div className="anl-legend">
            <span><i className="org" />Органика</span>
            <span><i className="ref" />Реферал</span>
            <span><i className="prm" />Промокод</span>
          </div>
        </div>
        <div className="anl-grid-2">
          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Регистрации по дням</h3>
                <p>Разбивка по каналам привлечения</p>
              </div>
              <span className="anl-pill ok"><i />{nf.format(k.registrations)} за период</span>
            </div>
            <RegistrationChart series={data.regSeries} />
          </div>

          <div className="anl-col">
            <div className="anl-card">
              <div className="anl-card-h">
                <div>
                  <h3>Активные подписки</h3>
                  <p>Ключи с оплаченным сроком на сейчас</p>
                </div>
              </div>
              <div className="anl-bignum">
                {nf.format(k.activeKeys)}
                <small>ключей</small>
              </div>
              <div className="anl-kv"><span>Пользователей с активным ключом</span><b>{nf.format(k.activeUsers)}</b></div>
              <div className="anl-kv"><span>Подключённых устройств</span><b>{nf.format(k.devices)}</b></div>
              <div className="anl-kv">
                <span>Активных ключей по ночному rollup</span>
                <b>
                  {data.activeSeries.length > 0
                    ? `${nf.format(data.activeSeries[data.activeSeries.length - 1].keys)} на ${ddmm(data.activeSeries[data.activeSeries.length - 1].day)}`
                    : '—'}
                </b>
              </div>
            </div>

            <div className="anl-card">
              <div className="anl-card-h">
                <div>
                  <h3>Устройства</h3>
                  <p>Занятые слоты в активных ключах</p>
                </div>
              </div>
              <div className="anl-donut-wrap">
                <DeviceDonut used={k.devices} free={Math.max(0, k.deviceSlots - k.devices)} />
                <div className="anl-dlist">
                  <div className="anl-dl"><i className="lime" /><span>Занято</span><b>{nf.format(k.devices)}</b></div>
                  <div className="anl-dl"><i className="dim" /><span>Свободно</span><b>{nf.format(Math.max(0, k.deviceSlots - k.devices))}</b></div>
                  <div className="anl-dl"><i className="cy" /><span>Слотов всего</span><b>{nf.format(k.deviceSlots)}</b></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="anl-sec" id="anl-revenue">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Деньги</span>
            <h2>Доходы и юнит-экономика</h2>
          </div>
          <span className="anl-pill dim">
            выручка периода: <b className="lime">{rub(k.revenue)}</b>
          </span>
        </div>
        <div className="anl-grid-2">
          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Выручка и накопленный итог</h3>
                <p>Столбцы — оплаты по дням, линия — накопительный итог периода</p>
              </div>
              <div className="anl-legend">
                <span><i className="bar" />Оплаты</span>
                <span><i className="cy" />Итог</span>
              </div>
            </div>
            <RevenueChart series={data.revenueSeries} />
          </div>

          <div className="anl-col">
            <div className="anl-card">
              <div className="anl-card-h">
                <div>
                  <h3>Юнит-экономика</h3>
                  <p>LTV — по всем оплатам, маржа — за период</p>
                </div>
              </div>
              <div className="anl-kv"><span>LTV gross исторический</span><b>{rubOr(data.unit?.ltvGross ?? null)}</b></div>
              <div className="anl-kv"><span>LTV прогнозный</span><b>{rubOr(data.unit?.ltvPredictive ?? null)}</b></div>
              <div className="anl-kv"><span>LTV net (за вычетом себестоимости)</span><b>{rubOr(data.unit?.ltvNet ?? null)}</b></div>
              <div className="anl-kv"><span>Валовая маржа за период</span><b>{rubOr(data.unit?.margin ?? null)}</b></div>
              <div className="anl-kv"><span>Маржинальность</span><b>{pctOf(data.unit?.marginPct ?? null)}</b></div>
              <div className="anl-kv"><span>Расход на ключ</span><b>{rubOr(data.unit?.costPerKey ?? null)}</b></div>
              <div className="anl-kv"><span>Активных платящих</span><b>{data.unit ? nf.format(data.unit.activePayers) : '—'}</b></div>
            </div>

            <div className="anl-card">
              <div className="anl-card-h">
                <div>
                  <h3>MRR-движение</h3>
                  <p>{data.mrrMove ? `${data.mrrMove.month.slice(5, 7)}.${data.mrrMove.month.slice(0, 4)}` : 'нет оплаченных подписок'}</p>
                </div>
              </div>
              {data.mrrMove ? (
                <>
                  <div className="anl-kv"><span>Новые подписки</span><b className="lime">+{rub(data.mrrMove.added)}</b></div>
                  <div className="anl-kv"><span>Расширение</span><b className="lime">+{rub(data.mrrMove.expansion)}</b></div>
                  <div className="anl-kv"><span>Сокращение</span><b className="dim">−{rub(data.mrrMove.contraction)}</b></div>
                  <div className="anl-kv"><span>Отток</span><b className="dim">−{rub(data.mrrMove.churned)}</b></div>
                  <div className="anl-kv"><span>Чистое изменение</span><b className={data.mrrMove.net >= 0 ? 'lime' : 'dim'}>{data.mrrMove.net >= 0 ? '+' : '−'}{rub(Math.abs(data.mrrMove.net))}</b></div>
                </>
              ) : (
                <p className="anl-empty">Оплаченных подписок ещё нет.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="anl-sec" id="anl-partners">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Партнёрская программа</span>
            <h2>Доходы от партнёров и рефералы</h2>
          </div>
          <span className="anl-pill info"><i />{rub(k.partnerRevenue)} от партнёров</span>
        </div>
        <div className="anl-minis">
          <Mini label="Доход от партнёров" value={rub(data.partners.revenue)} hint="оплаты приведённых пользователей" />
          <Mini label="Рефералов приведено" value={nf.format(data.partners.regs)} hint={`из ${nf.format(data.partners.clicks)} кликов`} />
          <Mini label="Партнёров с оплатами" value={nf.format(data.partners.rows.filter((p) => p.revenue > 0).length)} hint={`всего в выборке ${nf.format(data.partners.rows.length)}`} tone="cy" />
          <Mini label="Начислено партнёрам" value={rub(data.partners.accrued)} hint={`к выплате ${rub(data.partners.pendingWithdrawals)}`} tone="am" />
        </div>
        <div className="anl-grid-2">
          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Реферальная воронка</h3>
                <p>Клики по ссылкам → регистрации → оплатившие</p>
              </div>
            </div>
            <div className="anl-funnel">
              <FunnelBar label="Клики по ссылкам" count={nf.format(data.partners.clicks)} width={100} note="100%" />
              <FunnelBar
                label="Регистрации"
                count={nf.format(data.partners.regs)}
                width={data.partners.clicks > 0 ? (data.partners.regs / data.partners.clicks) * 100 : 0}
                note={data.partners.clicks > 0 ? `${pctFmt.format((data.partners.regs / data.partners.clicks) * 100)}%` : '—'}
              />
              <FunnelBar
                label="Оплатившие"
                count={nf.format(data.partners.payers)}
                width={data.partners.regs > 0 ? (data.partners.payers / data.partners.regs) * 100 : 0}
                note={data.partners.regs > 0 ? `${pctFmt.format((data.partners.payers / data.partners.regs) * 100)}%` : '—'}
              />
            </div>
            <p className="anl-hint">Атрибуция — по `referredById`: оплаты приведённых пользователей за период.</p>
          </div>

          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Топ партнёров</h3>
                <p>По привлечённой выручке за период</p>
              </div>
            </div>
            {data.partners.rows.length === 0 ? (
              <p className="anl-empty">Реферальных регистраций и кликов за период нет.</p>
            ) : (
              <div className="anl-list">
                {data.partners.rows.map((partner) => (
                  <div className="anl-row" key={partner.id}>
                    <span className="anl-row-ic">{partner.name.slice(0, 1).toUpperCase()}</span>
                    <span className="anl-row-t">
                      <b>{partner.name}</b>
                      <span className="mono">
                        {partner.code ?? `#${partner.id}`} · кликов {partner.clicks} · рег {partner.regs}
                      </span>
                    </span>
                    <span className={`anl-num ${partner.revenue > 0 ? 'lime' : 'dim'}`}>
                      {partner.revenue > 0 ? rub(partner.revenue) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="anl-sec" id="anl-promos">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Маркетинг</span>
            <h2>Статистика по промокодам</h2>
          </div>
          <Link className="anl-btn" href="/admin/promos">Открыть реестр промокодов</Link>
        </div>
        <div className="anl-minis">
          <Mini label="Применений за период" value={nf.format(data.promos.uses)} hint={`${nf.format(data.promos.rows.filter((r) => r.uses > 0).length)} кодов задействовано`} />
          <Mini label="Списано скидкой" value={rub(data.promos.discount)} hint={`средняя скидка ${rub(avgDiscount)}`} tone="am" />
          <Mini label="Выручка с промокодами" value={rub(data.promos.revenue)} hint={k.revenue > 0 ? `${pctFmt.format((data.promos.revenue / k.revenue) * 100)}% выручки периода` : '—'} tone="cy" />
          <Mini label="Доля заказов с промокодом" value={pctOf(promoShare)} hint={`${nf.format(k.promoUses)} из ${nf.format(k.paidOrdersInWindow)} оплат`} />
        </div>
        <div className="anl-grid-2">
          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Применения по кодам</h3>
                <p>Скидка, применения и выручка по каждому коду</p>
              </div>
            </div>
            <div className="anl-tbl-wrap">
              <table className="anl-tbl">
                <thead>
                  <tr>
                    <th scope="col">Код</th>
                    <th scope="col">Скидка</th>
                    <th scope="col" className="num">Применений</th>
                    <th scope="col" className="num">Выручка</th>
                    <th scope="col" className="num">Сумма скидки</th>
                    <th scope="col">Доля</th>
                  </tr>
                </thead>
                <tbody>
                  {data.promos.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="anl-empty-cell">Промокодов ещё нет.</td>
                    </tr>
                  ) : (
                    data.promos.rows.map((row) => (
                      <tr key={row.code}>
                        <td><span className="anl-code">{row.code}</span></td>
                        <td className="num">{row.type === 'fixed' ? `−${nf.format(row.discount)} ₽` : `−${nf.format(row.discount)}%`}</td>
                        <td className="num">{nf.format(row.uses)}</td>
                        <td className="num">{row.revenue > 0 ? rub(row.revenue) : '—'}</td>
                        <td className="num amber">{row.discountSum > 0 ? `−${rub(row.discountSum)}` : '—'}</td>
                        <td>
                          <span className="anl-progress">
                            <span className="anl-bar"><i style={{ width: `${(row.uses / maxPromoUses) * 100}%` }} /></span>
                            <span className="anl-num">{data.promos.uses > 0 ? pctFmt.format((row.uses / data.promos.uses) * 100) : 0}%</span>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Эффективность скидок</h3>
                <p>Доля оплат с промокодом и цена скидки</p>
              </div>
            </div>
            <div className="anl-meter">
              <div className="anl-meter-top"><span>Заказы с промокодом</span><b>{pctOf(promoShare)}</b></div>
              <div className="anl-bar big"><i style={{ width: `${(promoShare ?? 0) * 100}%` }} /></div>
            </div>
            <div className="anl-kv"><span>Средняя скидка на заказ</span><b>{rub(avgDiscount)}</b></div>
            <div className="anl-kv"><span>Списано скидкой за период</span><b className="amber">{rub(data.promos.discount)}</b></div>
            <div className="anl-kv"><span>Выручка с промокодами</span><b>{rub(data.promos.revenue)}</b></div>
            <div className="anl-kv"><span>Выручка без промокодов</span><b>{rub(Math.max(0, k.revenue - data.promos.revenue))}</b></div>
          </div>
        </div>
      </section>

      <section className="anl-sec" id="anl-trials">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Воронка активации</span>
            <h2>Триал-ключи</h2>
          </div>
          <span className="anl-pill warn"><i />конверсия в оплату {pctOf(trialConv)}</span>
        </div>
        <div className="anl-minis">
          <Mini label="Выдано новым аккаунтам" value={nf.format(data.trials.issuedInWindow)} hint="за выбранный период" />
          <Mini label="Активны сейчас" value={nf.format(data.trials.activeNow)} hint="trial-ключи с неистёкшим сроком" tone="cy" />
          <Mini label="Оплатили после триала" value={nf.format(data.trials.converted)} hint={`из ${nf.format(data.trials.totalUsed)} аккаунтов с триалом`} />
          <Mini label="Конверсия триала" value={pctOf(trialConv)} hint="оплатившие / все, кто брал триал" tone="am" />
        </div>
        <div className="anl-grid-2">
          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Путь триала</h3>
                <p>Выдан → активен → оплатил</p>
              </div>
            </div>
            <div className="anl-funnel">
              <FunnelBar label="Выдано всего" count={nf.format(data.trials.totalUsed)} width={100} note="100%" />
              <FunnelBar
                label="Активен сейчас"
                count={nf.format(data.trials.activeNow)}
                width={data.trials.totalUsed > 0 ? (data.trials.activeNow / data.trials.totalUsed) * 100 : 0}
                note={data.trials.totalUsed > 0 ? `${pctFmt.format((data.trials.activeNow / data.trials.totalUsed) * 100)}%` : '—'}
              />
              <FunnelBar
                label="Оплатил"
                count={nf.format(data.trials.converted)}
                width={data.trials.totalUsed > 0 ? (data.trials.converted / data.trials.totalUsed) * 100 : 0}
                note={pctOf(trialConv)}
              />
            </div>
            <p className="anl-hint">Триалы учитываются по `trialUsed`; активность — по сроку ключа в кэше.</p>
          </div>

          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Последние триал-ключи</h3>
                <p>По времени последней синхронизации</p>
              </div>
            </div>
            <div className="anl-tbl-wrap">
              <table className="anl-tbl">
                <thead>
                  <tr>
                    <th scope="col">Пользователь</th>
                    <th scope="col">Действует до</th>
                    <th scope="col" className="num">Устройств</th>
                    <th scope="col">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trials.rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="anl-empty-cell">Триал-ключей нет.</td>
                    </tr>
                  ) : (
                    data.trials.rows.map((row) => (
                      <tr key={row.keyId}>
                        <td>
                          <b className="anl-user">{row.user}</b>
                          <span className="anl-mono dim">{row.keyId.slice(0, 10)}</span>
                        </td>
                        <td className="mono dim">{row.expiresAt ? ddmm(row.expiresAt) : '—'}</td>
                        <td className="num">{row.devices}{row.deviceLimit ? ` / ${row.deviceLimit}` : ''}</td>
                        <td>
                          <span className={`anl-pill ${row.active ? 'warn' : 'bad'}`}>
                            <i />{row.active ? 'Активен' : 'Истёк'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="anl-sec" id="anl-funnel">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Платежи</span>
            <h2>Воронка платежей и скорость выдачи</h2>
          </div>
          <span className="anl-pill dim">{PERIOD_LABEL[period]} · МСК</span>
        </div>
        <div className="anl-minis">
          <Mini label="Создано заказов" value={nf.format(data.funnel.created)} hint="все заказы периода" />
          <Mini label="Оплачено" value={nf.format(data.funnel.paid)} hint={`конверсия ${pctOf(payConv)}`} />
          <Mini label="Ключ выдан" value={nf.format(data.funnel.steps.find((s) => s.key === 'provisioned')?.count ?? 0)} hint="дошли до выдачи ключа" tone="cy" />
          <Mini label="Просрочено (>24 ч)" value={nf.format(k.overdue)} hint={`ошибок выдачи: ${nf.format(data.funnel.errors)}`} tone="am" />
        </div>
        <div className="anl-grid-2">
          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Шаги оплаты</h3>
                <p>От создания заказа до выданного ключа</p>
              </div>
            </div>
            <div className="anl-funnel">
              {data.funnel.steps.length === 0 ? (
                <p className="anl-empty">Заказов за период не было.</p>
              ) : (
                data.funnel.steps.map((step, index) => (
                  <FunnelBar
                    key={step.key}
                    label={step.label}
                    count={nf.format(step.count)}
                    width={paidBase > 0 ? (step.count / paidBase) * 100 : 0}
                    note={index === 0 ? '100%' : pctOf(step.conversion)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="anl-card">
            <div className="anl-card-h">
              <div>
                <h3>Скорость</h3>
                <p>Медиана по успешным заказам периода</p>
              </div>
            </div>
            <div className="anl-meter">
              <div className="anl-meter-top"><span>Создание → оплата</span><b>{seconds(data.funnel.medianPayMs)}</b></div>
              <div className="anl-bar big"><i style={{ width: `${Math.min(100, ((data.funnel.medianPayMs ?? 0) / 180_000) * 100)}%` }} /></div>
            </div>
            <div className="anl-meter">
              <div className="anl-meter-top"><span>Оплата → ключ</span><b>{seconds(data.funnel.medianProvisionMs)}</b></div>
              <div className="anl-bar big cy"><i style={{ width: `${Math.min(100, ((data.funnel.medianProvisionMs ?? 0) / 60_000) * 100)}%` }} /></div>
            </div>
            <div className="anl-kv"><span>Оплачено заказов</span><b>{nf.format(data.funnel.paid)}</b></div>
            <div className="anl-kv"><span>Ошибок выдачи</span><b>{nf.format(data.funnel.errors)}</b></div>
            <div className="anl-kv"><span>Просрочено (&gt;24 ч)</span><b className="amber">{nf.format(k.overdue)}</b></div>
          </div>
        </div>
      </section>

      <section className="anl-sec" id="anl-cohorts">
        <div className="anl-sec-head">
          <div>
            <span className="anl-kick">Удержание</span>
            <h2>Когорты по регистрации</h2>
          </div>
          <div className="anl-chips">
            {(['all', 'referral', 'promo', 'organic'] as ChannelFilter[]).map((ch) => (
              <Link key={ch} href={href({ regCh: ch })} className={`anl-chip ${ch === channel ? 'on' : ''}`} scroll={false}>
                {CHANNEL_LABEL[ch]}
              </Link>
            ))}
          </div>
        </div>
        <div className="anl-card">
          <div className="anl-card-h">
            <div>
              <h3>Матрица удержания</h3>
              <p>Доля когорты с оплаченным ключом в месяце M(n)</p>
            </div>
            <div className="anl-scale"><span>0%</span><span className="anl-scale-bar" /><span>100%</span></div>
          </div>
          <CohortTable cohorts={data.cohorts} />
          <p className="anl-hint">Когорта — месяц регистрации (МСК). Удержание — наличие оплаченного non-trial ключа в месяце M(n).</p>
        </div>
      </section>

      <footer className="anl-foot">
        <span>Данные: users, orders, keys_cache, promo_codes, referral_clicks, wallet_tx, daily_metrics.</span>
        <span className="mono">окно {data.window.from} → {data.window.to} · МСК</span>
      </footer>
    </div>
  );
}
