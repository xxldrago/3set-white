'use client';

import { useCallback, useEffect, useState } from 'react';
import TelegramWidgetInjector from './TelegramWidgetInjector';
import { t } from '@/lib/i18n';

const AUTH_ENDPOINT = '/api/auth/telegram';
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? '';

interface TelegramUser {
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
    Telegram?: { WebApp?: { initData?: string } };
    onTelegramAuth?: (user: TelegramUser) => void;
  }
}

// T-04-01: this bridge posts payloads to the verified plan 01-03 auth route
// only and makes no client-side trust decisions; the session cookie stays
// httpOnly and is never readable here.
export default function LoginButton() {
  const [error, setError] = useState(false);
  const [webappAvailable, setWebappAvailable] = useState(false);

  const postPayload = useCallback(async (payload: unknown) => {
    setError(false);
    let res: Response;
    try {
      res = await fetch(AUTH_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      setError(true);
      return;
    }
    if (!res.ok) {
      setError(true);
      return;
    }
    window.location.href = '/';
  }, []);

  useEffect(() => {
    window.onTelegramAuth = (user: TelegramUser) => {
      void postPayload(user);
    };
    setWebappAvailable(Boolean(window.Telegram?.WebApp?.initData));
    return () => {
      delete window.onTelegramAuth;
    };
  }, [postPayload]);

  const loginFromBot = useCallback(() => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) {
      setError(true);
      return;
    }
    void postPayload({ initData });
  }, [postPayload]);

  return (
    <div className="flex flex-col gap-3">
      {BOT_USERNAME ? (
        <>
           <TelegramWidgetInjector
             botUsername={BOT_USERNAME}
             onAuth={postPayload}
             buttonSize="large"
             requestAccess="write"
           />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('login.widgetNote')}</p>
        </>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('login.widgetNote')}</p>
      )}
      {webappAvailable && (
        <>
          <button
            type="button"
            onClick={loginFromBot}
            className="flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            {t('home.loginCta')}
          </button>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('login.webappNote')}</p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t('login.error')}
        </p>
      )}
    </div>
  );
}
