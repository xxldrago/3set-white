'use client';

type PartnerData = {
  partnerId: number;
  partnerName: string;
  attributedRevenue: number;
  commissions: number;
  accrualRoi: number | null;
  cashPosition: number;
};

export default function PartnerRoiCard({ data }: { data: PartnerData[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-solid border-line">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-foreground/5">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-foreground">Партнёр</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Атрибутированная выручка</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Комиссии</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Accrual ROI</th>
            <th className="px-4 py-3 text-left font-medium text-foreground">Cash Position</th>
          </tr>
        </thead>
        <tbody>
          {data.map((partner) => (
            <tr key={partner.partnerId} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-medium text-foreground">{partner.partnerName}</td>
              <td className="px-4 py-3 text-foreground">{partner.attributedRevenue} ₽</td>
              <td className="px-4 py-3 text-foreground">{partner.commissions} ₽</td>
              <td className="px-4 py-3 text-foreground">{partner.accrualRoi !== null ? `${partner.accrualRoi}%` : '—'}</td>
              <td className="px-4 py-3 text-foreground">{partner.cashPosition} ₽</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
