// Presentational ticket list (SUP-01, UI-SPEC §1).
//
// No data fetching here: the server page passes provider-free `TicketListRow`
// values (subject/status/unread/lastMessageAt/preview only — never a storage
// path or provider status). Rows render the subject (1-line clamp + full value
// via `title`), the status chip, the last-activity line, a 1-line preview, and
// the accent unread badge (capped at `99+`, hidden entirely at 0). The unread
// badge carries a keyed `aria-label` built through the RU plural helper `tp()`.
import Link from 'next/link';
import TicketStatusChip from './TicketStatusChip';
import { formatPaymentDate } from './PaymentHistoryList';
import { t, tp } from '@/lib/i18n';
import type { TicketListRow } from '@/lib/tickets-service';

const CARD = 'rounded-2xl border border-black/10 p-6 dark:border-white/15';

const UNREAD_BADGE =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-2 text-sm font-semibold tabular-nums text-background';

/** Cap the displayed count at `99+` (UI-SPEC zero-one-many); `0` never renders. */
function unreadDisplay(count: number): string {
  return count > 99 ? '99+' : String(count);
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
                className="min-w-0 flex-1 truncate text-xl font-semibold text-black dark:text-zinc-50"
                title={row.subject}
              >
                {row.subject}
              </span>
              <div className="flex shrink-0 items-center gap-2">
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

            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('ticket.lastActivity', { date: formatPaymentDate(row.lastMessageAt) })}
            </p>

            {row.preview && (
              <p className="truncate text-sm text-zinc-600 dark:text-zinc-400" title={row.preview}>
                {row.preview}
              </p>
            )}
          </Link>
        </article>
      ))}
    </div>
  );
}
