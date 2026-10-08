import { redirect } from 'next/navigation';
import AccountSection from '@/components/AccountSection';
import Nav from '@/components/Nav';
import ReferralSection from '@/components/ReferralSection';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Профиль — 3set VPN',
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <Nav user={user} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold text-foreground">Профиль</h1>
        <AccountSection />
        <ReferralSection />
      </main>
    </div>
  );
}
