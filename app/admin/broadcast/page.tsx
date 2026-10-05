import { notFound, redirect } from 'next/navigation';
import BroadcastComposer from '@/components/admin/BroadcastComposer';
import { requireRole } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { t } from '@/lib/i18n';
import { AdminError, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdminBroadcastPage() {
  try {
    await requireRole('administrator');
  } catch (error) {
    if (error instanceof SessionError) redirect('/login');
    if (error instanceof AdminError) notFound();
    throw error;
  }
  const recipients = await prisma.user.count({ where: { chatId: { not: null } } });
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{t('admin.broadcastTitle')}</h2>
        <p className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">{t('admin.broadcastRecipients', { n: recipients })}</p>
      </header>
      <BroadcastComposer />
    </section>
  );
}
