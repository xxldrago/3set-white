'use client';

// Full referral link + copy button for the home teaser. Rendered only for
// signed-in visitors (the server resolves their code); guests see the login
// CTA instead. Absolute URL — copy-paste ready for any messenger.
import { useCallback, useState } from 'react';
import { t } from '@/lib/i18n';

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground disabled:opacity-50';
const SECONDARY =
  'flex h-12 shrink-0 items-center justify-center rounded-full border border-solid border-line px-5 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50';

export default function ReferralLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [link]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          value={link}
          readOnly
          aria-label={t('auth.refYourLink')}
          className={INPUT}
          onFocus={(event) => event.target.select()}
        />
        <button type="button" onClick={() => void copy()} className={SECONDARY}>
          {t('auth.refCopy')}
        </button>
      </div>
      {copied && (
        <p role="status" className="text-sm text-green">
          {t('auth.refCopied')}
        </p>
      )}
    </div>
  );
}
