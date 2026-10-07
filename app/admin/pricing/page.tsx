// /admin/pricing — administrator-only tariff settings (retail price grid).
// Enforcement lives HERE (layouts are not a boundary — T-05-01): signed-out →
// /login, no/wrong role → 404. The grid is read server-side behind a Suspense
// boundary; a failed read renders `common.errorLoad` + `common.retry` (never a
// raw DB string). The mutation is a client island (`TariffPricingForm`).
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import TariffPricingForm from '@/components/admin/TariffPricingForm';
import { requireRole } from '@/lib/admin-auth';
import { listTariffPrices } from '@/lib/pricing';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line ';

/** Loading fallback while the tariff grid resolves (UI-SPEC §6 pattern). */
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-foreground/5"
        />
      ))}
    </section>
  );
}

async function PricingSection() {
  let rows;
  try {
    rows = await listTariffPrices();
  } catch {
    logger.error({ route: 'admin-pricing', outcome: 'grid_load_failed' });
    return (
      <section className={CARD} role="alert">
        <p className="text-muted">{t('common.errorLoad')}</p>
        <Link href="/admin/pricing" className={SECONDARY}>
          {t('common.retry')}
        </Link>
      </section>
    );
  }

  return <TariffPricingForm initialRows={rows} />;
}

export default async function AdminPricingPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">{t('admin.pricingTitle')}</h2>
        <p className="text-sm text-muted">{t('admin.pricingSubtitle')}</p>
      </header>

      <Suspense fallback={<SkeletonRows />}>
        <PricingSection />
      </Suspense>
    </section>
  );
}
