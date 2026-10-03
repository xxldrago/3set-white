'use client';

// Payment return / status panel (UI-SPEC §2, PAY-01).
//
// A client island so it can poll `GET /api/orders/{orderId}` every 3 s while the
// order is non-terminal; polling stops on any terminal state and after a 2-min
// cap (`pay.pollingSlow`). It receives the provider-free `OrderHistoryRow` and
// the server-rendered delivered-key data; on reaching `provisioned` it calls
// `router.refresh()` so the server re-renders and hands back the sub-link + QR
// (the QR is rendered server-side / never a remote URL). Every visible string
// resolves through `t()`; a raw Platega/ARTEMIDA status, transaction id, or HTTP
// code is never rendered (T-03-raw-leak, D-19/D-24).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CopyButton from './CopyButton';
import PaymentStatusChip from './PaymentStatusChip';
import QrSvg from './QrSvg';
import { t } from '@/lib/i18n';
import type { OrderHistoryRow, OrderStatus } from '@/lib/orders-service';

const CARD =
  'relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-black/10 p-6 dark:border-white/15';
const PRIMARY =
  'flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-black/[.08] px-4 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

const POLL_MS = 3000;
const CAP_MS = 120_000;

const TERMINAL = new Set<OrderStatus>(['provisioned', 'failed', 'canceled', 'refunded']);

/** Literal keyed body copy per order state — never a raw provider string. */
const STATUS_BODY: Record<OrderStatus, string> = {
  pending: t('pay.pendingBody'),
  paid: t('pay.paidBody'),
  provisioning: t('pay.provisioningBody'),
  provisioned: t('pay.provisionedBody'),
  failed: t('pay.failedBody'),
  canceled: t('pay.canceledBody'),
  refunded: t('pay.refundedBody'),
};

const priceFormatter = new Intl.NumberFormat('ru-RU');

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

function asOrderStatus(value: unknown, fallback: OrderStatus): OrderStatus {
  return typeof value === 'string' && value in STATUS_BODY
    ? (value as OrderStatus)
    : fallback;
}

/** Provider-free delivered-key view handed from the server page. */
export interface DeliveredKey {
  keyId: string;
  subscriptionUrl: string | null;
  qr: string | null;
}

export default function OrderStatusPanel({
  order,
  delivered,
}: {
  order: OrderHistoryRow;
  delivered: DeliveredKey | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (TERMINAL.has(status)) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      void (async () => {
        if (Date.now() - startedAt >= CAP_MS) {
          clearInterval(id);
          setSlow(true);
          return;
        }
        try {
          const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, {
            cache: 'no-store',
          });
          if (!res.ok) return;
          const body = (await res.json()) as { order?: { status?: unknown } };
          const next = asOrderStatus(body.order?.status, status);
          if (next !== status) {
            setStatus(next);
            if (TERMINAL.has(next)) {
              clearInterval(id);
              // Re-render the server page so the delivered key/QR arrives.
              router.refresh();
            }
          }
        } catch {
          // Transient poll failure — keep polling until the 2-min cap.
        }
      })();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [status, order.id, router]);

  const showProgress = status === 'paid' || status === 'provisioning';

  return (
    <section className={CARD} aria-live="polite">
      {showProgress && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-foreground"
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
          {t('pay.returnHeading')}
        </h2>
        <PaymentStatusChip status={status} />
      </div>

      <p className="text-base tabular-nums text-zinc-600 dark:text-zinc-400">
        {t('pay.summary', {
          kind: kindLabel(order.kind),
          price: priceFormatter.format(order.amount),
        })}
      </p>

      <p className="text-zinc-600 dark:text-zinc-400">{STATUS_BODY[status]}</p>

      {status === 'pending' && (
        <Link href="/#tariff" className={SECONDARY}>
          {t('pay.cta')}
        </Link>
      )}

      {status === 'failed' && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/#tariff" className={SECONDARY}>
            {t('common.retry')}
          </Link>
          <Link href="/payments" className={SECONDARY}>
            {t('pay.toHistory')}
          </Link>
        </div>
      )}

      {status === 'canceled' && (
        <Link href="/#tariff" className={SECONDARY}>
          {t('pay.retry')}
        </Link>
      )}

      {status === 'refunded' && (
        <Link href="/payments" className={SECONDARY}>
          {t('pay.toHistory')}
        </Link>
      )}

      {status === 'provisioned' && delivered && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xl font-semibold text-black dark:text-zinc-50">
            {t('key.linkTitle')}
          </h3>

          {delivered.subscriptionUrl ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="line-clamp-2 max-w-full break-all text-sm text-zinc-700 dark:text-zinc-300">
                  {delivered.subscriptionUrl}
                </code>
                <CopyButton value={delivered.subscriptionUrl} />
              </div>
              {delivered.qr && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <QrSvg svg={delivered.qr} />
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t('key.qrCaption')}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">{t('key.linkUnavailable')}</p>
          )}

          <Link href={`/keys/${encodeURIComponent(delivered.keyId)}`} className={PRIMARY}>
            {t('pay.toKey')}
          </Link>
        </div>
      )}

      {slow && !TERMINAL.has(status) && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('pay.pollingSlow')}
        </p>
      )}
    </section>
  );
}
