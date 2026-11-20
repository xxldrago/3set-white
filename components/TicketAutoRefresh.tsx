'use client';

// Auto-refresh island for the ticket thread (full-chat UX). Polls the thread
// endpoint every few seconds while the tab is visible and refreshes the RSC so
// new messages (from the other side) appear without a manual reload. Pauses
// when the tab is hidden to avoid wasted traffic; resumes on focus. A failure is
// silent — the next tick retries. Never runs on the server.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const POLL_MS = 5000;

export default function TicketAutoRefresh({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();
    };
    timerRef.current = setInterval(tick, POLL_MS);
    const onFocus = () => router.refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [router, ticketId]);

  return null;
}
