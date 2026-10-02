// Client copy control for the subscription URL (CAB-04 / UI-SPEC long-text).
//
// DEV NOTE: the key-detail page is a server component, so clipboard access
// (browser-only API) lives here in the smallest possible client island. The
// value is passed as a prop from the server render; this component never
// fetches anything. The button keeps a ≥44px touch target (`h-11`) and the
// long-URL layout uses `break-all` in the parent.
'use client';

import { useState } from 'react';
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
      className="flex h-11 min-h-11 shrink-0 items-center justify-center rounded-full border border-solid border-black/[.08] px-5 text-sm font-semibold transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
    >
      {copied ? t('key.copied') : t('key.copy')}
    </button>
  );
}
