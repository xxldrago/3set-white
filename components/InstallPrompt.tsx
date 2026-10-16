'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
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
    <div className="flex flex-col gap-2 rounded-2xl border border-line p-4 sm:flex-row sm:items-center border-line">
      <p className="flex-1 text-sm text-muted">{t('app.tagline')}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void install()}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm text-lime transition-colors hover:opacity-90"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          {t('pwa.install')}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 border-line "
        >
          <X className="h-4 w-4 shrink-0" aria-hidden />
          {t('pwa.dismiss')}
        </button>
      </div>
    </div>
  );
}
