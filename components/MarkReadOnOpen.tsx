'use client';

// One-shot mark-read island (D-58 / UI-SPEC §2). Fires exactly once on mount —
// guarded by a ref so a re-render or a StrictMode double-invoke cannot loop or
// double-POST — then refreshes the RSC so the unread badge clears. It NEVER runs
// on server render. A failure is SILENT: the badge simply stays and the marker
// retries on the next thread open (T-04-26).
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function MarkReadOnOpen({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch(`/api/tickets/${encodeURIComponent(ticketId)}/read`, { method: 'POST' })
      .then(() => router.refresh())
      .catch(() => {
        // silent — retried on the next thread open (D-58)
      });
  }, [ticketId, router]);

  return null;
}
