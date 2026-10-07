// Presentational payment-history list (PAY-04 / D-46/47/48, UI-SPEC §6).
//
// No data fetching here: the server page passes provider-free `OrderHistoryRow`
// values (amount/status/date/kind/keyId only). Rows render our stored amount
// verbatim (`tabular-nums`), the mapped status chip, a `DD.MM.YYYY · HH:mm`
// date, and `{kind} · {keyName|keyId}`. State coverage per UI-SPEC:
// - 0 rows   → `pay.historyEmpty` + a tariff CTA;
// - 1 row    → a single row, NO count header;
// - ≥2 rows  → a count header rendered through the RU plural helper `tp()`.
// A long key id truncates with ellipsis at container width and exposes the full
// value via `title` (UI-SPEC long-text backstop). A row with no key reference
// still renders amount+status+date and omits the key link (partial rule).
import Link from 'next/link';
import PaymentStatusChip from './PaymentStatusChip';
import { t, tp } from '@/lib/i18n';
import type { OrderHistoryRow } from '@/lib/orders-service';

const PRIMARY =
  'flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:opacity-90';

const priceFormatter = new Intl.NumberFormat('ru-RU');

/** `DD.MM.YYYY · HH:mm` (ru-RU) for a payment timestamp (UI-SPEC formatting). */
export function formatPaymentDate(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  return `${day} · ${time}`;
}

/** Literal keyed kind label — `{kind}` is never rendered raw (UI-SPEC). */
function kindLabel(kind: string): string {
  switch (kind) {
    case 'renew':
      return t('pay.kindRenew');
    case 'upgrade':
      return t('pay.kindUpgrade');
    default:
      return t('pay.kindNew');
  }
}

export default function PaymentHistoryList({ rows }: { rows: OrderHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-line p-6 border-line">
        <p className="text-muted">{t('pay.historyEmpty')}</p>
        <Link href="/#tariff" className={PRIMARY}>
          {t('key.buyCta')}
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {rows.length >= 2 && (
        <span className="text-sm text-muted">
          {tp('pay.historyCount', rows.length)}
        </span>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <article
            key={row.id}
            className="flex flex-col gap-3 rounded-2xl border border-line p-6 border-line"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-xl font-semibold tabular-nums text-foreground">
                {t('pay.amount', { price: priceFormatter.format(row.amount) })}
              </span>
              <PaymentStatusChip status={row.status} />
            </div>

            <dl className="flex flex-col gap-1 text-sm text-muted">
              <div className="flex gap-2">
                <dd>{t('pay.date', { date: formatPaymentDate(row.createdAt) })}</dd>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <dd className="shrink-0">{kindLabel(row.kind)}</dd>
                {row.keyId && (
                  <>
                    <dd aria-hidden>·</dd>
                    <dd className="min-w-0">
                      <Link
                        href={`/keys/${encodeURIComponent(row.keyId)}`}
                        title={row.keyId}
                        className="block truncate underline-offset-2 hover:underline"
                      >
                        {row.keyId}
                      </Link>
                    </dd>
                  </>
                )}
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
