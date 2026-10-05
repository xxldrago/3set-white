import EmailAuthCard, { type AuthMode } from '@/components/EmailAuthCard';
import LoginButton from '@/components/LoginButton';
import InstallPrompt from '@/components/InstallPrompt';
import TelegramWidgetSlot from '@/components/TelegramWidgetSlot';
import { t } from '@/lib/i18n';

export const metadata = {
  title: `${t('login.title')} — ${t('app.name')}`,
};

// D-91 / AUTH-06: one centered max-w-md column, email form on top, Telegram
// widget below the divider — both siblings in normal document flow. The
// widget iframe is contained by TelegramWidgetSlot (no absolute/fixed
// positioning anywhere), which fixes the desktop bottom-left escape.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const initialMode: AuthMode = mode === 'register' ? 'register' : 'login';

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            {t('login.title')}
          </h1>
          <p className="text-base leading-6 text-zinc-600 dark:text-zinc-400">
            {t('login.text')}
          </p>
        </header>
        <EmailAuthCard initialMode={initialMode} />
        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">{t('auth.orContinue')}</span>
          <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        </div>
        <TelegramWidgetSlot>
          <LoginButton />
        </TelegramWidgetSlot>
        <InstallPrompt />
      </main>
    </div>
  );
}
