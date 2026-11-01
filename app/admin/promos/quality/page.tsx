import { notFound, redirect } from 'next/navigation';
import PromoFunnelCard from '@/components/admin/PromoFunnelCard';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import { loadPromoQuality } from '@/lib/analytics/growth-service';

export const dynamic = 'force-dynamic';

export default async function PromoQualityPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const data = await loadPromoQuality(30);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">Качество промокодов</h2>
        <p className="text-sm text-muted">Воронка click → register → pay и ROI по промокодам</p>
      </header>
      <PromoFunnelCard data={data} />
    </section>
  );
}
