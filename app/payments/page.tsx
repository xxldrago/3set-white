// Payment history page (PAY-04, UI-SPEC §6). Session-gated RSC modeled on
// `app/page.tsx`: it reads ONLY the caller's orders from our own DB through
// `listOrdersForUser` (ownership-joined, no live Platega query — D-46) and
// hands the provider-free rows to the presentational `PaymentHistoryList`, which
// owns the empty / zero-one-many / long-text states. Load failure renders the
// Phase-2 error mapping (`common.errorLoad` + retry) and the loading state reuses
// the `SkeletonRows` pattern — never a raw provider string.
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import PaymentHistoryList from '@/components/PaymentHistoryList';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { listOrdersForUser, type OrderHistoryRow } from '@/lib/orders-service';
import { getSessionUser, requireTelegramSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

const CARD =
  'flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6';
const SECONDARY =
  'flex h-12 items-center justify-center rounded-lg border border-line px-5 transition-colors hover:bg-foreground/5';

/** Loading fallback while the DB read resolves (UI-SPEC loading state). */
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10"
        />
      ))}
    </section>
  );
}

async function HistorySection({ telegramId }: { telegramId: number }) {
  let rows: OrderHistoryRow[];
  try {
    rows = await listOrdersForUser(BigInt(telegramId));
  } catch {
    logger.error({ route: 'payments', outcome: 'history_load_failed' });
    return (
      <section className={CARD} role="alert">
        <p className="text-zinc-600 dark:text-zinc-400">{t('common.errorLoad')}</p>
        <Link href="/payments" className={SECONDARY}>
          {t('common.retry')}
        </Link>
      </section>
    );
  }
  return <PaymentHistoryList rows={rows} />;
}

export default async function PaymentsHistoryPage() {
  let telegramId: number;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const navUser = await getSessionUser();

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <Nav user={navUser} />
      <main className="flex flex-1 w-full max-w-3xl flex-col gap-8 px-6 py-12 sm:px-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            {t('pay.historyTitle')}
          </h1>
        </header>

        <Suspense fallback={<SkeletonRows />}>
          <HistorySection telegramId={telegramId} />
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
