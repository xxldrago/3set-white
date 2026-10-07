'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SECONDARY =
  'flex h-12 w-full items-center justify-center rounded-full border border-solid border-line px-5 transition-colors hover:bg-foreground/5 disabled:opacity-50';

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch('/api/auth/email/logout', { method: 'POST' });
    } catch {
      // Cookie clear is best-effort; still leave the cabinet.
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <button type="button" onClick={() => void signOut()} disabled={loading} className={SECONDARY}>
      {loading ? 'Выходим…' : 'Выйти'}
    </button>
  );
}
