import Nav from '@/components/Nav';
import { getSessionUser } from '@/lib/session';
import FaqClient from './FaqClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'FAQ и помощь — 3set VPN',
  description: 'Ответы на частые вопросы об 3set VPN: оплата, подключение, приложения, продление, устройства и личный кабинет.',
};

export default async function FaqPage() {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <Nav user={user} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <FaqClient />
      </main>
    </div>
  );
}
