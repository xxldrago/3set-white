import LoginButton from '@/components/LoginButton';
import InstallPrompt from '@/components/InstallPrompt';
import { t } from '@/lib/i18n';

export const metadata = {
  title: `${t('login.title')} — ${t('app.name')}`,
};

export default function LoginPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            {t('login.title')}
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            {t('login.text')}
          </p>
        </header>
        <LoginButton />
        <InstallPrompt />
      </main>
    </div>
  );
}
