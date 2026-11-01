import { notFound, redirect } from 'next/navigation';
import SaveListTable from '@/components/admin/SaveListTable';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function SaveListPage() {
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
        <h2 className="text-xl font-semibold text-foreground">Save-list истекающих ключей</h2>
        <p className="text-sm text-muted">Ключи, истекающие ≤7 дней без продления</p>
      </header>
      <SaveListTable keys={[]} />
    </section>
  );
}
