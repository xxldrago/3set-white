// /pay/success — public return page for a successful Platega payment.
//
// Platega redirects the payer here via the transaction's `return` URL. This page
// is deliberately session-free: a buyer who paid inside the Telegram bot may
// never have opened the cabinet, and bouncing them to /login after taking their
// money is the worst possible outcome. It renders a status message plus the
// right next step (bot chat or cabinet), and nothing else — no order data, no
// session lookup, no provider identifiers.
import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { t } from '@/lib/i18n';

// The bot username is a build-time public value (same one the Login Widget
// uses); when it is unset the page falls back to the cabinet CTA only.
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '';

export const metadata: Metadata = {
  title: `${t('pay.successTitle')} — ${t('app.name')}`,
};

const CARD =
  'flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-line bg-panel p-8 text-center';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-lg bg-lime px-5 text-sm font-bold text-black transition-opacity hover:opacity-90';
const SECONDARY =
  'flex h-12 w-full items-center justify-center rounded-lg border border-line px-5 text-sm font-bold transition-colors hover:bg-foreground/5';

export default async function PaySuccessPage({
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
          className="flex size-14 items-center justify-center rounded-full bg-lime/15 text-lime"
        >
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {t('pay.successTitle')}
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          {fromBot ? t('pay.successBotBody') : t('pay.successBody')}
        </p>
        <div className="mt-2 flex w-full flex-col gap-3">
          {fromBot && hasBot ? (
            <a href={`https://t.me/${BOT_USERNAME}`} className={PRIMARY}>
              {t('pay.successToBot')}
            </a>
          ) : (
            <Link href="/" className={PRIMARY}>
              {t('pay.successCabinet')}
            </Link>
          )}
          {fromBot && hasBot ? (
            <Link href="/" className={SECONDARY}>
              {t('pay.successCabinet')}
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
