// Server-rendered support nav entry (SUP-03 parity, UI-SPEC §7). Links to
// `/support` and carries the accent unread badge when `unreadCount > 0`
// (hidden entirely at 0 — never a "0" badge). The badge mirrors the ticket-row
// badge and exposes the RU plural count through `aria-label={tp(...)}`.
import Link from 'next/link';
import { t, tp } from '@/lib/i18n';

const SECONDARY =
  'flex h-12 items-center justify-center gap-2 rounded-full border border-solid border-line px-5 transition-colors hover:bg-foreground/5 border-line ';
const UNREAD_BADGE =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-2 text-sm font-semibold tabular-nums text-lime';

/** Cap the displayed count at `99+` (UI-SPEC zero-one-many); `0` never renders. */
function unreadDisplay(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export default function SupportEntry({ unreadCount }: { unreadCount: number }) {
  return (
    <Link href="/support" className={SECONDARY}>
      <span>{t('ticket.toSupport')}</span>
      {unreadCount > 0 && (
        <span aria-label={tp('ticket.unread', unreadCount)} className={UNREAD_BADGE}>
          {unreadDisplay(unreadCount)}
        </span>
      )}
    </Link>
  );
}
