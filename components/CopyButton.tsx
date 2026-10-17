// Client copy control for the subscription URL (CAB-04 / UI-SPEC long-text).
//
// DEV NOTE: the key-detail page is a server component, so clipboard access
// (browser-only API) lives here in the smallest possible client island. The
// value is passed as a prop from the server render; this component never
// fetches anything. The button keeps a ≥44px touch target (`h-11`) and the
// long-URL layout uses `break-all` in the parent.
'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { t } from '@/lib/i18n';

export default function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-live="polite"
      className="flex h-12 min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg border border-solid border-line px-5 text-sm font-bold transition-colors hover:bg-foreground/5 border-line "
    >
      {copied ? (
        <Check className="h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <Copy className="h-4 w-4 shrink-0" aria-hidden />
      )}
      {copied ? t('key.copied') : t('key.copy')}
    </button>
  );
}
