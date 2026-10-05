'use client';

// Bot-redirect Telegram login (G-06-4b client, plan 06-07; code entry plan
// 06-09). Consumes the frozen 06-06 contract plus the CR-01 confirmation code:
// request → open the t.me deep link → poll status → on `ready` the user enters
// the code the bot sent → consume → redirect into the signed-in cabinet.
//
// The httpOnly session/claim cookies are handled entirely by the browser
// cookie jar: this island never reads or writes a cookie and makes no
// client-side trust decisions. The claim cookie is scoped to
// /api/auth/telegram-bot, so `consume` automatically presents the token binding
// the issuing browser (T-06-06-01); the code — delivered only to the
// authorizing Telegram chat — additionally binds the *authorizer* (CR-01 /
// T-06-09-01).
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';

const REQUEST_ENDPOINT = '/api/auth/telegram-bot/request';
const STATUS_ENDPOINT = '/api/auth/telegram-bot/status';
const CONSUME_ENDPOINT = '/api/auth/telegram-bot/consume';
const POLL_INTERVAL_MS = 2000;
const CODE_LENGTH = 6;

type BotLoginState = 'idle' | 'waiting' | 'ready' | 'expired' | 'error';

const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';
const CODE_INPUT =
  'h-12 w-full rounded-full border border-solid border-black/[.08] bg-transparent px-5 text-center text-lg tracking-[0.5em] outline-none focus:border-black/40 disabled:opacity-50 dark:border-white/[.145] dark:focus:border-white/40';

export default function TelegramBotLoginButton() {
  const [state, setState] = useState<BotLoginState>('idle');
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeWrong, setCodeWrong] = useState(false);
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

  // Submit the bot-delivered code with the issuing browser's token + claim
  // cookie. A wrong code (401, indistinguishable from a bad claim) clears the
  // field and stays in `ready`; a terminal token (409) falls back to `expired`.
  const submitCode = useCallback(async () => {
    if (inFlight.current || token === null) return;
    if (!/^\d{6}$/.test(code)) {
      setCodeWrong(true);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const res = await fetch(CONSUME_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, code }),
      });
      if (cancelled.current) return;
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      if (res.status === 401) {
        setCodeWrong(true);
        setCode('');
        return;
      }
      fail(res.status === 409 ? 'expired' : 'error');
    } catch {
      if (!cancelled.current) setState('error');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [code, fail, token]);

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
          // The bot bound the token: stop polling and require the confirmation
          // code before consuming (CR-01).
          stopTimers();
          setToken(tok);
          setState('ready');
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
    [fail, stopTimers],
  );

  const issue = useCallback(async () => {
    if (inFlight.current) return; // in-flight lock
    inFlight.current = true;
    setBusy(true);
    stopTimers();
    openedFor.current = null;
    setToken(null);
    setCode('');
    setCodeWrong(false);
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
    // min-h reserves the tallest (code-entry) state so the idle→waiting→ready
    // swap does not shift the surrounding layout.
    <div className="flex min-h-[11rem] w-full flex-col gap-3">
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

      {state === 'ready' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode();
          }}
          className="flex w-full flex-col gap-3"
        >
          <label
            htmlFor="tg-login-code"
            className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400"
          >
            <span className="font-medium text-black dark:text-zinc-50">
              {t('auth.botLoginCodeLabel')}
            </span>
            <span>{t('auth.botLoginCodePrompt')}</span>
          </label>
          <input
            id="tg-login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH));
              setCodeWrong(false);
            }}
            disabled={busy}
            aria-invalid={codeWrong}
            className={CODE_INPUT}
          />
          {codeWrong && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {t('auth.botLoginCodeWrong')}
            </p>
          )}
          <button type="submit" disabled={busy || code.length !== CODE_LENGTH} className={PRIMARY}>
            {t('auth.botLoginCodeSubmit')}
          </button>
        </form>
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
