// /pay/fail — public return page for a failed or abandoned Platega payment.
//
// Same session-free contract as /pay/success: Platega sends the payer here via
// the transaction's `failedUrl`, and a bot buyer without a cabinet session must
// still see a clear "nothing was charged" message with a way back.
import type { Metadata } from 'next';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { t } from '@/lib/i18n';

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '';

export const metadata: Metadata = {
  title: `${t('pay.failTitle')} — ${t('app.name')}`,
};

const CARD =
  'flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-line bg-panel p-8 text-center';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-lg bg-lime px-5 text-sm font-bold text-black transition-opacity hover:opacity-90';
const SECONDARY =
  'flex h-12 w-full items-center justify-center rounded-lg border border-line px-5 text-sm font-bold transition-colors hover:bg-foreground/5';

export default async function PayFailPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const fromBot = from === 'bot';
  const hasBot = BOT_USERNAME.length > 0;

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-12">
      <section className={CARD}>
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-full bg-danger/15 text-danger"
        >
          <XCircle className="size-7" />
        </span>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {t('pay.failTitle')}
        </h1>
        <p className="text-sm leading-relaxed text-muted">{t('pay.failBody')}</p>
        <div className="mt-2 flex w-full flex-col gap-3">
          <Link href="/" className={PRIMARY}>
            {t('pay.failBack')}
          </Link>
          {fromBot && hasBot ? (
            <a href={`https://t.me/${BOT_USERNAME}`} className={SECONDARY}>
              {t('pay.successToBot')}
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
