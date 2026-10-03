'use client';

// Gated attachment thumbnail (SUP-02, UI-SPEC §4). The <img> source is ALWAYS
// the gated same-origin BFF route — never a stored path and never a public or
// third-party URL (D-56/T-04-25); the session cookie authorizes it server-side.
// An explicit width/height plus `max-h-64` reserves the box so the thread does
// not reflow; a pulse skeleton is shown until `onLoad`, and a load failure
// renders the keyed `ticket.attachmentError` tile — never a broken-image icon.
// Tapping the thumbnail opens the gated file in a new tab (no lightbox).
import { useState } from 'react';
import { t } from '@/lib/i18n';

interface AttachmentImageProps {
  ticketId: string;
  attachmentId: string;
  width: number | null;
  height: number | null;
}

export default function AttachmentImage({
  ticketId,
  attachmentId,
  width,
  height,
}: AttachmentImageProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const src = `/api/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(
    attachmentId,
  )}`;

  if (state === 'error') {
    return (
      <p className="rounded-xl border border-black/10 p-3 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-400">
        {t('ticket.attachmentError')}
      </p>
    );
  }

  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="relative block w-fit">
      {state === 'loading' && (
        <span
          aria-hidden
          className="absolute inset-0 block animate-pulse rounded-xl bg-black/5 dark:bg-white/10"
        />
      )}
      <img
        src={src}
        alt={t('ticket.attachmentAlt')}
        loading="lazy"
        decoding="async"
        width={width ?? undefined}
        height={height ?? undefined}
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
        className={`h-auto max-h-64 w-auto rounded-xl border border-black/10 dark:border-white/15 ${
          state === 'loading' ? 'invisible' : ''
        }`}
      />
    </a>
  );
}
