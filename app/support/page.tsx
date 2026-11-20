// Support ticket list page (SUP-01, UI-SPEC §1). Session-gated RSC that loads
// the caller's real tickets through the ownership-scoped tickets service and
// hands them to the `SupportClient` client island rendered in the keys.html
// visual template. No client-supplied id is trusted — the session telegram id
// is the only scope (T-04-20). Load failure degrades to an empty list, never a
// raw DB string.
import { redirect } from 'next/navigation';
import SupportClient from './SupportClient';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import {
  listTicketsByUserId,
  unreadTicketCountForUser,
  type TicketListRow,
} from '@/lib/tickets-service';
import { getAdminRole } from '@/lib/admin-auth';
import { getSessionUser, requireSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('ticket.listTitle')} — 3set VPN`,
  description: 'Единая лента обращений в поддержку 3set VPN: создайте тикет, отслеживайте статус и отвечайте в одном окне.',
};

interface TicketRow {
  id: string;
  subject: string;
  status: TicketListRow['status'];
  unreadForUser: number;
  lastMessageAt: string;
  preview: string | null;
}

export default async function SupportPage() {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const user = await getSessionUser();

  let tickets: TicketRow[] = [];
  try {
    const rows = await listTicketsByUserId(userId);
    tickets = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      status: r.status,
      unreadForUser: r.unreadForUser,
      lastMessageAt: r.lastMessageAt.toISOString(),
      preview: r.preview,
    }));
  } catch {
    logger.error({ route: 'support', outcome: 'tickets_load_failed' });
  }

  let isStaff = false;
  let unread = 0;
  if (user) {
    try {
      if (user.telegramId !== null) {
        isStaff = (await getAdminRole(user.telegramId)) !== null;
      }
    } catch {
      // Cosmetic badge — never fail the page on a role lookup.
    }
    try {
      unread = await unreadTicketCountForUser(user.userId);
    } catch {
      // The unread badge is non-critical.
    }
  }

  return (
    <SupportClient tickets={tickets} user={user} isStaff={isStaff} unread={unread} />
  );
}
