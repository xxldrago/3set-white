import { getAdminRole } from '@/lib/admin-auth';
import { getSessionUser } from '@/lib/session';
import { unreadTicketCountForUser } from '@/lib/tickets-service';
import FaqClient from './FaqClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Инструкции — 3set VPN',
  description: 'Ответы на частые вопросы об 3set VPN: оплата, подключение, приложения, продление, устройства и личный кабинет.',
};

export default async function FaqPage() {
  const user = await getSessionUser();

  let isStaff = false;
  let unread = 0;
  if (user) {
    try {
      if (user.telegramId !== null) isStaff = (await getAdminRole(user.telegramId)) !== null;
    } catch {
      // Cosmetic badge — never fail the page on a role lookup.
    }
    try {
      unread = await unreadTicketCountForUser(user.userId);
    } catch {
      // The FAB/nav badge is non-critical.
    }
  }

  const name =
    user?.firstName?.trim() || user?.username?.trim() || user?.email?.split('@')[0] || 'друг';

  return <FaqClient name={name} email={user?.email ?? null} isStaff={isStaff} unread={unread} />;
}