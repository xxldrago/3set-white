// /admin/tickets — the shared ticket queue for administrator + support
// (ADM-01 / UI-SPEC §7). Enforcement lives HERE (layouts are not a boundary —
// T-05-01): signed-out → /login, no/wrong role → 404. The list is NOT
// owner-scoped — the resolved role is the authorization. Rows render through
// the Phase 4 `TicketList` (subject/status/requester/last-activity/preview only,
// never a raw ticket id or provider text); the admin variant links to
// `/admin/tickets`.
//
// Inbox 2.0: status/unread filters, free-text search (subject, any message,
// requester email/@username/name) and offset pagination. Filter state lives in
// the URL so links are shareable and the back button works.
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import TicketList from '@/components/TicketList';
import { requireRole } from '@/lib/admin-auth';
import {
  loadAllTickets,
  type AdminTicketFilter,
  type AdminTicketListPage,
} from '@/lib/admin-service';
import { t, tp } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-lg border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line ';
const INPUT =
  'h-11 min-w-48 flex-1 rounded-lg border border-solid border-line bg-background px-4 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20';
const FILTER_ACTIVE =
  'flex h-9 items-center rounded-full bg-foreground px-4 text-sm text-lime';
const FILTER_INACTIVE =
  'flex h-9 items-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5';

const FILTERS: AdminTicketFilter[] = ['all', 'open', 'answered', 'closed', 'unread'];

interface AdminTicketsSearchParams {
  status?: string | string[];
  q?: string | string[];
  page?: string | string[];
}

/** Repeated query params (`?q=a&q=b`) arrive as arrays; take the first value. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilter(value: string | undefined): AdminTicketFilter {
  switch (value) {
    case 'open':
    case 'answered':
    case 'closed':
    case 'unread':
      return value;
    default:
      return 'all';
  }
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

/** Literal keyed labels — never an interpolated key (i18n completeness test). */
function filterLabel(filter: AdminTicketFilter): string {
  switch (filter) {
    case 'all':
      return t('admin.ticketsFilterAll');
    case 'open':
      return t('admin.ticketsFilterOpen');
    case 'answered':
      return t('admin.ticketsFilterAnswered');
    case 'closed':
      return t('admin.ticketsFilterClosed');
    case 'unread':
      return t('admin.ticketsFilterUnread');
  }
}

function ticketsHref(filter: AdminTicketFilter, q: string, page = 1): string {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('status', filter);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/admin/tickets?${query}` : '/admin/tickets';
}

function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-foreground/5"
        />
      ))}
    </section>
  );
}

async function TicketsSection({
  filter,
  q,
  page,
}: {
  filter: AdminTicketFilter;
  q: string;
  page: number;
}) {
  let data: AdminTicketListPage;
  try {
    data = await loadAllTickets({ filter, q, page });
  } catch {
    logger.error({ route: 'admin-tickets', outcome: 'tickets_load_failed' });
    return (
      <section className={CARD} role="alert">
        <p className="text-muted">{t('common.errorLoad')}</p>
        <Link href={ticketsHref(filter, q)} className={SECONDARY}>
          {t('common.retry')}
        </Link>
      </section>
    );
  }

  if (data.total === 0) {
    return (
      <section className={CARD}>
        <h2 className="text-xl font-semibold text-foreground">
          {t('ticket.emptyHeading')}
        </h2>
        {q || filter !== 'all' ? (
          <p className="text-sm text-muted">{t('admin.ticketsEmptyFiltered')}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <span className="text-sm text-muted">{tp('ticket.count', data.total)}</span>
      <TicketList rows={data.rows} hrefBase="/admin/tickets" />
      {data.pageCount > 1 && (
        <nav
          className="flex items-center justify-between gap-2"
          aria-label={t('admin.ticketsPagination')}
        >
          {data.page > 1 ? (
            <Link href={ticketsHref(filter, q, data.page - 1)} className={SECONDARY}>
              {t('admin.ticketsPagePrev')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted">
            {t('admin.ticketsPageInfo', {
              page: data.page,
              pages: data.pageCount,
            })}
          </span>
          {data.page < data.pageCount ? (
            <Link href={ticketsHref(filter, q, data.page + 1)} className={SECONDARY}>
              {t('admin.ticketsPageNext')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams?: Promise<AdminTicketsSearchParams>;
}) {
  try {
    await requireRole('administrator', 'support');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const sp = (await searchParams) ?? {};
  const filter = parseFilter(first(sp.status));
  const q = (first(sp.q) ?? '').trim().slice(0, 120);
  const page = parsePage(first(sp.page));

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">
        {t('ticket.listTitle')}
      </h2>

      <div className="flex flex-col gap-3">
        <form action="/admin/tickets" method="get" className="flex flex-wrap gap-2">
          {filter !== 'all' && <input type="hidden" name="status" value={filter} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={120}
            placeholder={t('admin.ticketsSearchPlaceholder')}
            aria-label={t('admin.ticketsSearchPlaceholder')}
            className={INPUT}
          />
          <button type="submit" className={SECONDARY}>
            {t('admin.ticketsSearchCta')}
          </button>
          {(q || filter !== 'all') && (
            <Link href="/admin/tickets" className={SECONDARY}>
              {t('admin.ticketsSearchClear')}
            </Link>
          )}
        </form>

        <nav className="flex flex-wrap gap-2" aria-label={t('admin.ticketsFilters')}>
          {FILTERS.map((item) => (
            <Link
              key={item}
              href={ticketsHref(item, q)}
              aria-current={item === filter ? 'page' : undefined}
              className={item === filter ? FILTER_ACTIVE : FILTER_INACTIVE}
            >
              {filterLabel(item)}
            </Link>
          ))}
        </nav>
      </div>

      <Suspense fallback={<SkeletonRows />}>
        <TicketsSection filter={filter} q={q} page={page} />
      </Suspense>
    </section>
  );
}
