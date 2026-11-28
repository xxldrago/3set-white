// /admin/partner — partner dashboard. Partner-only: the role matrix gives
// this page (and its sibling sections) to `partner` alone. Shows the referral
// link, effective rate, invited/earned/balance, personal promo codes, the
// funnel and a short downline preview.
import Link from 'next/link';
import FunnelCharts from '@/components/admin/FunnelCharts';
import { requirePartnerUserId } from '@/lib/admin-partner';
import { env } from '@/lib/env';
import { listPromosByOwner } from '@/lib/promo';
import { getReferralSummary, listDownlineDetails } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-3 rounded-2xl border border-line p-6';
const MINI = 5;

function rateText(rate: { kind: string; value: number }): string {
  if (rate.kind === 'percent') return `${rate.value}%`;
  if (rate.kind === 'fixed') return `${rate.value} ₽`;
  return `${rate.value} дн.`;
}

export default async function AdminPartnerPage() {
  const userId = await requirePartnerUserId();
  const [summary, promos, downline] = await Promise.all([
    getReferralSummary(userId),
    listPromosByOwner(userId),
    listDownlineDetails(userId),
  ]);
  const link = `${env.APP_BASE_URL}/signup?ref=${summary.code}`;
  const preview = downline.slice(0, MINI);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">Партнёрский дашборд</h2>
        <p className="text-sm text-muted">Ваша ссылка, ставка, доход и последние рефералы.</p>
      </div>

      <div className={CARD}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted">Ваша ссылка</span>
          <code className="break-all font-mono text-sm text-foreground">{link}</code>
        </div>
        <p className="text-sm text-muted">
          Ваша ставка:{' '}
          <span className="font-semibold text-foreground">{rateText(summary.myRate)}</span>{' '}
          <span className="text-xs">(глобальная)</span>
        </p>
        <dl className="grid grid-cols-3 gap-2 text-center min-w-0">
          <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
            <dt className="text-xs text-muted">Приглашено</dt>
            <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
              {summary.referrals}
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
            <dt className="text-xs text-muted">Заработано</dt>
            <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
              {summary.earned} ₽
            </dd>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
            <dt className="text-xs text-muted">Баланс</dt>
            <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
              {summary.balance} ₽
            </dd>
          </div>
        </dl>
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">Персональные промокоды</h3>
          <Link href="/admin/partner/promos" className="text-sm text-muted hover:text-foreground">
            Все промокоды
          </Link>
        </div>
        {promos.length === 0 ? (
          <p className="text-sm text-muted">
            Промокодов пока нет —{' '}
            <Link href="/admin/partner/promos" className="text-foreground underline">
              создайте первый
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {promos.slice(0, 3).map((row) => (
              <li key={row.id} className="flex justify-between gap-2 tabular-nums">
                <span className="font-mono">{row.code}</span>
                <span>
                  {row.type === 'fixed' ? `${row.discount} ₽` : `${row.discount}%`} · {row.usedCount}
                  {row.maxUses === null ? '' : `/${row.maxUses}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">Воронка рефералов</h3>
        <FunnelCharts endpoint="/api/referrals/stats" />
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground">Последние рефералы</h3>
          <Link href="/admin/partner/referrals" className="text-sm text-muted hover:text-foreground">
            Все рефералы
          </Link>
        </div>
        {preview.length === 0 ? (
          <p className="text-sm text-muted">Пока никого — поделитесь ссылкой выше.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Реферал</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Покупки</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Заработано</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.userId} className="border-b border-line last:border-0">
                    <td className="px-3 py-3 align-middle">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {row.displayName ?? row.email ?? `#${row.userId}`}
                        </span>
                        <span className="text-xs tabular-nums text-muted">
                          {new Date(row.createdAt).toISOString().slice(0, 10)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle tabular-nums">
                      {row.purchases} · {row.revenue} ₽
                    </td>
                    <td className="px-3 py-3 align-middle tabular-nums">{row.earnedFromThem} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">Поддержка</h3>
        <p className="text-sm text-muted">Вопросы по выплатам и коду — напишите нам.</p>
        <Link
          href="/support"
          className="flex h-11 items-center justify-center rounded-lg border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5"
        >
          Открыть поддержку
        </Link>
      </div>
    </section>
  );
}
