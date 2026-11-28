// /admin/partner/promos — a partner's own promo codes + self-service
// creation. Partner-only: codes are always owned by the caller, and only the
// caller's codes are listed.
import PartnerPromoForm from './PartnerPromoForm';
import { requirePartnerUserId } from '@/lib/admin-partner';
import { isPromoUsable, listPromosByOwner } from '@/lib/promo';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6';

function discountText(row: { type: string; discount: number }): string {
  return row.type === 'fixed' ? `${row.discount} ₽` : `${row.discount}%`;
}

export default async function PartnerPromosPage() {
  const userId = await requirePartnerUserId();
  const promos = await listPromosByOwner(userId);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">Мои промокоды</h2>
        <p className="text-sm text-muted">
          Создавайте коды для своих клиентов: покупатель по такому коду закрепляется за вами.
        </p>
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">Новый промокод</h3>
        <PartnerPromoForm />
      </div>

      <div className={CARD}>
        <h3 className="text-base font-semibold text-foreground">Созданные коды</h3>
        {promos.length === 0 ? (
          <p className="text-sm text-muted">Пока нет промокодов — создайте первый выше.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Код</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Скидка</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Использовано</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Действует до</th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">Статус</th>
                </tr>
              </thead>
              <tbody>
                {promos.map((row) => {
                  const usable = isPromoUsable(row);
                  const exhausted = row.maxUses !== null && row.usedCount >= row.maxUses;
                  const status = usable ? 'Активен' : exhausted ? 'Исчерпан' : 'Истёк';
                  return (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-3 align-middle font-mono font-medium text-foreground">
                        {row.code}
                      </td>
                      <td className="px-3 py-3 align-middle tabular-nums">{discountText(row)}</td>
                      <td className="px-3 py-3 align-middle tabular-nums">
                        {row.usedCount}
                        {row.maxUses === null ? '' : ` / ${row.maxUses}`}
                      </td>
                      <td className="px-3 py-3 align-middle tabular-nums text-muted">
                        {row.expiresAt === null
                          ? 'бессрочно'
                          : new Date(row.expiresAt).toISOString().slice(0, 10)}
                      </td>
                      <td
                        className={`px-3 py-3 align-middle font-medium ${
                          usable ? 'text-green' : 'text-muted'
                        }`}
                      >
                        {status}
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
