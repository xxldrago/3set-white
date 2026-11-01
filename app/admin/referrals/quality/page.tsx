import { notFound, redirect } from 'next/navigation';
import PartnerRoiCard from '@/components/admin/PartnerRoiCard';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import { loadPartnerQuality } from '@/lib/analytics/growth-service';

export const dynamic = 'force-dynamic';

export default async function PartnerQualityPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const data = await loadPartnerQuality(30);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">Качество партнёров</h2>
        <p className="text-sm text-muted">Accrual ROI и Cash Position с учётом выплат</p>
      </header>
      <PartnerRoiCard data={data} />
    </section>
  );
}
