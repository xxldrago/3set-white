// /admin/tickets/[id] — admin/support thread view (ADM-01 / UI-SPEC §7).
// Enforcement lives HERE (layouts are not a boundary — T-05-01): signed-out →
// /login, no/wrong role → 404. The thread is read by id through the
// role-authorized `getTicketById` (NOT owner-scoped); the page renders the
// subject + status + the Phase 4 `TicketThread` bubbles and the admin reply
// composer, plus a close action through the shared confirm panel. No raw ticket
// id or provider text is rendered (T-05-19).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import AdminConfirmPanel from '@/components/admin/AdminConfirmPanel';
import AdminReplyComposer from '@/components/admin/AdminReplyComposer';
import TicketStatusChip from '@/components/TicketStatusChip';
import TicketThread from '@/components/TicketThread';
import { requireRole } from '@/lib/admin-auth';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';
import { getTicketById } from '@/lib/tickets-service';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

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

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold leading-8 break-words text-black dark:text-zinc-50">
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

      <section className={CARD}>
        <TicketThread thread={thread} />
      </section>

      <section className={CARD}>
        <AdminReplyComposer ticketId={id} />
      </section>
    </section>
  );
}
