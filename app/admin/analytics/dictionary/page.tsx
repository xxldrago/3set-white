import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MetricDictionaryPage() {
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
        <h2 className="text-xl font-semibold text-foreground">Словарь метрик</h2>
        <p className="text-sm text-muted">Определения, формулы, источники и ограничения</p>
      </header>
      <div className="rounded-2xl border border-line p-6">
        <p className="text-sm text-muted">Словарь метрик в разработке</p>
      </div>
    </section>
  );
}
