'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

const SECONDARY =
  'flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-bold border border-solid border-line px-5 transition-colors hover:bg-foreground/5 disabled:opacity-50';

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
      <LogOut className="h-4 w-4 shrink-0" aria-hidden />
      {loading ? 'Выходим…' : 'Выйти'}
    </button>
  );
}
