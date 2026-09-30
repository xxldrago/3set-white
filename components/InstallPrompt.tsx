'use client';

import { useCallback, useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

// Install prompt only: dismissing it leaves full web functionality —
// cabinet use is never gated on install acceptance (plan prohibition).
// The component renders nothing where the platform has no support (iOS).
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
  }, [deferred]);

  if (!deferred || dismissed) return null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-black/10 p-4 sm:flex-row sm:items-center dark:border-white/15">
      <p className="flex-1 text-sm text-zinc-600 dark:text-zinc-400">{t('app.tagline')}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void install()}
          className="flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          {t('pwa.install')}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex h-10 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          {t('pwa.dismiss')}
        </button>
      </div>
    </div>
  );
}
