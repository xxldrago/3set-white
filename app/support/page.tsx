// Support ticket list page (SUP-01, UI-SPEC §1). Session-gated RSC modeled on
// `app/payments/page.tsx`: it reads ONLY the caller's tickets through the
// ownership-scoped service (the session telegram id is the only scope; no
// client-supplied id is trusted — T-04-20) and hands provider-free rows to the
// presentational `TicketList`. The header carries the count (≥2) and the create
// CTA; zero tickets renders the keyed empty state. Load failure renders the
// Phase-2 error mapping (`common.errorLoad` + retry) — never a raw DB string.
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import TicketList from '@/components/TicketList';
import { t, tp } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { listTicketsByUserId, type TicketListRow } from '@/lib/tickets-service';
import { getSessionUser, requireSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${t('ticket.listTitle')} — ${t('app.name')}`,
};

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6';
const PRIMARY =
  'flex h-12 items-center justify-center rounded-lg bg-foreground px-5 font-display text-sm font-medium tracking-wide text-lime transition-colors hover:opacity-90';
const SECONDARY =
  'flex h-12 items-center justify-center rounded-lg border border-line px-5 transition-colors hover:bg-foreground/5';

/** Loading fallback while the DB read resolves (UI-SPEC loading state). */
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-foreground/5"
        />
      ))}
    </section>
  );
}

async function TicketsSection({ userId }: { userId: number }) {
  let rows: TicketListRow[];
  try {
    rows = await listTicketsByUserId(userId);
  } catch {
    logger.error({ route: 'support', outcome: 'tickets_load_failed' });
    return (
      <section className={CARD} role="alert">
        <p className="text-muted">{t('common.errorLoad')}</p>
        <Link href="/support" className={SECONDARY}>
          {t('common.retry')}
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {rows.length >= 2 ? tp('ticket.count', rows.length) : ''}
        </span>
        <Link href="/support/new" className={`${PRIMARY} shrink-0`}>
          {t('ticket.cta')}
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className={CARD}>
          <h2 className="text-xl font-semibold text-foreground">
            {t('ticket.emptyHeading')}
          </h2>
          <p className="text-muted">{t('ticket.emptyBody')}</p>
          <Link href="/support/new" className={PRIMARY}>
            {t('ticket.cta')}
          </Link>
        </div>
      ) : (
        <TicketList rows={rows} />
      )}
    </section>
  );
}

export default async function SupportPage() {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const navUser = await getSessionUser();

  return (
    <div className="flex flex-col flex-1 items-center bg-background font-sans bg-background">
      <Nav user={navUser} />
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-foreground">
            {t('ticket.listTitle')}
          </h1>
        </header>

        <Suspense fallback={<SkeletonRows />}>
          <TicketsSection userId={userId} />
        </Suspense>

        <nav className="flex flex-col gap-2 sm:flex-row">
          <Link href="/" className={SECONDARY}>
            {t('guides.back')}
          </Link>
        </nav>
      </main>
    </div>
  );
}
