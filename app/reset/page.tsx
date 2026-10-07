import { redirect } from 'next/navigation';
import ResetRequestForm from '@/components/ResetRequestForm';
import { t } from '@/lib/i18n';
import { SessionError, requireSession } from '@/lib/session';

export const metadata = {
  title: `${t('auth.resetTitle')} — ${t('app.name')}`,
};

// Signed-out-only surface: a signed-in visitor is already past reset.
export default async function ResetPage() {
  try {
    await requireSession();
    redirect('/');
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            {t('auth.resetTitle')}
          </h1>
          <p className="text-base leading-6 text-muted">
            {t('auth.resetIntro')}
          </p>
        </header>
        <ResetRequestForm />
      </main>
    </div>
  );
}
