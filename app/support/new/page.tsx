// New ticket page shell (SUP-01/SUP-02, UI-SPEC §3). Session-gated RSC; the
// actual composer is the `CreateTicketForm` client island. No server id is
// passed to the client — the BFF resolves the caller from the signed session
// cookie and re-validates every field/attachment (T-04-21).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import CreateTicketForm from '@/components/CreateTicketForm';
import { t } from '@/lib/i18n';
import { requireTelegramSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('ticket.cta')} — ${t('app.name')}`,
};

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const SECONDARY =
  'flex h-12 items-center justify-center rounded-full border border-solid border-line px-5 transition-colors hover:bg-foreground/5 border-line ';

export default async function NewTicketPage() {
  try {
    await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            {t('ticket.cta')}
          </h1>
        </header>

        <section className={CARD}>
          <CreateTicketForm />
        </section>

        <nav className="flex flex-col gap-2 sm:flex-row">
          <Link href="/support" className={SECONDARY}>
            {t('ticket.listTitle')}
          </Link>
        </nav>
      </main>
    </div>
  );
}
