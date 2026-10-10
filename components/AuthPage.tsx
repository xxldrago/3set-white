import EmailAuthCard, { type AuthMode } from '@/components/EmailAuthCard';
import InstallPrompt from '@/components/InstallPrompt';
import LoginButton from '@/components/LoginButton';
import TelegramBotLoginButton from '@/components/TelegramBotLoginButton';
import TelegramWidgetSlot from '@/components/TelegramWidgetSlot';
import { t } from '@/lib/i18n';

// Shared auth page body: /login (login first) and /signup (register first)
// render byte-identical chrome with a different initial segment. The landing
// ref code flows into register so external traffic attributes correctly.
export default function AuthPage({
  initialMode,
  referral,
}: {
  initialMode: AuthMode;
  referral?: string | null;
}) {
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
        <EmailAuthCard initialMode={initialMode} referral={referral} />
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
