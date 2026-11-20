'use client';

// Share a link to Telegram / WhatsApp / Instagram / Viber plus a generic
// navigator.share fallback. Instagram has no public web share intent, so its
// button copies the link with an honest "pasted into Instagram" status.
import Link from 'next/link';
import { useCallback, useState, type ReactNode } from 'react';
import { Share2 } from 'lucide-react';

interface Props {
  /** Absolute URL or app-relative path (e.g. `/?ref=CODE`). */
  url: string;
  title?: string;
  text?: string;
  /** Compact row without the heading — used inside dense key cards. */
  compact?: boolean;
}

const TelegramIcon: ReactNode = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" />
  </svg>
);
const WhatsAppIcon: ReactNode = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 11.5a8 8 0 0 1-11.6 7.1L3.5 20l1.4-4.6A8 8 0 1 1 20 11.5Z" />
    <path d="M9 8.5c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .6.5l.7 1.6c.1.3 0 .5-.1.7l-.4.5c.2.4.5.8.9 1.2.4.4.8.7 1.2.9l.5-.4c.2-.2.4-.2.7-.1l1.6.7c.5.2.5.4.5.6v.5c0 .3-.2.5-.5.6-.3.1-.6.2-1 .2a8 8 0 0 1-6.6-6.6c0-.4.1-.7.2-1Z" />
  </svg>
);
const InstagramIcon: ReactNode = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const ViberIcon: ReactNode = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3C7 3 3 7 3 12c0 1.8.5 3.5 1.5 5L3 21l4.2-1.4A9 9 0 1 0 12 3Z" />
    <path d="M9 9.2c.2-.3.5-.4.7-.2l1.1.8c.2.2.3.5.2.7l-.4.7c.5 1 1.3 1.8 2.3 2.3l.7-.4c.2-.1.5-.1.7.1l.8 1.1c.2.2.1.5-.2.7-.6.4-1.3.6-2 .6-2.8 0-5-2.2-5-5 0-.7.2-1.4.6-2Z" />
  </svg>
);

type Network = 'telegram' | 'whatsapp' | 'instagram' | 'viber';

const NETWORKS: Array<{ id: Network; label: string; icon: ReactNode }> = [
  { id: 'telegram', label: 'Telegram', icon: TelegramIcon },
  { id: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon },
  { id: 'instagram', label: 'Instagram', icon: InstagramIcon },
  { id: 'viber', label: 'Viber', icon: ViberIcon },
];

async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    return true;
  } catch {
    return false;
  }
}

export default function SocialShare({
  url,
  title = '3set VPN',
  text = 'Попробуй 3set VPN — быстрый и безопасный VPN.',
  compact = false,
}: Props) {
  const [status, setStatus] = useState<string | null>(null);

  const fullUrl = useCallback(() => {
    if (/^https?:\/\//i.test(url)) return url;
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  }, [url]);

  const share = useCallback(
    async (network: Network) => {
      const link = fullUrl();
      const message = `${text} ${link}`;
      setStatus(null);

      if (network === 'instagram') {
        // Instagram has no share-by-URL web intent — copy and say so plainly.
        const ok = await copy(link);
        setStatus(ok ? 'Ссылка скопирована — вставьте её в Instagram' : 'Не удалось скопировать ссылку');
        return;
      }
      if (network === 'viber') {
        window.location.assign(`viber://forward?text=${encodeURIComponent(message)}`);
        return;
      }
      const href =
        network === 'telegram'
          ? `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
          : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(href, '_blank', 'noopener,noreferrer');
    },
    [fullUrl, text],
  );

  const shareNative = useCallback(async () => {
    const link = fullUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: link });
        return;
      } catch {
        // user cancelled or the browser refused — fall back to clipboard
      }
    }
    const ok = await copy(link);
    setStatus(ok ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку');
  }, [fullUrl, text, title]);

  return (
    <div className={`social-share${compact ? ' compact' : ''}`}>
      {!compact && <span className="social-share-label">Поделиться с другом</span>}
      <div className="social-share-row">
        {NETWORKS.map((n) => (
          <button
            key={n.id}
            type="button"
            className="social-share-network"
            title={`Поделиться в ${n.label}`}
            aria-label={`Поделиться в ${n.label}`}
            onClick={() => void share(n.id)}
          >
            {n.icon}
          </button>
        ))}
        <button type="button" className="social-share-all" onClick={() => void shareNative()}>
          <Share2 aria-hidden /> Поделиться
        </button>
        {status && <span className="social-share-status" role="status">{status}</span>}
      </div>
      {!compact && (
        <Link href="/guides" className="social-share-hint">Как подключить VPN по ссылке →</Link>
      )}
    </div>
  );
}
