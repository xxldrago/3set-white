// /admin/promos — administrator-only promo management.
// Enforcement lives HERE (layouts are not a boundary — T-05-01): signed-out →
// /login, no/wrong role → 404. The list is read server-side; mutations live in
// the `PromoManagerForm` client island behind the role-gated BFF routes.
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import PromoManagerForm from '@/components/admin/PromoManagerForm';
import { requireRole } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { listPromos } from '@/lib/promo';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line ';

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

async function PromosSection() {
  let promos;
  try {
    promos = await listPromos();
  } catch {
    logger.error({ route: 'admin-promos', outcome: 'list_load_failed' });
    return (
      <section className={CARD} role="alert">
        <p className="text-muted">{t('common.errorLoad')}</p>
        <Link href="/admin/promos" className={SECONDARY}>
          {t('common.retry')}
        </Link>
      </section>
    );
  }
  return <PromoManagerForm initialPromos={promos} />;
}

export default async function AdminPromosPage() {
  try {
    await requireRole('administrator');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">{t('admin.promosTitle')}</h2>
        <p className="text-sm text-muted">{t('admin.promosSubtitle')}</p>
      </div>
      <Suspense fallback={<SkeletonRows />}>
        <PromosSection />
      </Suspense>
    </section>
  );
}
