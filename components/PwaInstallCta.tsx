'use client';

// PWA install CTA for mobile users: uses the browser's beforeinstallprompt
// where available (Android/Chrome) and shows the platform hint otherwise
// (iOS Safari has no install event). Never blocks cabinet functionality.
import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export default function PwaInstallCta({ onDismiss }: { onDismiss?: () => void }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault(); // keep the native mini-infobar from covering the UI
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
    setInstalled(true);
    onDismiss?.();
  }, [deferred, onDismiss]);

  return (
    <>
      <b style={{ fontSize: 15 }}>Добавьте 3set на главный экран</b>
      <p className="muted" style={{ margin: '3px 0 0', fontSize: 13 }}>
        {installed
          ? 'Готово — иконка 3set появилась на главном экране.'
          : deferred
            ? 'Установите PWA в один тап: работает как приложение, без загрузки из магазина.'
            : 'Откройте меню браузера → «Установить приложение» (Android) или «Поделиться» → «На главный экран» (iOS).'}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {deferred && !installed && (
          <button className="btn btn-primary sm" onClick={() => void install()}>
            <Download aria-hidden />
            Установить
          </button>
        )}
        {!installed && onDismiss && (
          <button className="btn btn-quiet sm" onClick={onDismiss}>Не сейчас</button>
        )}
      </div>
    </>
  );
}
