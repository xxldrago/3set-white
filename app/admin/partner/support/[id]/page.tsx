// /admin/partner/support/[id] — one downline ticket. The partner answers with
// the same composer and close action staff use, but the page refuses any
// ticket outside the partner's direct referrals (404, no oracle).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminConfirmPanel from '@/components/admin/AdminConfirmPanel';
import AdminReplyComposer from '@/components/admin/AdminReplyComposer';
import AdminTicketReadMarker from '@/components/admin/AdminTicketReadMarker';
import TicketAutoRefresh from '@/components/TicketAutoRefresh';
import TicketStatusChip from '@/components/TicketStatusChip';
import TicketThread from '@/components/TicketThread';
import { requirePartnerUserId } from '@/lib/admin-partner';
import { isPartnerTicket } from '@/lib/partner-support';
import { t } from '@/lib/i18n';
import { getTicketById } from '@/lib/tickets-service';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-lg border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5';

export default async function PartnerTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const partnerId = await requirePartnerUserId();
  const { id } = await params;
  if (!(await isPartnerTicket(partnerId, id))) notFound();

  const thread = await getTicketById(id);
  if (!thread) notFound();

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
            <Link href="/admin/partner/support" className={`${SECONDARY} shrink-0`}>
              Все обращения
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

      {thread.requester && (
        <section className={CARD}>
          <h3 className="text-base font-semibold text-foreground">Клиент</h3>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted">Имя</dt>
              <dd className="text-foreground">
                {thread.requester.displayName ?? `#${thread.requester.userId}`}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted">Email</dt>
              <dd className="break-all text-foreground">
                {thread.requester.email ?? '—'}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted">Telegram</dt>
              <dd className="text-foreground">
                {thread.requester.username
                  ? `@${thread.requester.username}`
                  : thread.requester.telegramId ?? '—'}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className={CARD}>
        <TicketThread thread={thread} />
        <TicketAutoRefresh ticketId={id} />
      </section>

      <section className={CARD}>
        <h3 className="text-base font-semibold text-foreground">Ответ</h3>
        <AdminReplyComposer ticketId={id} />
      </section>
    </section>
  );
}
