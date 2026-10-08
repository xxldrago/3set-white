'use client';

// Landing referral capture: pins `?ref=CODE` to the session account once.
// Fires once per mount; 401 (signed out) and re-pins are silent no-ops.
// Register carries its own `ref` field, so this covers Telegram/widget
// logins landing from a shared link.
import { useEffect, useRef } from 'react';

export default function RefCapture() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = (params.get('ref') ?? '').trim();
    if (!code) return;
    void fetch('/api/referrals/pin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => undefined);
  }, []);
  return null;
}
