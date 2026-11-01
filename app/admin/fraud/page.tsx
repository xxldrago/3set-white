import { notFound, redirect } from 'next/navigation';
import FraudSignalsTable from '@/components/admin/FraudSignalsTable';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import { loadFraudSignals } from '@/lib/fraud-service';

export const dynamic = 'force-dynamic';

export default async function FraudPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const signals = await loadFraudSignals();

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">Fraud-сигналы</h2>
        <p className="text-sm text-muted">Наблюдение, без авто-блокировок</p>
      </header>
      <FraudSignalsTable signals={signals} />
    </section>
  );
}
