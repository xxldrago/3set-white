import EmailAuthCard, { type AuthMode } from '@/components/EmailAuthCard';
import LoginButton from '@/components/LoginButton';
import InstallPrompt from '@/components/InstallPrompt';
import TelegramBotLoginButton from '@/components/TelegramBotLoginButton';
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
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            {t('login.title')}
          </h1>
          <p className="text-base leading-6 text-muted">
            {t('login.text')}
          </p>
        </header>
        <EmailAuthCard initialMode={initialMode} />
        {/* D-91 / G-06-4b: bot-redirect login is the primary Telegram entry.
            One tap opens the bot where authorization happens. */}
        <div className="flex flex-col items-center">
          <TelegramBotLoginButton />
        </div>
        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-foreground/10" />
          <span className="text-sm text-muted">{t('auth.orContinue')}</span>
          <span className="h-px flex-1 bg-foreground/10" />
        </div>
        <TelegramWidgetSlot>
          <LoginButton />
        </TelegramWidgetSlot>
        <InstallPrompt />
      </main>
    </div>
  );
}
