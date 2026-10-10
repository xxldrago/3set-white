import VerifyConfirmForm from '@/components/VerifyConfirmForm';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('auth.verifyTitle')} — ${t('app.name')}`,
};

// The token is read server-side from the URL and passed as a prop — it is
// only ever POSTed back in the confirm body, never rendered.
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            {t('auth.verifyTitle')}
          </h1>
          <p className="text-base leading-6 text-muted">{t('auth.verifyIntro')}</p>
        </header>
        <VerifyConfirmForm token={token ?? null} />
      </main>
    </div>
  );
}
