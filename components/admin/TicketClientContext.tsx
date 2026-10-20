// Compact requester context for the ticket workspace: current keys (status,
// expiry, devices) and recent payments. Reads degrade independently, so a
// failed keys read cannot blank the payment history. Full management stays on
// the user profile — this block is here so support does not have to leave the
// ticket to answer "what key/plan is this about?".
import Link from 'next/link';
import PaymentStatusChip from '@/components/PaymentStatusChip';
import { formatPaymentDate } from '@/components/PaymentHistoryList';
import { loadAdminKeys, loadAdminPayments } from '@/lib/admin-service';
import { formatKeyDate, statusLabel } from '@/lib/keys-service';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import type { OrderHistoryRow } from '@/lib/orders-service';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6';
const SECTION_TITLE = 'text-base font-semibold text-foreground';
const ROW = 'flex flex-col gap-1 rounded-xl border border-line p-3';
const priceFormatter = new Intl.NumberFormat('ru-RU');

function kindLabel(kind: OrderHistoryRow['kind']): string {
  switch (kind) {
    case 'renew':
      return t('pay.kindRenew');
    case 'upgrade':
      return t('pay.kindUpgrade');
    default:
      return t('pay.kindNew');
  }
}

export default async function TicketClientContext({ userId }: { userId: number }) {
  const [keysResult, paymentsResult] = await Promise.allSettled([
    loadAdminKeys(userId),
    loadAdminPayments(userId),
  ]);

  if (keysResult.status === 'rejected') {
    logger.error({ route: 'admin-ticket-context', outcome: 'keys_load_failed' });
  }
  if (paymentsResult.status === 'rejected') {
    logger.error({ route: 'admin-ticket-context', outcome: 'payments_load_failed' });
  }

  const keys = keysResult.status === 'fulfilled' ? keysResult.value.slice(0, 4) : null;
  const payments =
    paymentsResult.status === 'fulfilled' ? paymentsResult.value.slice(0, 5) : null;
  const profileLink = (
    <Link
      href={`/admin/users/${userId}`}
      className="shrink-0 text-xs text-muted hover:underline"
    >
      {t('admin.openProfile')}
    </Link>
  );

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={SECTION_TITLE}>{t('admin.profileKeys')}</h3>
          {profileLink}
        </div>
        {keys === null ? (
          <p role="alert" className="text-sm text-muted">
            {t('admin.profilePartial')}
          </p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.profileNoKeys')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {keys.map((key) => (
              <div key={key.id} className={ROW}>
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="min-w-0 truncate font-medium text-foreground"
                    title={key.name ?? key.id}
                  >
                    {key.name ?? key.id}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {statusLabel(key.statusKind, key.expiresAt)}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {t('key.expires', {
                    date: key.expiresAt ? formatKeyDate(key.expiresAt) : '—',
                  })}
                </p>
                <p className="text-xs text-muted">
                  {key.devices !== null && key.deviceLimit !== null
                    ? t('key.devicesCount', { n: key.devices, max: key.deviceLimit })
                    : '—'}
                  {key.isTrial ? ` · ${t('trial.badge')}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={CARD}>
        <div className="flex items-center justify-between gap-3">
          <h3 className={SECTION_TITLE}>{t('admin.profilePayments')}</h3>
          {profileLink}
        </div>
        {payments === null ? (
          <p role="alert" className="text-sm text-muted">
            {t('admin.profilePartial')}
          </p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.profileNoPayments')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {payments.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium tabular-nums text-foreground">
                    {t('pay.amount', { price: priceFormatter.format(row.amount) })}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {formatPaymentDate(row.createdAt)} · {kindLabel(row.kind)}
                  </span>
                </div>
                <PaymentStatusChip status={row.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
