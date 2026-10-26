// /admin/analytics (ANL-01/02/03, D-10 first screen = three blocks).
// Enforcement lives HERE, not only in the layout: a directly fetched RSC
// payload skips layouts, so the page re-runs the same guard (T-07-05-01 /
// Pitfall 12). Administrator + manager only; everyone else gets 404 — never
// a distinct forbidden page (D-11).
//
// Window contract (UI-SPEC §5.2) — the period selector changes:
//   - KPI: ARPU, ARPPU and cost coverage are WINDOWED by the period; MRR/ARR
//     are point-in-time (now) and deliberately do not move.
//   - Sparkline: window = the period's MSK days.
//   - Waterfall: fixed to the trailing 6 MSK months (§5.4), always labelled
//     with its actual rendered slot count. This is the only scope divergence
//     on the page and it is labelled on the block — no block's window is
//     ever implicit.
//
// Each block is its own async server component with its own try/catch, so a
// failing block renders its heading + the shared load-error copy while the
// others still render. No retry button — the page is force-dynamic, a reload
// retries.
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import PeriodSelector from '@/components/admin/PeriodSelector';
import AnalyticsKpi from '@/components/admin/AnalyticsKpi';
import MrrWaterfall from '@/components/admin/MrrWaterfall';
import MrrSparkline from '@/components/admin/MrrSparkline';
import AnalyticsSection from '@/components/admin/AnalyticsSection';
import LtvCards from '@/components/admin/LtvCards';
import MarginCards from '@/components/admin/MarginCards';
import BurnRunwayCards from '@/components/admin/BurnRunwayCards';
import RetentionCards from '@/components/admin/RetentionCards';
import ChurnTable from '@/components/admin/ChurnTable';
import FunnelCards from '@/components/admin/FunnelCards';
import ExpiredCards from '@/components/admin/ExpiredCards';
import { requireRole } from '@/lib/admin-auth';
import { AdminError, SessionError } from '@/lib/session';
import { t } from '@/lib/i18n';
import { GRID } from '@/components/admin/MetricCard';

export const dynamic = 'force-dynamic';

/** §5.3 loading: the KPI grid with five pulsing cards, the MRR slot spanning 2. */
function KpiSkeleton() {
  return (
    <div className={GRID} aria-hidden="true">
      <div className="h-32 animate-pulse rounded-2xl bg-foreground/5 sm:col-span-2" />
      <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
      <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
      <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
      <div className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
    </div>
  );
}

/** Block skeleton for the two charts (`h-72` waterfall, `h-24` sparkline). */
function ChartSkeleton({ className }: { className: string }) {
  return <div className={`${className} animate-pulse rounded-2xl bg-foreground/5`} aria-hidden="true" />;
}

/** §6.1 loading: the card grid skeletons for the two new sections (3-up or 2-up). */
function CardsSkeleton({ count, twoUp }: { count: number; twoUp?: boolean }) {
  return (
    <div className={twoUp ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : GRID} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-foreground/5" />
      ))}
    </div>
  );
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: Promise<{ period?: string }> } = {}) {
  let role: string | null = null;
  try {
    ({ role } = await requireRole('administrator', 'manager'));
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  // ?period= accepts only 7 | 30 | 90; anything else → 30 (identical to
  // app/admin/page.tsx — no from/to parsing exists in this phase).
  const params = await (searchParams ?? Promise.resolve({ period: undefined }));
  const rawPeriod = Number(params.period ?? 30);
  const period = rawPeriod === 7 || rawPeriod === 90 ? rawPeriod : 30;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">{t('admin.analyticsTitle')}</h2>
        <div className="w-full sm:w-80">
          <PeriodSelector selected={period} />
        </div>
      </header>

      <Suspense fallback={<KpiSkeleton />}>
        <AnalyticsKpi period={period} />
      </Suspense>
      <Suspense fallback={<ChartSkeleton className="h-72" />}>
        <MrrWaterfall />
      </Suspense>
      <Suspense fallback={<ChartSkeleton className="h-24" />}>
        <MrrSparkline period={period} />
      </Suspense>

      <AnalyticsSection title={t('admin.analyticsUnitTitle')}>
        <Suspense fallback={<CardsSkeleton count={3} />}>
          <LtvCards />
        </Suspense>
        <Suspense fallback={<CardsSkeleton count={3} />}>
          <MarginCards period={period} />
        </Suspense>
        <Suspense fallback={<CardsSkeleton count={2} twoUp />}>
          <BurnRunwayCards />
        </Suspense>
      </AnalyticsSection>

      <AnalyticsSection title={t('admin.analyticsRetentionTitle')}>
        <Suspense fallback={<CardsSkeleton count={3} />}>
          <RetentionCards period={period} />
        </Suspense>
        <Suspense fallback={<ChartSkeleton className="h-64" />}>
          <ChurnTable />
        </Suspense>
      </AnalyticsSection>

      <AnalyticsSection title={t('admin.analyticsFunnelTitle')}>
        <Suspense fallback={<CardsSkeleton count={4} />}>
          <FunnelCards period={period} />
        </Suspense>
        <Suspense fallback={<CardsSkeleton count={1} />}>
          <ExpiredCards />
        </Suspense>
      </AnalyticsSection>
    </section>
  );
}
