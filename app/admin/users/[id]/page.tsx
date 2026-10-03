// /admin/users/[id] — ADM-02 read-only user profile. Enforcement lives HERE
// (layouts are not a boundary — T-05-01): signed-out → /login, no/wrong role →
// 404. The route param is our internal `User.id` (A4) — never a telegram id.
//
// The three sub-sections (keys / payments / tickets) each load and degrade
// INDEPENDENTLY behind their own Suspense boundary and their own catch: an
// ARTEMIDA-backed keys failure blanks ONLY the Keys card (admin.profilePartial +
// common.retry) while the header, payments and tickets still render (UI-SPEC §4).
// An EMPTY section renders its own distinct copy — never the errored copy.
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import AdminKeyRow from '@/components/admin/AdminKeyRow';
import UserProfileCard from '@/components/admin/UserProfileCard';
import PaymentStatusChip from '@/components/PaymentStatusChip';
import TicketStatusChip from '@/components/TicketStatusChip';
import { formatPaymentDate } from '@/components/PaymentHistoryList';
import { requireRole } from '@/lib/admin-auth';
import {
  loadAdminHeader,
  loadAdminKeys,
  loadAdminPayments,
  loadAdminTickets,
} from '@/lib/admin-service';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import type { OrderHistoryRow } from '@/lib/orders-service';
import { AdminError, SessionError } from '@/lib/session';
import type { TicketListRow } from '@/lib/tickets-service';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const ROW = 'flex flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const SECTION_TITLE = 'text-xl font-semibold text-black dark:text-zinc-50';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

const priceFormatter = new Intl.NumberFormat('ru-RU');

/** Loading fallback for one sub-section (UI-SPEC §4). */
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10"
        />
      ))}
    </section>
  );
}

/** Failed sub-section: this section alone shows partial + retry (UI-SPEC §4). */
function PartialSection({ userId, title }: { userId: number; title: string }) {
  return (
    <section className={CARD} role="alert">
      <h2 className={SECTION_TITLE}>{title}</h2>
      <p className="text-zinc-600 dark:text-zinc-400">{t('admin.profilePartial')}</p>
      <Link href={`/admin/users/${userId}`} className={SECONDARY}>
        {t('common.retry')}
      </Link>
    </section>
  );
}

/** Empty sub-section: distinct keyed copy (never the errored copy). */
function EmptySection({ title, body }: { title: string; body: string }) {
  return (
    <section className={CARD}>
      <h2 className={SECTION_TITLE}>{title}</h2>
      <p className="text-zinc-600 dark:text-zinc-400">{body}</p>
    </section>
  );
}

/** Literal keyed kind label — a raw kind is never rendered (UI-SPEC). */
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

async function KeysSection({ userId }: { userId: number }) {
  const title = t('admin.profileKeys');
  let keys;
  try {
    keys = await loadAdminKeys(userId);
  } catch {
    logger.error({ route: 'admin-user-profile', outcome: 'keys_load_failed' });
    return <PartialSection userId={userId} title={title} />;
  }
  if (keys.length === 0) {
    return <EmptySection title={title} body={t('admin.profileNoKeys')} />;
  }
  return (
    <section className={CARD}>
      <h2 className={SECTION_TITLE}>{title}</h2>
      <div className="flex flex-col gap-4">
        {keys.map((key) => (
          <AdminKeyRow key={key.id} item={key} />
        ))}
      </div>
    </section>
  );
}

async function PaymentsSection({ userId }: { userId: number }) {
  const title = t('admin.profilePayments');
  let rows: OrderHistoryRow[];
  try {
    rows = await loadAdminPayments(userId);
  } catch {
    logger.error({ route: 'admin-user-profile', outcome: 'payments_load_failed' });
    return <PartialSection userId={userId} title={title} />;
  }
  if (rows.length === 0) {
    return <EmptySection title={title} body={t('admin.profileNoPayments')} />;
  }
  return (
    <section className={CARD}>
      <h2 className={SECTION_TITLE}>{title}</h2>
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <article key={row.id} className={ROW}>
            <div className="flex items-start justify-between gap-3">
              <span className="text-xl font-semibold tabular-nums text-black dark:text-zinc-50">
                {t('pay.amount', { price: priceFormatter.format(row.amount) })}
              </span>
              <PaymentStatusChip status={row.status} />
            </div>
            <dl className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
              <div className="flex gap-2">
                <dd>{t('pay.date', { date: formatPaymentDate(row.createdAt) })}</dd>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <dd className="shrink-0">{kindLabel(row.kind)}</dd>
                {row.keyId && (
                  <>
                    <dd aria-hidden>·</dd>
                    <dd className="min-w-0 truncate" title={row.keyId}>
                      {row.keyId}
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

async function TicketsSection({ userId }: { userId: number }) {
  const title = t('admin.profileTickets');
  let rows: TicketListRow[];
  try {
    rows = await loadAdminTickets(userId);
  } catch {
    logger.error({ route: 'admin-user-profile', outcome: 'tickets_load_failed' });
    return <PartialSection userId={userId} title={title} />;
  }
  if (rows.length === 0) {
    return <EmptySection title={title} body={t('admin.profileNoTickets')} />;
  }
  return (
    <section className={CARD}>
      <h2 className={SECTION_TITLE}>{title}</h2>
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <article key={row.id} className={ROW}>
            <Link
              href={`/admin/tickets/${encodeURIComponent(row.id)}`}
              className="flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className="min-w-0 flex-1 truncate text-xl font-semibold text-black dark:text-zinc-50"
                  title={row.subject}
                >
                  {row.subject}
                </span>
                <TicketStatusChip status={row.status} />
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {t('ticket.lastActivity', { date: formatPaymentDate(row.lastMessageAt) })}
              </p>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function AdminUserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireRole('administrator', 'support', 'manager');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId <= 0) notFound();

  const header = await loadAdminHeader(userId);
  if (!header) notFound();

  return (
    <section className="flex flex-col gap-6">
      <UserProfileCard header={header} />

      {/* Independent boundaries: one failing read cannot blank the others. */}
      <Suspense fallback={<SkeletonRows />}>
        <KeysSection userId={userId} />
      </Suspense>
      <Suspense fallback={<SkeletonRows />}>
        <PaymentsSection userId={userId} />
      </Suspense>
      <Suspense fallback={<SkeletonRows />}>
        <TicketsSection userId={userId} />
      </Suspense>
    </section>
  );
}
