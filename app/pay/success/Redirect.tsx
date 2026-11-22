'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Auto-redirect after a successful payment: 3s gives the user time to read
// the confirmation, then sends them to the cabinet (or the bot chat when
// `from=bot`). Keeps the manual buttons as a fallback.
export default function PaySuccessRedirect({ toBot, botUsername }: { toBot: boolean; botUsername: string }) {
  const router = useRouter();
  useEffect(() => {
    const target = toBot && botUsername ? `https://t.me/${botUsername}` : '/';
    const timer = setTimeout(() => {
      if (toBot && botUsername) {
        window.location.assign(target);
      } else {
        router.push(target);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [toBot, botUsername, router]);
  return null;
}