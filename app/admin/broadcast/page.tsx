import { notFound, redirect } from 'next/navigation';
import BroadcastComposer from '@/components/admin/BroadcastComposer';
import { loadSegments } from '@/lib/analytics/rfm-service';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminBroadcastPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }
  const segments = await loadSegments();
  return (
    <section className="flex flex-col gap-6">
      <BroadcastComposer segments={segments.segments} />
    </section>
  );
}
