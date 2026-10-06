// Presentational order-status chip (UI-SPEC §2 / color table).
//
// This is the ONLY place an order status maps to a label + tint: the literal
// `t("pay.status…")` calls below are the single registration point for the i18n
// scanner. Never build the key by interpolation, and never render a raw
// `order.status` string or a Platega status (T-03-raw-leak, D-19/D-24).
//
// Tint semantics (UI-SPEC):
// - provisioned         → green  (success)
// - paid / provisioning → amber  (money in, key not yet delivered)
// - pending / canceled / unknown → zinc (neutral)
// - failed / refunded   → red    (failure)
import { t } from '@/lib/i18n';

const BADGE_BASE = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold';

export type OrderChipStatus =
  | 'pending'
  | 'paid'
  | 'provisioning'
  | 'provisioned'
  | 'failed'
  | 'canceled'
  | 'refunded'
  | 'unknown';

const CHIP_TINT: Record<OrderChipStatus, string> = {
  provisioned: 'bg-green-600/10 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  paid: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
  provisioning: 'bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
  pending: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400',
  canceled: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400',
  unknown: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/10 dark:text-zinc-400',
  failed: 'bg-red-600/10 text-red-600 dark:bg-red-400/10 dark:text-red-400',
  refunded: 'bg-red-600/10 text-red-600 dark:bg-red-400/10 dark:text-red-400',
};

/** Narrow an arbitrary status (including a missing/unknown one) to a chip kind. */
export function chipStatus(status: string): OrderChipStatus {
  switch (status) {
    case 'provisioned':
    case 'paid':
    case 'provisioning':
    case 'pending':
    case 'canceled':
    case 'refunded':
    case 'failed':
      return status;
    default:
      return 'unknown';
  }
}

/** Literal keyed label for a chip kind — never an interpolated key. */
function chipLabel(status: OrderChipStatus): string {
  switch (status) {
    case 'provisioned':
      return t('pay.statusProvisioned');
    case 'paid':
      return t('pay.statusPaid');
    case 'provisioning':
      return t('pay.statusProvisioning');
    case 'pending':
      return t('pay.statusPending');
    case 'canceled':
      return t('pay.statusCanceled');
    case 'refunded':
      return t('pay.statusRefunded');
    case 'failed':
      return t('pay.statusFailed');
    default:
      return t('pay.statusUnknown');
  }
}

export default function PaymentStatusChip({ status }: { status: string }) {
  const normalized = chipStatus(status);
  return <span className={`${BADGE_BASE} ${CHIP_TINT[normalized]}`}>{chipLabel(normalized)}</span>;
}
