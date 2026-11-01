import { notFound, redirect } from 'next/navigation';
import UpsellRadarTable from '@/components/admin/UpsellRadarTable';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function UpsellPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">Upsell-радар</h2>
        <p className="text-sm text-muted">Тяжёлые пользователи на низком тарифе</p>
      </header>
      <UpsellRadarTable users={[]} />
    </section>
  );
}
