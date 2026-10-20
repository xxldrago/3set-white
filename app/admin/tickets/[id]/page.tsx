// /admin/tickets/[id] — admin/support thread view (ADM-01 / UI-SPEC §7).
// Enforcement lives HERE (layouts are not a boundary — T-05-01): signed-out →
// /login, no/wrong role → 404. The thread is read by id through the
// role-authorized `getTicketById` (NOT owner-scoped); the page renders the
// subject + status, the requester's full user card (identity, contacts, trial
// and paid stats, link to `/admin/users/[id]`), the Phase 4 `TicketThread`
// bubbles and the admin reply composer, plus a close action through the shared
// confirm panel. No raw ticket id or provider text is rendered (T-05-19).
  import { Suspense } from 'react';
  import Link from 'next/link';
  import { notFound, redirect } from 'next/navigation';
  import AdminConfirmPanel from '@/components/admin/AdminConfirmPanel';
  import AdminReplyComposer from '@/components/admin/AdminReplyComposer';
  import AdminTicketReadMarker from '@/components/admin/AdminTicketReadMarker';
  import TicketClientContext from '@/components/admin/TicketClientContext';
  import TicketCompensation from '@/components/admin/TicketCompensation';
  import UserProfileCard from '@/components/admin/UserProfileCard';
  import TicketStatusChip from '@/components/TicketStatusChip';
  import TicketThread from '@/components/TicketThread';
  import { requireRole } from '@/lib/admin-auth';
  import { loadAdminHeader } from '@/lib/admin-service';
  import { t } from '@/lib/i18n';
  import { AdminError, SessionError } from '@/lib/session';
  import {
    COMPENSATION_MAX_PER_TICKET,
  } from '@/lib/ticket-compensation-reasons';
  import { loadTicketCompensationSummary } from '@/lib/ticket-compensation';
  import { getTicketById } from '@/lib/tickets-service';

export const dynamic = 'force-dynamic';

  const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
  const SECONDARY =
    'flex h-11 items-center justify-center rounded-lg border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line ';

  function ContextSkeleton() {
    return (
      <div
        className="h-40 animate-pulse rounded-2xl bg-foreground/5"
        aria-hidden
      />
    );
  }

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireRole('administrator', 'support');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const { id } = await params;
  const thread = await getTicketById(id);
  if (!thread) notFound();

  // The requester is loaded with the thread; the header adds registration date,
  // trial/paid stats and the staff role. A missing header (deleted user) still
  // leaves the thread usable through the fallback card below.
    const header = thread.requester
      ? await loadAdminHeader(thread.requester.userId)
      : null;
    const compensation = thread.requester
      ? await loadTicketCompensationSummary(id).catch(() => ({
          used: 0,
          maxDays: COMPENSATION_MAX_PER_TICKET,
        }))
      : null;

    return (
    <section className="flex flex-col gap-6">
      <AdminTicketReadMarker ticketId={id} />
      <header className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold leading-8 break-words text-foreground">
          {thread.subject}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TicketStatusChip status={thread.status} />
          <div className="flex items-center gap-2">
            <Link href="/admin/tickets" className={`${SECONDARY} shrink-0`}>
              {t('ticket.listTitle')}
            </Link>
            {thread.status !== 'closed' && (
              <AdminConfirmPanel
                variant="destructive"
                triggerLabel={t('admin.ticketClose')}
                title={t('admin.ticketCloseTitle')}
                body={t('admin.ticketCloseBody')}
                confirmLabel={t('admin.ticketCloseConfirm')}
                errorLabel={t('admin.ticketCloseError')}
                url={`/api/admin/tickets/${encodeURIComponent(id)}/close`}
                payload={{}}
              />
            )}
          </div>
        </div>
      </header>

      {header && (
        <UserProfileCard header={header}>
          <Link
            href={`/admin/users/${header.userId}`}
            className={`${SECONDARY} w-full`}
          >
            {t('admin.openProfile')}
          </Link>
        </UserProfileCard>
      )}

        {!header && thread.requester && (
          <section className={CARD}>
            <p className="text-sm text-muted">
              {t('ticket.fromUser', { id: thread.requester.userId })}
            </p>
            <Link
              href={`/admin/users/${thread.requester.userId}`}
              className={SECONDARY}
            >
              {t('admin.openProfile')}
            </Link>
          </section>
        )}

        {thread.requester && (
          <>
            <h2 className="text-lg font-semibold text-foreground">
              {t('admin.ticketContextTitle')}
            </h2>
            <Suspense fallback={<ContextSkeleton />}>
              <TicketClientContext userId={thread.requester.userId} />
            </Suspense>
            {header && compensation && (
              <TicketCompensation
                ticketId={id}
                bonusDays={header.bonusDays}
                used={compensation.used}
                maxDays={compensation.maxDays}
              />
            )}
          </>
        )}

        <section className={CARD}>
        <TicketThread thread={thread} />
      </section>

      <section className={CARD}>
        <AdminReplyComposer ticketId={id} />
      </section>
    </section>
  );
}
