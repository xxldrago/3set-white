// /admin/tickets — shared ticket queue for administrator + support
// (ADM-01 / UI-SPEC §7). The guard lives HERE, not only in the layout (layouts
// are not a security boundary — T-05-01): signed-out → /login, no staff role →
// 404, wrong role → 404, never 403 (D-51).
//
// The page resolves the first queue page server-side (so the inbox is present in
// the HTML and works without JS), then hands it to the client island which
// refetches `/api/admin/tickets/directory` for search, filter, sort and
// pagination. Nothing is rendered from fixtures: every row, counter, chart point
// and SLA figure is a real query over `tickets` + `ticket_messages` + `users`.
import { notFound, redirect } from 'next/navigation';
import TicketsApp from './TicketsApp';
import { requireRole } from '@/lib/admin-auth';
import {
  TICKET_QUEUE_DEFAULT_PAGE_SIZE,
  TICKET_QUEUE_FILTERS,
  TICKET_QUEUE_SORTS,
  adminTicketsInbox,
  type TicketQueueFilter,
  type TicketQueueSort,
} from '@/lib/admin-tickets-directory';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('ticket.listTitle')} — ${t('app.name')}`,
};

/** `searchParams` values arrive as `string | string[]`; take the first. */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseFilter(value: string | undefined): TicketQueueFilter {
  return value && (TICKET_QUEUE_FILTERS as readonly string[]).includes(value)
    ? (value as TicketQueueFilter)
    : 'all';
}

function parseSort(value: string | undefined): TicketQueueSort {
  return value && (TICKET_QUEUE_SORTS as readonly string[]).includes(value)
    ? (value as TicketQueueSort)
    : 'updated';
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await requireRole('administrator', 'support');
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    if (err instanceof AdminError) notFound();
    throw err;
  }

  const sp = (await searchParams) ?? {};
  const filter = parseFilter(first(sp.filter));
  const sort = parseSort(first(sp.sort));
  // "Ждут дольше" and "Тема" read naturally ascending; activity/created newest
  // first. An explicit `dir` still wins.
  const defaultDir: 'asc' | 'desc' = sort === 'sla' || sort === 'alpha' ? 'asc' : 'desc';
  const dir = first(sp.dir) === 'asc' ? 'asc' : first(sp.dir) === 'desc' ? 'desc' : defaultDir;
  const q = (first(sp.q) ?? '').trim().slice(0, 200);
  const page = parsePage(first(sp.page));

  const initial = await adminTicketsInbox({
    q,
    filter,
    sort,
    dir,
    page,
    pageSize: TICKET_QUEUE_DEFAULT_PAGE_SIZE,
  });

  return (
    <TicketsApp
      initial={initial}
      view={{ q, filter, sort, dir }}
    />
  );
}
