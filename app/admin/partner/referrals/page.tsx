// /admin/partner/referrals — a partner's own downline. Partner-only: the
// shared referral console (/admin/referrals) exposes every partner's numbers
// and is never linked here. Enforcement lives on this page.
import FunnelCharts from '@/components/admin/FunnelCharts';
import { requirePartnerUserId } from '@/lib/admin-partner';
import { getReferralSummary, listDownlineDetails } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-3 rounded-2xl border border-line p-6';

export default async function PartnerReferralsPage() {
  const userId = await requirePartnerUserId();
  const [summary, downline] = await Promise.all([
    getReferralSummary(userId),
    listDownlineDetails(userId),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">Мои рефералы</h2>
        <p className="text-sm text-muted">
          Кого вы пригласили, их покупки и что вы с них заработали.
        </p>
      </div>

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

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">Воронка рефералов</h3>
        <FunnelCharts endpoint="/api/referrals/stats" />
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">Список рефералов</h3>
        {downline.length === 0 ? (
          <p className="text-sm text-muted">
            Пока никого — поделитесь ссылкой из дашборда, и первые регистрации появятся здесь.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Реферал
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Их рефералы
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Продажи
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Заработано
                  </th>
                </tr>
              </thead>
              <tbody>
                {downline.map((row) => (
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
                    <td className="px-3 py-3 align-middle tabular-nums">{row.downline}</td>
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
    </section>
  );
}
