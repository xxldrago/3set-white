import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
      ))}
    </div>
  );
}
import { requireRole } from '@/lib/admin-auth';
import { loadThresholds } from '@/lib/analytics/rfm-service';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';
import AnalyticsSection from '@/components/admin/AnalyticsSection';
import SegmentCards from '@/components/admin/SegmentCards';
import SegmentThresholdsForm from '@/components/admin/SegmentThresholdsForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('admin.segmentsTitle')} — ${t('app.name')}`,
};

export default async function AdminSegmentsPage() {
  try {
    await requireRole('administrator', 'manager');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  let thresholds;
  try {
    thresholds = await loadThresholds();
  } catch {
    thresholds = { newPayerDays: 30, activeDays: 30, atRiskDays: 60, churnedDays: 60, vipPercent: 5 };
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-foreground">{t('admin.segmentsTitle')}</h2>
        <span className="text-sm text-muted">{t('admin.segmentsMeta')}</span>
      </div>

      <Suspense fallback={<CardsSkeleton count={7} />}>
        <SegmentCards />
      </Suspense>

      <AnalyticsSection title={t('admin.segmentsThresholdsTitle')}>
        <span className="text-xs text-muted">{t('admin.segmentsThresholdsMeta')}</span>
        <SegmentThresholdsForm initial={thresholds} />
      </AnalyticsSection>
    </section>
  );
}
