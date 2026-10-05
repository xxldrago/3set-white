'use client';

// Bot-redirect Telegram login (G-06-4b client, plan 06-07). Consumes the
// frozen 06-06 contract: request → open the t.me deep link → poll status →
// consume → redirect into the signed-in cabinet.
//
// The httpOnly session/claim cookies are handled entirely by the browser
// cookie jar: this island never reads or writes a cookie and makes no
// client-side trust decisions. The claim cookie is scoped to
// /api/auth/telegram-bot, so `consume` automatically presents the token
// binding the issuing browser (T-06-06-01).
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';

const REQUEST_ENDPOINT = '/api/auth/telegram-bot/request';
const STATUS_ENDPOINT = '/api/auth/telegram-bot/status';
const CONSUME_ENDPOINT = '/api/auth/telegram-bot/consume';
const POLL_INTERVAL_MS = 2000;

type BotLoginState = 'idle' | 'waiting' | 'expired' | 'error';

const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

export default function TelegramBotLoginButton() {
  const [state, setState] = useState<BotLoginState>('idle');
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  const openedFor = useRef<string | null>(null);
  const openRef = useRef<HTMLAnchorElement>(null);

  const stopTimers = useCallback(() => {
    if (pollTimer.current !== null) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    if (expiryTimer.current !== null) {
      clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
  }, []);

  // Void every pending timer on unmount so a late poll can never setState or
  // redirect after the user has navigated away.
  useEffect(
    () => () => {
      cancelled.current = true;
      stopTimers();
    },
    [stopTimers],
  );

  const fail = useCallback(
    (next: BotLoginState) => {
      stopTimers();
      setState(next);
    },
    [stopTimers],
  );

  const consume = useCallback(
    async (tok: string) => {
      try {
        const res = await fetch(CONSUME_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: tok }),
        });
        if (cancelled.current) return;
        if (res.ok) {
          window.location.href = '/';
          return;
        }
      } catch {
        // fall through to the error state
      }
      if (cancelled.current) return;
      fail('error');
    },
    [fail],
  );

  const poll = useCallback(
    async (tok: string) => {
      if (cancelled.current) return;
      let stop = false;
      try {
        const res = await fetch(STATUS_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: tok }),
        });
        if (cancelled.current) return;
        if (!res.ok) {
          fail('error');
          return;
        }
        const data = (await res.json()) as { status?: string };
        if (data.status === 'ready') {
          await consume(tok);
          return;
        }
        if (data.status === 'expired' || data.status === 'consumed') {
          fail('expired');
          return;
        }
      } catch {
        // Transient network hiccup: keep polling until the token expires.
        stop = cancelled.current;
      }
      if (cancelled.current || stop) return;
      if (pollTimer.current !== null) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(() => void poll(tok), POLL_INTERVAL_MS);
    },
    [consume, fail],
  );

  const issue = useCallback(async () => {
    if (inFlight.current) return; // in-flight lock
    inFlight.current = true;
    setBusy(true);
    stopTimers();
    openedFor.current = null;
    try {
      const res = await fetch(REQUEST_ENDPOINT, { method: 'POST' });
      if (cancelled.current) return;
      if (!res.ok) {
        setState('error');
        return;
      }
      const data = (await res.json()) as {
        token?: unknown;
        botUrl?: unknown;
        expiresInSec?: unknown;
      };
      if (typeof data.token !== 'string' || typeof data.botUrl !== 'string') {
        setState('error');
        return;
      }
      setBotUrl(data.botUrl);
      setState('waiting');
      // Server-supplied lifetime only — never a client-invented countdown.
      const ttl =
        typeof data.expiresInSec === 'number' && Number.isFinite(data.expiresInSec)
          ? data.expiresInSec
          : 0;
      if (ttl > 0) {
        expiryTimer.current = setTimeout(() => {
          if (!cancelled.current) fail('expired');
        }, ttl * 1000);
      }
      void poll(data.token);
    } catch {
      if (!cancelled.current) setState('error');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [fail, poll, stopTimers]);

  // Best-effort auto-open: the waiting state renders the deep link as an
  // anchor (target=_blank rel=noopener) and we click it once, so a single tap
  // on the CTA takes the user to the bot. If the browser blocks the popup the
  // anchor is still there as the manual fallback.
  useEffect(() => {
    if (state !== 'waiting' || botUrl === null) return;
    if (openedFor.current === botUrl) return;
    openedFor.current = botUrl;
    openRef.current?.click();
  }, [state, botUrl]);

  return (
    <div className="flex w-full flex-col gap-3">
      {state === 'idle' && (
        <button type="button" onClick={() => void issue()} disabled={busy} className={PRIMARY}>
          {t('auth.loginViaBot')}
        </button>
      )}

      {state === 'waiting' && botUrl !== null && (
        <a
          ref={openRef}
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={PRIMARY}
        >
          {t('auth.botLoginWaiting')}
        </a>
      )}

      {state === 'expired' && (
        <>
          <p role="alert" className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('auth.botLoginExpired')}
          </p>
          <button type="button" onClick={() => void issue()} disabled={busy} className={PRIMARY}>
            {t('auth.loginViaBot')}
          </button>
        </>
      )}

      {state === 'error' && (
        <>
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {t('login.error')}
          </p>
          <button type="button" onClick={() => void issue()} disabled={busy} className={SECONDARY}>
            {t('common.retry')}
          </button>
        </>
      )}
    </div>
  );
}
