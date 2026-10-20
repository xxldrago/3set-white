// Presentational ticket list (SUP-01, UI-SPEC §1).
//
// No data fetching here: the server page passes provider-free `TicketListRow`
// values (subject/status/unread/lastMessageAt/preview — never a storage path or
// provider status). Rows render the subject (1-line clamp + full value via
// `title`), the status chip, the last-activity line, a 1-line preview, and the
// accent unread badge (capped at `99+`, hidden entirely at 0). The unread badge
// carries a keyed `aria-label` built through the RU plural helper `tp()`.
// `requester` is present only on the ADMIN read, so the cabinet list is
// unchanged while support sees who filed each ticket.
import Link from 'next/link';
import TicketStatusChip from './TicketStatusChip';
import { formatPaymentDate } from './PaymentHistoryList';
import { t, tp } from '@/lib/i18n';
import type { TicketListRow, TicketRequester } from '@/lib/tickets-service';

const CARD = 'rounded-2xl border border-line p-6 border-line';

const UNREAD_BADGE =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-2 text-sm font-semibold tabular-nums text-lime';

/** Cap the displayed count at `99+` (UI-SPEC zero-one-many); `0` never renders. */
function unreadDisplay(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** Admin-only sender line: name → @username → email → Telegram id → user id. */
function requesterLine(requester: TicketRequester): string {
  if (requester.displayName && requester.username) {
    return t('ticket.fromNameUsername', {
      name: requester.displayName,
      username: requester.username,
    });
  }
  if (requester.displayName) {
    return t('ticket.fromName', { name: requester.displayName });
  }
  if (requester.username) {
    return t('ticket.fromUsername', { name: requester.username });
  }
  if (requester.email) {
    return t('ticket.fromEmail', { email: requester.email });
  }
  if (requester.telegramId) {
    return t('ticket.fromTelegram', { id: requester.telegramId });
  }
  return t('ticket.fromUser', { id: requester.userId });
}

export default function TicketList({
  rows,
  hrefBase = '/support',
}: {
  rows: TicketListRow[];
  /** Link target prefix. The cabinet uses `/support`; the admin queue passes
      `/admin/tickets` so a row never points at an owner-scoped route. */
  hrefBase?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <article key={row.id} className={CARD}>
          <Link
            href={`${hrefBase}/${encodeURIComponent(row.id)}`}
            className="flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className="min-w-0 flex-1 truncate text-xl font-semibold text-foreground"
                title={row.subject}
              >
                {row.subject}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                {typeof row.unreadForAdmin === 'number' && row.unreadForAdmin > 0 && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full bg-foreground"
                    title={tp('ticket.unread', row.unreadForAdmin)}
                    aria-label={tp('ticket.unread', row.unreadForAdmin)}
                  />
                )}
                <TicketStatusChip status={row.status} />
                {row.unreadForUser > 0 && (
                  <span
                    aria-label={tp('ticket.unread', row.unreadForUser)}
                    className={UNREAD_BADGE}
                  >
                    {unreadDisplay(row.unreadForUser)}
                  </span>
                )}
              </div>
            </div>

            {row.requester && (
              <p
                className="truncate text-sm text-foreground"
                title={requesterLine(row.requester)}
              >
                {requesterLine(row.requester)}
              </p>
            )}

            <p className="text-sm text-muted">
              {t('ticket.lastActivity', { date: formatPaymentDate(row.lastMessageAt) })}
            </p>

            {row.preview && (
              <p className="truncate text-sm text-muted" title={row.preview}>
                {row.preview}
              </p>
            )}
          </Link>
        </article>
      ))}
    </div>
  );
}
