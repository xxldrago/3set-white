// Payment return / status page (PAY-01, UI-SPEC §2).
//
// Async RSC modeled on `app/keys/[id]/page.tsx`: the session gate resolves the
// telegram id server-side, the owned order is loaded through the
// ownership-joined `loadOrderForUser` (a non-owned order renders the same 404 as
// a missing one — T-03-hist-idor), and the status panel polls to a terminal
// state. When the order is `provisioned`, the delivered sub-link + locally
// rendered QR use the EXACT Phase-2 key-detail presentation; an unreadable
// sub-link degrades to `key.linkUnavailable` (hide copy + QR, never an empty
// QR). No provider field ever reaches the page (the panel consumes the
// provider-free row).
import { notFound, redirect } from 'next/navigation';
import OrderStatusPanel, { type DeliveredKey } from '@/components/OrderStatusPanel';
import { ArtemidaError } from '@/lib/artemida';
import { getKeyForUserId, getSubscriptionForUserId } from '@/lib/keys-service';
import { loadOrderForUserId, toHistoryRow } from '@/lib/orders-service';
import { renderSubscriptionQr } from '@/lib/qr';
import { requireSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Resolve the delivered-key surface for a provisioned order. The live
 * subscription read is ownership-joined; a provider failure degrades to the
 * cached mirror URL, and an absent URL degrades to `key.linkUnavailable` — a
 * fabricated/empty QR is never rendered.
 */
async function loadDelivered(
  userId: number,
  keyId: string,
): Promise<DeliveredKey> {
  let subscriptionUrl: string | null = null;
  try {
    const subscription = await getSubscriptionForUserId(userId, keyId);
    subscriptionUrl = subscription?.subscriptionUrl ?? null;
  } catch (err) {
    if (!(err instanceof ArtemidaError)) throw err;
    // Provider link fetch failed — fall through to the cache mirror.
  }
  if (!subscriptionUrl) {
    const key = await getKeyForUserId(userId, keyId);
    subscriptionUrl = key?.subscriptionUrl ?? null;
  }
  const qr = subscriptionUrl ? await renderSubscriptionQr(subscriptionUrl) : null;
  return { keyId, subscriptionUrl, qr };
}

export default async function PaymentReturnPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const { orderId } = await params;
  const order = await loadOrderForUserId(userId, orderId);
  if (!order) notFound();

  const delivered =
    order.status === 'provisioned' && order.provisionedKeyId
      ? await loadDelivered(userId, order.provisionedKeyId)
      : null;

  return (
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-6 px-6 py-12 sm:px-16">
        <OrderStatusPanel order={toHistoryRow(order)} delivered={delivered} />
      </main>
    </div>
  );
}
