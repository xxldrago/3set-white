'use client';

// Fires the admin mark-read once the thread is actually mounted. It is a
// client island on purpose: a server-side write during render would also run
// on RSC prefetch, clearing the badge for tickets the admin never opened.
//
// After a successful POST, `router.refresh()` re-renders the dynamic admin
// layout so the nav badge drops immediately. The marker itself stays mounted
// (effect deps are stable), so the refresh does not re-fire the POST.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminTicketReadMarker({ ticketId }: { ticketId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/tickets/${encodeURIComponent(ticketId)}/read`,
          { method: 'POST' },
        );
        if (!cancelled && res.ok) router.refresh();
      } catch {
        // The badge is cosmetic; a failed mark-read must not break the thread.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, router]);

  return null;
}
