// /admin/partner/support — the partner's own support inbox. Only tickets of
// accounts the partner referred directly are shown; the shared staff queue is
// never linked here. Enforcement lives on this page and on every reply/close
// route (lib/partner-support.ts).
import Link from 'next/link';
import { requirePartnerUserId } from '@/lib/admin-partner';
import {
  PARTNER_TICKET_FILTERS,
  listPartnerTickets,
  type PartnerTicketFilter,
} from '@/lib/partner-support';

export const dynamic = 'force-dynamic';

const CARD = 'flex flex-col gap-3 rounded-2xl border border-line p-6';
const FILTER =
  'flex h-9 items-center rounded-lg border border-line px-3 text-sm transition-colors hover:bg-foreground/5';

const FILTER_LABELS: Record<PartnerTicketFilter, string> = {
  all: 'Все',
  unread: 'Непрочитанные',
  open: 'Открытые',
  answered: 'Отвеченные',
  closed: 'Закрытые',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Открыто',
  answered: 'Отвечено',
  closed: 'Закрыто',
};

function parseFilter(value: string | string[] | undefined): PartnerTicketFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (PARTNER_TICKET_FILTERS as readonly string[]).includes(raw)
    ? (raw as PartnerTicketFilter)
    : 'all';
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default async function PartnerSupportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const partnerId = await requirePartnerUserId();
  const sp = (await searchParams) ?? {};
  const filter = parseFilter(sp.filter);
  const { rows, stats } = await listPartnerTickets(partnerId, filter);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">Поддержка</h2>
        <p className="text-sm text-muted">
          Обращения ваших рефералов. Отвечайте здесь — пользователь получит ответ в
          кабинете и в Telegram.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-center min-w-0 sm:grid-cols-4">
        {[
          { label: 'Всего', value: stats.total },
          { label: 'Открыто', value: stats.open },
          { label: 'Отвечено', value: stats.answered },
          { label: 'Непрочитано', value: stats.unread },
        ].map((item) => (
          <div key={item.label} className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd className="truncate text-lg font-semibold tabular-nums text-foreground">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          {PARTNER_TICKET_FILTERS.map((value) => (
            <Link
              key={value}
              href={`/admin/partner/support?filter=${value}`}
              className={`${FILTER} ${
                filter === value ? 'border-lime/60 text-lime' : 'text-muted'
              }`}
            >
              {FILTER_LABELS[value]}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            Обращений пока нет. Когда реферал напишет в поддержку, тикет появится здесь.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Обращение
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Клиент
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Статус
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Сообщений
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold text-muted">
                    Обновлено
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-3 align-middle">
                      <Link
                        href={`/admin/partner/support/${encodeURIComponent(row.id)}`}
                        className="flex flex-col gap-1"
                      >
                        <span className="font-medium text-foreground">
                          {row.subject}
                          {row.unreadForAdmin > 0 && (
                            <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-xs font-bold text-black">
                              {row.unreadForAdmin}
                            </span>
                          )}
                        </span>
                        {row.preview && (
                          <span className="line-clamp-1 text-xs text-muted">{row.preview}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex flex-col">
                        <span className="text-foreground">
                          {row.requester.displayName ??
                            row.requester.email ??
                            `#${row.requester.userId}`}
                        </span>
                        {row.requester.email && row.requester.displayName && (
                          <span className="text-xs text-muted">{row.requester.email}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="rounded-full border border-line px-2 py-1 text-xs">
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle tabular-nums">{row.messageCount}</td>
                    <td className="px-3 py-3 align-middle tabular-nums text-muted">
                      {formatDateTime(row.lastMessageAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
