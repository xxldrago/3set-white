// /admin/partner/payouts — a partner's earnings: balance, period analytics
// split by channel (referral link vs each personal promo code), withdrawal
// request form and payout history. Partner-only; all data is the caller's.
import Link from 'next/link';
import ReferralSection from '@/components/ReferralSection';
import { requirePartnerUserId } from '@/lib/admin-partner';
import { loadPartnerEarnings, type EarningsPeriod } from '@/lib/partner-earnings';
import { listOwnWithdrawals } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-3 rounded-2xl border border-line p-6';
const CHIP =
  'rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-foreground/5';
const CHIP_ON = 'rounded-lg border border-foreground/40 bg-foreground/10 px-3 py-1.5 text-sm';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'На проверке', cls: 'text-amber-600' },
  approved: { label: 'Выплачено', cls: 'text-green' },
  rejected: { label: 'Отклонено', cls: 'text-red-600' },
};

const PERIODS: { value: EarningsPeriod; label: string }[] = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: 0, label: 'Всё время' },
];

function parsePeriod(raw: string | undefined): EarningsPeriod {
  if (raw === '7' || raw === '30' || raw === '90' || raw === 'all') {
    return raw === 'all' ? 0 : (Number(raw) as EarningsPeriod);
  }
  return 30;
}

function href(period: EarningsPeriod, source: string): string {
  return `/admin/partner/payouts?period=${period === 0 ? 'all' : period}&source=${encodeURIComponent(source)}`;
}

export default async function PartnerPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; source?: string }>;
}) {
  const userId = await requirePartnerUserId();
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const source = params.source ?? 'all';

  const [data, withdrawals] = await Promise.all([
    loadPartnerEarnings(userId, period),
    listOwnWithdrawals(userId),
  ]);

  const selected = source !== 'all' ? data.sources.find((row) => row.key === source) : null;
  const clicks = selected ? selected.clicks : data.totals.clicks;
  const purchases = selected ? selected.purchases : data.totals.purchases;
  const revenue = selected ? selected.revenue : data.totals.revenue;
  const earned = selected ? selected.earned : data.totals.earned;
  const avgCheck = purchases > 0 ? Math.round(revenue / purchases) : 0;
  const maxBar = Math.max(1, ...data.series.map((point) => point.revenue));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">Заработок</h2>
        <p className="text-sm text-muted">
          Баланс, финансовая аналитика и статистика по ссылке и промокодам.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((option) => (
          <Link
            key={option.value}
            href={href(option.value, source)}
            className={option.value === period ? CHIP_ON : CHIP}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(period, 'all')} className={source === 'all' ? CHIP_ON : CHIP}>
          Все источники
        </Link>
        {data.sources.map((row) => (
          <Link
            key={row.key}
            href={href(period, row.key)}
            className={source === row.key ? CHIP_ON : CHIP}
          >
            {row.kind === 'link' ? 'Ссылка' : row.label}
          </Link>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-center min-w-0 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">Баланс</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {data.balance} ₽
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">Начислено</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {earned} ₽
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">Оборот</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {revenue} ₽
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">Покупки</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {purchases}
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">Средний чек</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {avgCheck} ₽
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">Клики</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {clicks}
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">Регистрации</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {selected ? '—' : data.totals.registrations}
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">Конверсия</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {selected ? '—' : `${data.totals.conversion}%`}
          </dd>
        </div>
      </dl>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">Оборот по периодам</h3>
        <div className="flex h-40 items-end gap-1">
          {data.series.map((point, index) => (
            <div key={`${point.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-foreground/25"
                style={{ height: `${Math.round((point.revenue / maxBar) * 130)}px` }}
                title={`${point.label}: ${point.revenue} ₽ · начислено ${point.earned} ₽`}
              />
              {index % Math.ceil(data.series.length / 8) === 0 && (
                <span className="text-[10px] tabular-nums text-muted">{point.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">По источникам</h3>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2 font-semibold text-muted">Источник</th>
                <th scope="col" className="px-3 py-2 font-semibold text-muted">Клики</th>
                <th scope="col" className="px-3 py-2 font-semibold text-muted">Покупки</th>
                <th scope="col" className="px-3 py-2 font-semibold text-muted">Оборот</th>
                <th scope="col" className="px-3 py-2 font-semibold text-muted">Начислено</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((row) => (
                <tr
                  key={row.key}
                  className={`border-b border-line last:border-0 ${
                    source === row.key ? 'bg-foreground/5' : ''
                  }`}
                >
                  <td className="px-3 py-3 align-middle">
                    <span className={row.kind === 'promo' ? 'font-mono text-foreground' : 'text-foreground'}>
                      {row.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-middle tabular-nums">{row.clicks}</td>
                  <td className="px-3 py-3 align-middle tabular-nums">{row.purchases}</td>
                  <td className="px-3 py-3 align-middle tabular-nums">{row.revenue} ₽</td>
                  <td className="px-3 py-3 align-middle tabular-nums">{row.earned} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ReferralSection />

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">История заявок</h3>
        {withdrawals.length === 0 ? (
          <p className="text-sm text-muted">Заявок ещё не было.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Дата</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Сумма</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Статус</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((row) => {
                  const status = STATUS[row.status] ?? { label: row.status, cls: 'text-muted' };
                  return (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-3 align-middle tabular-nums text-muted">
                        {new Date(row.createdAt).toISOString().slice(0, 10)}
                      </td>
                      <td className="px-3 py-3 align-middle tabular-nums font-medium text-foreground">
                        {row.amount} ₽
                      </td>
                      <td className={`px-3 py-3 align-middle font-medium ${status.cls}`}>
                        {status.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
