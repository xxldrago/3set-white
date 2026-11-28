'use client';

// /admin — dashboard in the template's visual language. Every number comes
// from `/api/admin/overview` (aggregated real queries); sections that live on
// their own pages are linked, never duplicated with fixtures.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Download,
  KeyRound,
  MessageSquare,
  Send,
  Smartphone,
  Tag,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import type { AdminOverview } from '@/lib/admin-overview';

const PERIODS: Array<7 | 30 | 90> = [7, 30, 90];
const nf = new Intl.NumberFormat('ru-RU');

function money(value: number): string {
  return `${nf.format(Math.round(value))} ₽`;
}

/** `dd.mm HH:MM` in Moscow time — identical on server and client. */
const stampFormat = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function stamp(iso: string): string {
  return stampFormat.format(new Date(iso)).replace(',', '');
}

function periodLabel(period: number): string {
  return `${period} дней`;
}

type Toast = { id: number; message: string; type: 'ok' | 'err' };

const DONUT_COLORS = ['#b7ff45', '#8fdc2c', '#63d7c8', '#e4dfd1', '#0c4f36'];

export default function AdminApp({ initial }: { initial: AdminOverview }) {
  const [data, setData] = useState<AdminOverview>(initial);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const showToast = useCallback((message: string, type: Toast['type'] = 'ok') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3200);
  }, []);

  const load = useCallback(
    async (period: 7 | 30 | 90) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/overview?period=${period}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as AdminOverview;
        setData(next);
      } catch {
        showToast('Не удалось загрузить данные', 'err');
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  const switchPeriod = useCallback(
    (period: 7 | 30 | 90) => {
      if (period === data.period || loading) return;
      void load(period);
    },
    [data.period, loading, load],
  );

  // The shell's refresh button re-reads the current window instead of resetting
  // the operator's period selection.
  useEffect(() => {
    const onRefresh = () => void load(data.period);
    window.addEventListener('admin:refresh', onRefresh);
    return () => window.removeEventListener('admin:refresh', onRefresh);
  }, [load, data.period]);

  const exportCsv = useCallback(() => {
    const rows: Array<Array<string | number>> = [
      ['metric', 'value'],
      ['period_days', data.period],
      ['revenue_rub', data.orders.revenue],
      ['paid_orders', data.orders.paid],
      ['avg_check_rub', data.orders.avgCheck],
      ['new_orders', data.orders.newCount],
      ['renew_orders', data.orders.renewCount],
      ['upgrade_orders', data.orders.upgradeCount],
      ['failed_orders', data.orders.failed],
      ['refunded_orders', data.orders.refunded],
      ['users_total', data.users.total],
      ['users_new', data.users.newInPeriod],
      ['keys_active', data.keys.active],
      ['keys_trial', data.keys.trial],
      ['devices', data.keys.devices],
      ['tickets_open', data.tickets.open],
      ['tickets_unread', data.tickets.unread],
      ['referral_clicks', data.funnel.clicks],
      ['referral_registrations', data.funnel.registrations],
      ['referral_purchases', data.funnel.purchases],
      ['referral_revenue_rub', data.funnel.revenue],
      ['api_balance_rub', data.wallet?.balance ?? ''],
    ];
    const csv = rows.map((row) => row.join(';')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `3set-overview-${data.period}d.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    showToast('Отчёт выгружен');
  }, [data, showToast]);

  const revenueSeries = useMemo(() => data.series.map((point) => point.revenue), [data.series]);
  const donutTotal = useMemo(
    () => data.expiryBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
    [data.expiryBuckets],
  );

  return (
    <div className="admin-dash">
      <div className="sec-head">
        <div className="t">
          <span className="kick">Статистика · {periodLabel(data.period)}</span>
          <h2 className="st">Панель управления 3set VPN</h2>
        </div>
        <div className="head-tools">
          <div className="seg" role="group" aria-label="Период статистики">
            {PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                className={data.period === period ? 'on' : ''}
                onClick={() => void switchPeriod(period)}
                disabled={loading}
              >
                {period} дней
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost sm" onClick={exportCsv}>
            <Download size={15} />
            Экспорт
          </button>
          <Link className="btn btn-primary sm" href="/admin/broadcast">
            <Send size={15} />
            Рассылка
          </Link>
        </div>
      </div>

      {loading && <div className="admin-loading" aria-hidden="true" />}

      <div className="kpi-grid">
        <Kpi
          icon={<CreditCard size={15} />}
          label="Выручка"
          value={money(data.orders.revenue)}
          foot={`${data.orders.paid} оплат за период`}
        />
        <Kpi
          icon={<Users size={15} />}
          label="Пользователи"
          value={nf.format(data.users.total)}
          foot={`+${data.users.newInPeriod} за период`}
        />
        <Kpi
          icon={<TrendingUp size={15} />}
          label="Средний чек"
          value={money(data.orders.avgCheck)}
          foot={data.orders.paid > 0 ? `${data.orders.paid} платежей` : 'платежей не было'}
        />
        <Kpi
          icon={<KeyRound size={15} />}
          label="Активные ключи"
          value={nf.format(data.keys.active)}
          foot={`${data.keys.trial} триалов · ${data.keys.expiring7} истекают за 7 дн.`}
        />
        <Kpi
          icon={<Smartphone size={15} />}
          label="Устройства"
          value={nf.format(data.keys.devices)}
          foot={`${nf.format(data.keys.total)} ключей всего`}
        />
        <Kpi
          icon={<Wallet size={15} />}
          label="Баланс ARTEMIDA"
          value={data.wallet ? money(data.wallet.balance) : '—'}
          foot={
            data.wallet
              ? `порог ${money(data.walletThreshold)}`
              : 'провайдер недоступен'
          }
          tone={
            data.wallet && !data.wallet.unlimited && data.wallet.balance <= data.walletThreshold
              ? 'warn'
              : undefined
          }
        />
      </div>

      <div className="g-2">
        <div className="card">
          <div className="card-h">
            <div>
              <h3>Выручка и платежи</h3>
              <p>Столбцы — выручка по дням, линия — накопительный итог</p>
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--deep)' }} />Выручка</span>
              <span><i style={{ background: 'var(--lime)' }} />Итог</span>
            </div>
          </div>
          <RevenueChart labels={data.series.map((point) => point.label)} values={revenueSeries} />
          <div className="card-foot">
            <div>
              <span className="lbl">Выручка</span>
              <div className="num">{money(data.orders.revenue)}</div>
              <span className="hint">за {periodLabel(data.period)}</span>
            </div>
            <div>
              <span className="lbl">Средний чек</span>
              <div className="num">{money(data.orders.avgCheck)}</div>
              <span className="hint">по оплаченным заказам</span>
            </div>
            <div>
              <span className="lbl">Триалы</span>
              <div className="num">{nf.format(data.keys.trial)}</div>
              <span className="hint">триал-ключей в базе</span>
            </div>
            <Link className="btn btn-ghost sm" href="/admin/analytics">
              Подробнее
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-h">
              <div>
                <h3>Структура подписок</h3>
                <p>Активные ключи по остатку срока</p>
              </div>
            </div>
            <div className="donut-wrap">
              <div className="donut">
                <Donut buckets={data.expiryBuckets} total={donutTotal} />
                <div className="ct">
                  <b>{nf.format(donutTotal)}</b>
                  <span>ключей</span>
                </div>
              </div>
              <div className="dlist">
                {data.expiryBuckets.length === 0 && <span className="hint">Активных ключей нет</span>}
                {data.expiryBuckets.map((bucket, index) => (
                  <div className="dl" key={bucket.label}>
                    <i style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                    <span>{bucket.label}</span>
                    <b>{nf.format(bucket.count)}</b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card pad-sm">
            <div className="card-h tight">
              <h3>Баланс ARTEMIDA API</h3>
              {data.wallet ? (
                <span
                  className={`pill ${
                    data.wallet.unlimited || data.wallet.balance > data.walletThreshold ? 'ok' : 'warn'
                  }`}
                >
                  <i />
                  {data.wallet.unlimited || data.wallet.balance > data.walletThreshold ? 'В норме' : 'Низкий'}
                </span>
              ) : (
                <span className="pill bad"><i />Недоступен</span>
              )}
            </div>
            <div className="balance-row">
              <b className="num">{data.wallet ? money(data.wallet.balance) : '—'}</b>
              <span className="hint">порог {money(data.walletThreshold)}</span>
            </div>
            <div className="prog">
              <i
                style={{
                  width: data.wallet
                    ? `${Math.min(100, Math.max(4, (data.wallet.balance / Math.max(1, data.walletThreshold * 4)) * 100))}%`
                    : '0%',
                }}
              />
            </div>
            <div className="row-actions">
              <Link className="btn btn-primary sm" href="/admin/wallet">
                Пополнить
              </Link>
              <Link className="btn btn-ghost sm" href="/admin/wallet">
                Детали
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h3>Показатели выручки</h3>
            <p>Детализация по периоду <b style={{ color: 'var(--lime)' }}>{periodLabel(data.period)}</b></p>
          </div>
          <span className="pill dim mono">обновлено {stamp(data.generatedAt)}</span>
        </div>
        <div className="g-6">
          <Mini label="Выручка (факт)" value={money(data.orders.revenue)} hint={`${data.orders.paid} оплат`} />
          <Mini label="Новые" value={nf.format(data.orders.newCount)} hint="заказы new" />
          <Mini label="Продления" value={nf.format(data.orders.renewCount)} hint="заказы renew" />
          <Mini label="Апгрейды" value={nf.format(data.orders.upgradeCount)} hint="заказы upgrade" />
          <Mini label="Неудачные" value={nf.format(data.orders.failed)} hint="статус failed" />
          <Mini label="Возвраты" value={nf.format(data.orders.refunded)} hint="статус refunded" />
        </div>
      </div>

      <div className="g-2e">
        <div className="card">
          <div className="card-h">
            <div>
              <h3>Топ промокодов</h3>
              <p>По числу применений</p>
            </div>
            <Link className="btn btn-quiet xs" href="/admin/promos">
              Все промокоды
            </Link>
          </div>
          {data.promos.length === 0 && <p className="hint">Промокодов пока нет</p>}
          {data.promos.map((promo) => (
            <div className="lrow" key={promo.code}>
              <span className="lic mono">{promo.code.slice(0, 2)}</span>
              <span className="lt">
                <b className="mono">{promo.code}</b>
                <span>
                  {promo.type === 'percentage' ? `−${promo.discount}%` : `${promo.discount} ₽`} ·{' '}
                  {promo.maxUses ? `лимит ${promo.maxUses}` : 'без лимита'}
                </span>
              </span>
              <span className="num">{nf.format(promo.usedCount)}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-h">
            <div>
              <h3>Топ рефереров</h3>
              <p>По числу приглашённых аккаунтов</p>
            </div>
            <Link className="btn btn-quiet xs" href="/admin/referrals">
              Рефералы
            </Link>
          </div>
          {data.referrers.length === 0 && <p className="hint">Реферальных приглашений пока нет</p>}
          {data.referrers.map((referrer) => (
            <div className="lrow" key={referrer.userId}>
              <span className="lic">{(referrer.name ?? '?').slice(0, 1).toUpperCase()}</span>
              <span className="lt">
                <b>{referrer.name ?? `#${referrer.userId}`}</b>
                <span>{referrer.email ?? `ID ${referrer.userId}`}</span>
              </span>
              <span className="num">
                {nf.format(referrer.referrals)}
                <span className="hint" style={{ display: 'block' }}>{money(referrer.revenue)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h3>Воронка рефералов</h3>
            <p>Клики → регистрации → покупки за {periodLabel(data.period)}</p>
          </div>
          <span className="pill info"><i />{data.funnel.clicks} кликов</span>
        </div>
        <Funnel funnel={data.funnel} />
      </div>

      <div className="g-2">
        <div className="card">
          <div className="card-h">
            <div>
              <h3>Лента событий</h3>
              <p>Оплаты, регистрации и обращения</p>
            </div>
            <span className="pill ok"><i />Live</span>
          </div>
          <div className="feed">
            {data.events.length === 0 && <p className="hint">Событий пока нет</p>}
            {data.events.map((event) => (
              <div className={`fi ${event.kind}`} key={event.id}>
                <span className="fi-ic">
                  {event.kind === 'payment' ? (
                    <CheckCircle2 size={14} />
                  ) : event.kind === 'signup' ? (
                    <UserPlus size={14} />
                  ) : (
                    <MessageSquare size={14} />
                  )}
                </span>
                <span className="fi-t">
                  <b>{event.title}</b>
                  <span>{event.detail}</span>
                </span>
                <span className="fi-time mono">{stamp(event.at)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-h">
              <div>
                <h3>Состояние системы</h3>
                <p>Очереди, поддержка и провайдер</p>
              </div>
            </div>
            <div className="health">
              <HealthRow
                label="ARTEMIDA API"
                value={data.wallet ? money(data.wallet.balance) : 'недоступен'}
                tone={data.wallet ? 'ok' : 'warn'}
              />
              <HealthRow
                label="Открытые обращения"
                value={nf.format(data.tickets.open)}
                tone={data.tickets.stale > 0 ? 'warn' : 'ok'}
              />
              <HealthRow
                label="Непрочитанные"
                value={nf.format(data.tickets.unread)}
                tone={data.tickets.unread > 0 ? 'warn' : 'ok'}
              />
              <HealthRow
                label="Сработавшие алерты"
                value={nf.format(data.alerts.firing)}
                tone={data.alerts.firing > 0 ? 'warn' : 'ok'}
              />
              <HealthRow
                label="Очередь outbox"
                value={`${nf.format(data.outbox.pending)} / ${nf.format(data.outbox.failed)}`}
                tone={data.outbox.failed > 0 ? 'warn' : 'ok'}
              />
            </div>
            {data.alerts.latest.length > 0 && (
              <div className="alert-list">
                {data.alerts.latest.map((alert) => (
                  <div className="alert-row" key={`${alert.type}-${alert.firedAt}`}>
                    <AlertTriangle size={14} />
                    <span>{alert.message}</span>
                    <b className="mono">{stamp(alert.firedAt)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-h tight">
              <h3>Быстрые действия</h3>
            </div>
            <div className="quick">
              <Link className="btn btn-ghost sm block" href="/admin/users">
                <Users size={16} />
                Найти пользователя
              </Link>
              <Link className="btn btn-ghost sm block" href="/admin/promos">
                <Tag size={16} />
                Создать промокод
              </Link>
              <Link className="btn btn-ghost sm block" href="/admin/broadcast">
                <Send size={16} />
                Отправить рассылку
              </Link>
              <Link className="btn btn-ghost sm block" href="/admin/tickets">
                <MessageSquare size={16} />
                Ответить на обращения
              </Link>
            </div>
          </div>
        </div>
      </div>

      {data.broadcasts.length > 0 && (
        <div className="card">
          <div className="card-h">
            <div>
              <h3>Последние рассылки</h3>
              <p>Статус доставки кампаний</p>
            </div>
            <Link className="btn btn-quiet xs" href="/admin/broadcast">
              Все рассылки
            </Link>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Сообщение</th>
                  <th>Статус</th>
                  <th>Всего</th>
                  <th>Доставлено</th>
                  <th>Ошибки</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {data.broadcasts.map((row) => (
                  <tr key={`${row.createdAt}-${row.body.slice(0, 12)}`}>
                    <td>{row.body.length > 70 ? `${row.body.slice(0, 70)}…` : row.body}</td>
                    <td>
                      <span className={`pill ${row.status === 'sent' ? 'ok' : row.status === 'failed' ? 'bad' : 'warn'}`}>
                        <i />
                        {row.status}
                      </span>
                    </td>
                    <td className="num">{nf.format(row.total)}</td>
                    <td className="num">{nf.format(row.sent)}</td>
                    <td className="num">{nf.format(row.failed)}</td>
                    <td className="mono dim">{stamp(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast show ${toast.type === 'err' ? 'err' : ''}`} key={toast.id}>
            <span className="ti">{toast.type === 'err' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}</span>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  foot,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  foot: string;
  tone?: 'warn';
}) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className={`ic${tone === 'warn' ? ' warn' : ''}`}>{icon}</span>
        <span className="lbl">{label}</span>
      </div>
      <b>{value}</b>
      <div className="foot">
        <span className={`delta ${tone === 'warn' ? 'down' : 'flat'}`}>{foot}</span>
      </div>
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="mini">
      <span className="lbl">{label}</span>
      <b>{value}</b>
      <span className="hint">{hint}</span>
    </div>
  );
}

function HealthRow({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' }) {
  return (
    <div className="health-row">
      <span className={`dot ${tone}`} />
      <span className="lt">{label}</span>
      <b className="num">{value}</b>
    </div>
  );
}

function RevenueChart({ labels, values }: { labels: string[]; values: number[] }) {
  const W = 700;
  const H = 230;
  const padL = 44;
  const padR = 14;
  const padT = 14;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxBar = Math.max(1, ...values);
  const cumulative: number[] = [];
  values.reduce((sum, value) => {
    const next = sum + value;
    cumulative.push(next);
    return next;
  }, 0);
  const maxLine = Math.max(1, ...cumulative);
  const barWidth = Math.max(1.5, Math.min(14, innerW / Math.max(1, values.length) - 2));
  const x = (index: number) => padL + (values.length === 1 ? innerW / 2 : (index / (values.length - 1)) * innerW);
  const yBar = (value: number) => padT + innerH - (value / maxBar) * innerH;
  const yLine = (value: number) => padT + innerH - (value / maxLine) * innerH;
  const linePoints = cumulative.map((value, index) => `${x(index).toFixed(1)},${yLine(value).toFixed(1)}`).join(' ');
  const every = Math.max(1, Math.round(values.length / 8));

  return (
    <div className="chart-box">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Выручка по дням">
        <defs>
          <linearGradient id="adminBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8fdc2c" stopOpacity=".85" />
            <stop offset="100%" stopColor="#0c4f36" stopOpacity=".55" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((tick) => {
          const y = padT + (innerH * tick) / 3;
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,.055)" />
              <text className="ch-y" x={padL - 8} y={y + 3.5} textAnchor="end">
                {nf.format(Math.round(maxBar * (1 - tick / 3)))}
              </text>
            </g>
          );
        })}
        {values.map((value, index) => (
          <rect
            key={index}
            x={x(index) - barWidth / 2}
            y={yBar(value)}
            width={barWidth}
            height={Math.max(value > 0 ? 1 : 0, padT + innerH - yBar(value))}
            rx={2}
            fill="url(#adminBar)"
          >
            <title>{`${labels[index]}: ${money(value)}`}</title>
          </rect>
        ))}
        <polyline points={linePoints} fill="none" stroke="#b7ff45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {labels.map((label, index) =>
          index % every === 0 || index === labels.length - 1 ? (
            <text key={index} className="ch-x" x={x(index)} y={H - 7} textAnchor="middle">
              {index === labels.length - 1 ? 'сейчас' : label}
            </text>
          ) : null,
        )}
      </svg>
      <span className="chart-note mono">
        линия: накопленный итог · max {money(maxLine)}
      </span>
    </div>
  );
}

function Donut({ buckets, total }: { buckets: { label: string; count: number }[]; total: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 132 132" role="img" aria-label="Структура подписок">
      <circle cx="66" cy="66" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="14" />
      {total > 0 &&
        buckets.map((bucket, index) => {
          const length = (bucket.count / total) * C;
          const dash = `${length.toFixed(2)} ${(C - length).toFixed(2)}`;
          const circle = (
            <circle
              key={bucket.label}
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
              strokeWidth="14"
              strokeDasharray={dash}
              strokeDashoffset={(-offset).toFixed(2)}
            >
              <title>{`${bucket.label}: ${bucket.count}`}</title>
            </circle>
          );
          offset += length;
          return circle;
        })}
    </svg>
  );
}

function Funnel({ funnel }: { funnel: AdminOverview['funnel'] }) {
  const steps = [
    { label: 'Клики', value: funnel.clicks },
    { label: 'Регистрации', value: funnel.registrations },
    { label: 'Покупки', value: funnel.purchases },
  ];
  const max = Math.max(1, ...steps.map((step) => step.value));
  return (
    <div className="funnel">
      {steps.map((step, index) => {
        const previous = index === 0 ? step.value : steps[index - 1].value;
        const conversion = index === 0 || previous === 0 ? null : Math.round((step.value / previous) * 100);
        return (
          <div className="fn" key={step.label}>
            <span className="fl">{step.label}</span>
            <span className="fb">
              <i style={{ width: `${Math.max(step.value > 0 ? 3 : 0, (step.value / max) * 100)}%` }} />
            </span>
            <span className="fv">
              {nf.format(step.value)}
              {conversion !== null && <em>{conversion}%</em>}
            </span>
          </div>
        );
      })}
      <div className="funnel-foot">
        <div>
          <span className="lbl">Выручка по рефералам</span>
          <b className="num">{money(funnel.revenue)}</b>
        </div>
        <div>
          <span className="lbl">Устройства</span>
          <b className="num">{nf.format(funnel.devices)}</b>
        </div>
        <Link className="btn btn-quiet xs" href="/admin/referrals">
          Открыть рефералов
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}
