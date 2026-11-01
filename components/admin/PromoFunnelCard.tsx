'use client';

import { t } from '@/lib/i18n';

type PromoData = {
  code: string;
  ownerUserId: number | null;
  funnel: { clicks: number; registers: number; pays: number; cvr1: number; cvr2: number };
  revenue: number;
  roi: number | null;
};

export default function PromoFunnelCard({ data }: { data: PromoData[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-solid border-line">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-foreground/5">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-foreground">Промокод</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Тип</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Клики</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Регистрации</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Оплаты</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">CVR1</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">CVR2</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Выручка</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">ROI</th>
          </tr>
        </thead>
        <tbody>
          {data.map((promo) => (
            <tr key={promo.code} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-medium text-foreground">{promo.code}</td>
              <td className="px-4 py-3 text-muted">{promo.ownerUserId ? 'Партнёрский' : 'Generic'}</td>
              <td className="px-4 py-3 text-foreground">{promo.funnel.clicks}</td>
              <td className="px-4 py-3 text-foreground">{promo.funnel.registers}</td>
              <td className="px-4 py-3 text-foreground">{promo.funnel.pays}</td>
              <td className="px-4 py-3 text-foreground">{promo.funnel.cvr1}%</td>
              <td className="px-4 py-3 text-foreground">{promo.funnel.cvr2}%</td>
              <td className="px-4 py-3 text-foreground">{promo.revenue} ₽</td>
              <td className="px-4 py-3 text-foreground">{promo.roi !== null ? `${promo.roi}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
