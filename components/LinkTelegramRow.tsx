'use client';

// Telegram method row (Phase 6 UI-SPEC §3): linked → status + unlink CTA that
// opens the inline confirm; unlinked → link CTA that runs the link-via-bot
// flow (bot deep link + automatic binding, no Login Widget, no phone
// number). The session gate + token ownership live server-side; this island
// only drives request → open bot → poll status → consume → refresh.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import UnlinkConfirmPanel from './UnlinkConfirmPanel';

const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50 border-line ';
const PRIMARY =
  'flex h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm text-lime transition-colors hover:bg-[#383838] disabled:opacity-50';

type LinkState = 'idle' | 'requesting' | 'waiting' | 'expired' | 'error';

const POLL_MS = 2000;

function LinkViaBot({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<LinkState>('idle');
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const consume = useCallback(
    async (token: string) => {
      try {
        const res = await fetch('/api/auth/email/link/consume', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelledRef.current) return;
        if (res.ok) {
          onDone();
          return;
        }
        const code = ((await res.json().catch(() => ({}))) as { error?: unknown }).error;
        setState(code === 'not_ready' ? 'waiting' : 'error');
        if (code === 'not_ready') schedule(token);
      } catch {
        if (!cancelledRef.current) setState('error');
      }
    },
    // schedule is hoisted via function declaration below — see note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onDone],
  );

  function schedule(token: string) {
    stop();
    timerRef.current = setTimeout(async () => {
      if (cancelledRef.current) return;
      try {
        const res = await fetch('/api/auth/email/link/status', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (cancelledRef.current) return;
        const body = (await res.json().catch(() => ({}))) as { status?: unknown };
        if (body.status === 'ready') {
          await consume(token);
        } else if (body.status === 'pending') {
          schedule(token);
        } else {
          setState('expired');
        }
      } catch {
        if (!cancelledRef.current) setState('error');
      }
    }, POLL_MS);
  }

  const request = useCallback(async () => {
    setState('requesting');
    try {
      const res = await fetch('/api/auth/email/link/request', { method: 'POST' });
      if (!res.ok) throw new Error('link_request_failed');
      const body = (await res.json()) as { token?: unknown; botUrl?: unknown };
      if (typeof body.token !== 'string' || typeof body.botUrl !== 'string') {
        throw new Error('link_shape_invalid');
      }
      if (cancelledRef.current) return;
      setBotUrl(body.botUrl);
      setState('waiting');
      window.open(body.botUrl, '_blank', 'noopener');
      schedule(body.token);
    } catch {
      if (!cancelledRef.current) setState('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {state === 'idle' && (
        <button type="button" onClick={() => void request()} className={PRIMARY}>
          {t('auth.linkCta')}
        </button>
      )}
      {(state === 'error' || state === 'expired') && (
        <button type="button" onClick={() => void request()} className={SECONDARY}>
          {t('common.retry')}
        </button>
      )}
      {state === 'requesting' && (
        <p className="text-sm text-muted">{t('auth.linkCtaLoading')}</p>
      )}
      {state === 'waiting' && botUrl && (
        <>
          <a href={botUrl} target="_blank" rel="noopener noreferrer" className={PRIMARY}>
            {t('auth.linkOpenBot')}
          </a>
          <p role="status" className="text-sm text-muted">
            {t('auth.linkWaiting')}
          </p>
        </>
      )}
      {state === 'expired' && (
        <p role="alert" className="text-sm text-red-600">
          {t('auth.linkExpired')}
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          {t('auth.linkError')}
        </p>
      )}
    </div>
  );
}

interface LinkTelegramRowProps {
  linked: boolean;
  telegramId: number | null;
}

export default function LinkTelegramRow({ linked, telegramId }: LinkTelegramRowProps) {
  const router = useRouter();
  const [unlinkOpen, setUnlinkOpen] = useState(false);

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
        {linked && !unlinkOpen && (
          <button type="button" onClick={() => setUnlinkOpen(true)} className={SECONDARY}>
            {t('auth.unlinkCta')}
          </button>
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

      {!linked && <LinkViaBot onDone={() => router.refresh()} />}
    </div>
  );
}
