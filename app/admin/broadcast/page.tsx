import BroadcastComposer from '@/components/admin/BroadcastComposer';
import { loadSegments } from '@/lib/analytics/rfm-service';

export default async function AdminBroadcastPage() {
  const segments = await loadSegments();
  return (
    <section className="flex flex-col gap-6">
      <BroadcastComposer segments={segments.segments} />
    </section>
  );
}
