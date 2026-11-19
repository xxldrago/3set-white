import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import InstallPrompt from '@/components/InstallPrompt';
import Nav from '@/components/Nav';
import { getSessionUser } from '@/lib/session';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('guides.title')} — ${t('app.name')}`,
};

export default async function GuidesPage() {
  const user = await getSessionUser();
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <Nav user={user} />
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-6 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            {t('guides.title')}
          </h1>
          <p className="text-lg leading-8 text-muted">
            {t('guides.intro')}
          </p>
        </header>
        <section className="flex flex-col gap-2 rounded-2xl border border-line p-6">
          <h2 className="text-xl font-medium">{t('guides.v2rayTitle')}</h2>
          <p className="text-muted">{t('guides.v2rayText')}</p>
        </section>
        <section className="flex flex-col gap-2 rounded-2xl border border-line p-6">
          <h2 className="text-xl font-medium">{t('guides.streisandTitle')}</h2>
          <p className="text-muted">{t('guides.streisandText')}</p>
        </section>
        <section className="flex flex-col gap-2 rounded-2xl border border-line p-6">
          <h2 className="text-xl font-medium">{t('guides.hiddifyTitle')}</h2>
          <p className="text-muted">{t('guides.hiddifyText')}</p>
        </section>
        <InstallPrompt />
        <nav>
          <Link
            href="/"
            className="flex h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold border border-line px-5 transition-colors hover:bg-foreground/5"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            {t('guides.back')}
          </Link>
        </nav>
      </main>
    </div>
  );
}
