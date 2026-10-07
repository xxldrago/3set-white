import { redirect } from 'next/navigation';
import ResetConfirmForm from '@/components/ResetConfirmForm';
import { t } from '@/lib/i18n';
import { SessionError, requireSession } from '@/lib/session';

export const metadata = {
  title: `${t('auth.resetConfirmTitle')} — ${t('app.name')}`,
};

// The token is read server-side from the URL and passed as a prop — it is
// only ever POSTed back in the confirm body, never rendered (D-88).
export default async function ResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  try {
    await requireSession();
    redirect('/');
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
  }

  const { token } = await searchParams;

  return (
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            {t('auth.resetConfirmTitle')}
          </h1>
        </header>
        <ResetConfirmForm token={typeof token === 'string' ? token : null} />
      </main>
    </div>
  );
}
