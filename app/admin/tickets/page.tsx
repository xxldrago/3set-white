// /admin/tickets — the shared ticket queue for administrator + support
// (ADM-01 / UI-SPEC §7). Enforcement lives HERE (layouts are not a boundary —
// T-05-01): signed-out → /login, no/wrong role → 404. The list is NOT
// owner-scoped — the resolved role is the authorization. Rows render through
// the Phase 4 `TicketList` (subject/status/last-activity/preview only, never a
// raw ticket id or provider text); the admin variant links to `/admin/tickets`.
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import TicketList from '@/components/TicketList';
import { requireRole } from '@/lib/admin-auth';
import { loadAllTickets } from '@/lib/admin-service';
import { t, tp } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { AdminError, SessionError } from '@/lib/session';
import type { TicketListRow } from '@/lib/tickets-service';

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

async function TicketsSection() {
  let rows: TicketListRow[];
  try {
    rows = await loadAllTickets();
  } catch {
    logger.error({ route: 'admin-tickets', outcome: 'tickets_load_failed' });
    return (
      <section className={CARD} role="alert">
        <p className="text-muted">{t('common.errorLoad')}</p>
        <Link href="/admin/tickets" className={SECONDARY}>
          {t('common.retry')}
        </Link>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className={CARD}>
        <h2 className="text-xl font-semibold text-foreground">
          {t('ticket.emptyHeading')}
        </h2>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <span className="text-sm text-muted">
        {rows.length >= 2 ? tp('ticket.count', rows.length) : ''}
      </span>
      <TicketList rows={rows} hrefBase="/admin/tickets" />
    </section>
  );
}

export default async function AdminTicketsPage() {
  try {
    await requireRole('administrator', 'support');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">
        {t('ticket.listTitle')}
      </h2>
      <Suspense fallback={<SkeletonRows />}>
        <TicketsSection />
      </Suspense>
    </section>
  );
}
