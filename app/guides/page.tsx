import Link from 'next/link';
import InstallPrompt from '@/components/InstallPrompt';
import { t } from '@/lib/i18n';

export const metadata = {
  title: `${t('guides.title')} — ${t('app.name')}`,
};

export default function GuidesPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            {t('guides.title')}
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            {t('guides.intro')}
          </p>
        </header>
        <section className="flex flex-col gap-2 rounded-2xl border border-black/10 p-6 dark:border-white/15">
          <h2 className="text-xl font-medium">{t('guides.v2rayTitle')}</h2>
          <p className="text-zinc-600 dark:text-zinc-400">{t('guides.v2rayText')}</p>
        </section>
        <section className="flex flex-col gap-2 rounded-2xl border border-black/10 p-6 dark:border-white/15">
          <h2 className="text-xl font-medium">{t('guides.streisandTitle')}</h2>
          <p className="text-zinc-600 dark:text-zinc-400">{t('guides.streisandText')}</p>
        </section>
        <section className="flex flex-col gap-2 rounded-2xl border border-black/10 p-6 dark:border-white/15">
          <h2 className="text-xl font-medium">{t('guides.hiddifyTitle')}</h2>
          <p className="text-zinc-600 dark:text-zinc-400">{t('guides.hiddifyText')}</p>
        </section>
        <InstallPrompt />
        <nav>
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            {t('guides.back')}
          </Link>
        </nav>
      </main>
    </div>
  );
}
