// /admin/partner/links — generate and copy referral links for the partner
// themself and for each direct subpartner. A subpartner link carries the
// subpartner's own code, so the buyer is attributed to them; the partner pays
// that subpartner the percent chosen here out of their own income, and keeps
// the rest (the ledger floors the residual at zero).
import CopyButton from '@/components/CopyButton';
import PartnerLinksManager from '@/components/admin/PartnerLinksManager';
import SubpartnerRateForm from '@/components/admin/SubpartnerRateForm';
import { requirePartnerUserId } from '@/lib/admin-partner';
import { env } from '@/lib/env';
import { getReferralSummary, listPartnerLinks, listSubpartnerLinks } from '@/lib/referrals';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-3 rounded-2xl border border-line p-6';

function rateText(rate: { kind: string; value: number }): string {
  if (rate.kind === 'percent') return `${rate.value}% с оборота`;
  if (rate.kind === 'fixed') return `${rate.value} ₽ за заказ`;
  return `${rate.value} дн. за заказ`;
}

export default async function PartnerLinksPage() {
  const userId = await requirePartnerUserId();
  const [summary, subpartners, links] = await Promise.all([
    getReferralSummary(userId),
    listSubpartnerLinks(userId),
    listPartnerLinks(userId),
  ]);
  const ownLink = `${env.APP_BASE_URL}/signup?ref=${summary.code}`;
  // The cap for a subpartner percent: nobody can promise more than they earn.
  const maxPercent = summary.myRate.kind === 'percent' ? summary.myRate.value : null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">Реферальные ссылки</h2>
        <p className="text-sm text-muted">
          Ваша ссылка и ссылки ваших субпартнёров. Каждая ссылка несёт код владельца —
          покупки по ней закрепляются за ним автоматически.
        </p>
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-foreground">Ваша ссылка</h3>
            <p className="text-sm text-muted">
              Код <span className="font-mono text-foreground">{summary.code}</span> · ваша ставка:{' '}
              <span className="text-foreground">{rateText(summary.myRate)}</span>
            </p>
          </div>
          <CopyButton value={ownLink} />
        </div>
        <code className="break-all rounded-xl bg-panel p-3 font-mono text-sm text-foreground">
          {ownLink}
        </code>
      </div>

      <div className={CARD}>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground">Мои ссылки</h3>
          <p className="text-sm text-muted">
            Создавайте сколько нужно: отдельная ссылка на каждый канал, объявление или
            субпартнёра. У каждой свой код — все регистрации и оплаты по ней закрепляются за
            выбранным аккаунтом автоматически, статистика и начисления идут как обычно.
          </p>
        </div>
        <PartnerLinksManager
          baseUrl={env.APP_BASE_URL}
          ownUserId={userId}
          links={links.map((row) => ({
            id: row.id,
            code: row.code,
            label: row.label,
            targetUserId: row.targetUserId,
            targetName: row.targetName,
          }))}
          subpartners={subpartners.map((row) => ({
            userId: row.userId,
            displayName: row.displayName,
            email: row.email,
          }))}
        />
      </div>

      <div className={CARD}>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-foreground">Ссылки субпартнёров</h3>
          <p className="text-sm text-muted">
            Передайте субпартнёру его ссылку и выберите, какой процент от своего дохода ему
            платить. Остаток разницы остаётся вам, начисление идёт автоматически после каждой
            оплаты.
            {maxPercent !== null && (
              <>
                {' '}
                Максимум для вас — <span className="text-foreground">{maxPercent}%</span>.
              </>
            )}
          </p>
        </div>
        {subpartners.length === 0 ? (
          <p className="text-sm text-muted">
            Субпартнёров пока нет. Пригласите первого по своей ссылке — он появится здесь
            вместе со своей ссылкой.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Субпартнёр
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Код
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Ссылка
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Процент субпартнёру
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    <span className="sr-only">Копировать</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {subpartners.map((row) => {
                  const link = `${env.APP_BASE_URL}/signup?ref=${row.code}`;
                  return (
                    <tr key={row.userId} className="border-b border-line last:border-0">
                      <td className="px-3 py-3 align-middle">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {row.displayName ?? row.email ?? `#${row.userId}`}
                          </span>
                          {row.email && row.displayName && (
                            <span className="text-xs text-muted">{row.email}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle font-mono text-xs">{row.code}</td>
                      <td className="px-3 py-3 align-middle">
                        <code className="break-all font-mono text-xs text-muted">{link}</code>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <SubpartnerRateForm
                          userId={row.userId}
                          initialPercent={row.partnerPercent}
                          maxPercent={maxPercent}
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <CopyButton value={link} />
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
