// Presentational ticket-status chip (SUP-01, UI-SPEC §1 / color table).
//
// This is the ONLY place a ticket status maps to a label + tint: the literal
// `t("ticket.status…")` calls below are the single registration point for the
// i18n scanner. Never build the key by interpolation, and never render a raw
// `ticket.status` string (T-04-19/D-19/D-24).
//
// Tint semantics (UI-SPEC, reusing the Phase 2/3 semantic palette):
// - open     → amber ("we're on it")
// - answered → green (there is a reply waiting for you)
// - closed   → zinc  (terminal, neutral)
// - unknown  → zinc  (neutral, closed-tinted; never rendered raw)
import { t } from '@/lib/i18n';

const BADGE_BASE = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold';

export type TicketChipStatus = 'open' | 'answered' | 'closed' | 'unknown';

const CHIP_TINT: Record<TicketChipStatus, string> = {
  open: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
  answered: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  closed: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400',
  unknown: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400',
};

/** Narrow an arbitrary status (including a missing/unknown one) to a chip kind. */
export function chipStatus(status: string): TicketChipStatus {
  switch (status) {
    case 'open':
    case 'answered':
    case 'closed':
      return status;
    default:
      return 'unknown';
  }
}

/** Literal keyed label for a chip kind — never an interpolated key. */
function chipLabel(status: TicketChipStatus): string {
  switch (status) {
    case 'open':
      return t('ticket.statusOpen');
    case 'answered':
      return t('ticket.statusAnswered');
    default:
      return t('ticket.statusClosed');
  }
}

export default function TicketStatusChip({ status }: { status: string }) {
  const normalized = chipStatus(status);
  return <span className={`${BADGE_BASE} ${CHIP_TINT[normalized]}`}>{chipLabel(normalized)}</span>;
}
