'use client';

// Device mutation island (CAB-03). The key-detail page is an async RSC, so the
// browser-only fetch + refresh lives here. Calls only the session-gated BFF
// device routes; the ARTEMIDA key never reaches the browser. On success it
// asks the router to re-render the server component so the device list
// reflects reality.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

export type ConfirmKind = 'delete' | 'clear';

interface ConfirmPanelProps {
  kind: ConfirmKind;
  url: string;
  method: 'DELETE' | 'POST';
}

export default function ConfirmPanel({ kind, url, method }: ConfirmPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const triggerLabel = kind === 'delete' ? t('devices.delete') : t('devices.clear');

  const mutate = useCallback(async () => {
    setPending(true);
    setError(false);
    try {
      const res = await fetch(url, { method });
      if (!res.ok) throw new Error('device_mutation_failed');
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }, [router, url, method]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => void mutate()}
        className="flex h-11 shrink-0 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        {triggerLabel}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t('common.errorLoad')}
        </p>
      )}
    </div>
  );
}
