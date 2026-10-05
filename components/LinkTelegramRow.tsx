'use client';

// Telegram method row (Phase 6 UI-SPEC §3): linked → status + unlink CTA that
// opens the inline confirm; unlinked → link CTA that opens the same Telegram
// widget in a bounded in-flow TelegramWidgetSlot (slot rules from §1 apply —
// centered, in-flow, no absolute/fixed positioning). The widget payload is
// POSTed to the LINK route (dual proof: session + widget, T-06-05) —
// LoginButton itself is login-only and stays untouched.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { t } from '@/lib/i18n';
import TelegramWidgetSlot from './TelegramWidgetSlot';
import UnlinkConfirmPanel from './UnlinkConfirmPanel';

const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '';

interface TelegramAccount {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramLink?: (user: TelegramAccount) => void;
  }
}

interface LinkTelegramRowProps {
  linked: boolean;
  telegramId: number | null;
}

export default function LinkTelegramRow({ linked, telegramId }: LinkTelegramRowProps) {
  const router = useRouter();
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [linkPending, setLinkPending] = useState(false);
  const [linkError, setLinkError] = useState(false);

  const postLink = useCallback(
    async (payload: unknown) => {
      setLinkPending(true);
      setLinkError(false);
      try {
        const res = await fetch('/api/auth/email/link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('link_failed');
        setLinkOpen(false);
        router.refresh();
      } catch {
        setLinkError(true);
      } finally {
        setLinkPending(false);
      }
    },
    [router],
  );

  useEffect(() => {
    window.onTelegramLink = (user: TelegramAccount) => {
      void postLink(user);
    };
    return () => {
      delete window.onTelegramLink;
    };
  }, [postLink]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-base text-black dark:text-zinc-50">{t('auth.methodTelegram')}</span>
          <span className="truncate text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
            {linked && telegramId !== null
              ? t('auth.tgLinked', { id: telegramId })
              : t('auth.tgNotLinked')}
          </span>
        </div>
        {linked ? (
          !unlinkOpen && (
            <button type="button" onClick={() => setUnlinkOpen(true)} className={SECONDARY}>
              {t('auth.unlinkCta')}
            </button>
          )
        ) : (
          BOT_USERNAME &&
          !linkOpen && (
            <button type="button" onClick={() => setLinkOpen(true)} className={SECONDARY}>
              {t('auth.linkCta')}
            </button>
          )
        )}
      </div>

      {linked && unlinkOpen && (
        <UnlinkConfirmPanel
          onClose={() => setUnlinkOpen(false)}
          onDone={() => {
            setUnlinkOpen(false);
            router.refresh();
          }}
        />
      )}

      {!linked && linkOpen && BOT_USERNAME && (
        <TelegramWidgetSlot>
          <Script
            src="https://telegram.org/js/telegram-widget.js?22"
            data-telegram-login={BOT_USERNAME}
            data-size="large"
            data-onauth="onTelegramLink(user)"
            data-request-access="write"
            strategy="afterInteractive"
          />
          {linkPending && (
            <div className="h-5 w-32 animate-pulse rounded-full bg-black/5 dark:bg-white/10" aria-hidden />
          )}
          {linkError && (
            <div className="flex flex-col gap-2" role="alert">
              <p className="text-sm text-red-600 dark:text-red-400">{t('login.error')}</p>
              <button
                type="button"
                onClick={() => setLinkError(false)}
                className={SECONDARY}
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </TelegramWidgetSlot>
      )}
    </div>
  );
}
