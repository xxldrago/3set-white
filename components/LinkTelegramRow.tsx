'use client';

// Telegram method row (Phase 6 UI-SPEC §3): linked → status + unlink CTA that
// opens the inline confirm; unlinked → link CTA that opens the same Telegram
// widget in a bounded in-flow TelegramWidgetSlot (slot rules from §1 apply —
// centered, in-flow, no absolute/fixed positioning). The widget payload is
// POSTed to the LINK route (dual proof: session + widget, T-06-05) —
// LoginButton itself is login-only and stays untouched.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import TelegramWidgetInjector from './TelegramWidgetInjector';
import { t } from '@/lib/i18n';
import TelegramWidgetSlot from './TelegramWidgetSlot';
import UnlinkConfirmPanel from './UnlinkConfirmPanel';

const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '';

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-base text-foreground">{t('auth.methodTelegram')}</span>
          <span className="truncate text-sm tabular-nums text-muted">
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
           <TelegramWidgetInjector
             botUsername={BOT_USERNAME}
             onAuth={(user) => {
               void postLink(user);
             }}
              requestAccess="write"
           />
          {linkPending && (
            <div className="h-5 w-32 animate-pulse rounded-full bg-foreground/5" aria-hidden />
          )}
          {linkError && (
            <div className="flex flex-col gap-2" role="alert">
              <p className="text-sm text-red-600">{t('login.error')}</p>
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
