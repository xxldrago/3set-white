// Ticket thread page (SUP-01/SUP-03, UI-SPEC §2). Session-gated RSC modeled on
// `app/keys/[id]/page.tsx`: the telegram id comes from the signed cookie and the
// thread is read through the ownership-joined service — a ticket the caller does
// not own renders the same 404 as a missing one (`notFound()`), so there is no
// ownership oracle (T-04-24). The subject is the page `h1`; the sender-aware
// `TicketThread` renders ordered bubbles. The reply composer (04-06 T3) and the
// one-shot mark-read island (04-06 T2) slot in below; a closed thread shows the
// reopen note above the composer (D-59).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import MarkReadOnOpen from '@/components/MarkReadOnOpen';
import TicketComposer from '@/components/TicketComposer';
import TicketStatusChip from '@/components/TicketStatusChip';
import TicketThread from '@/components/TicketThread';
import { t } from '@/lib/i18n';
import { getTicketForUser } from '@/lib/tickets-service';
import { requireTelegramSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('ticket.listTitle')} — ${t('app.name')}`,
};

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 transition-colors hover:bg-foreground/5 border-line ';

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const { id } = await params;
  const thread = await getTicketForUser(BigInt(telegramId), id);
  if (!thread) notFound();

  return (
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight break-all text-foreground">
            {thread.subject}
          </h1>
          <div className="flex items-center justify-between gap-3">
            <TicketStatusChip status={thread.status} />
            <Link
              href={`/support/${encodeURIComponent(id)}`}
              className={`${SECONDARY} shrink-0`}
            >
              {t('common.refresh')}
            </Link>
          </div>
        </header>

        <section className={CARD}>
          <TicketThread thread={thread} />
        </section>

        {thread.status === 'closed' && (
          <p className="text-sm text-muted">{t('ticket.reopenNote')}</p>
        )}

        <section className={CARD}>
          <TicketComposer ticketId={id} />
        </section>

        <nav className="flex flex-col gap-2 sm:flex-row">
          <Link href="/support" className={SECONDARY}>
            {t('ticket.listTitle')}
          </Link>
        </nav>

        <MarkReadOnOpen ticketId={id} />
      </main>
    </div>
  );
}
