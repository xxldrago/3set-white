'use client';

// Fixed support badge, available on every app page. Self-contained colors so
// it reads the same on the light auth/profile surfaces and the dark cabinet.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, LifeBuoy, MessageCircle, X } from 'lucide-react';

export default function SupportFab() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="support-fab" ref={boxRef}>
      {open && (
        <div className="support-fab-panel" role="dialog" aria-label="Техподдержка">
          <div className="support-fab-head">
            <span className="support-fab-title">Нужна помощь?</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть">
              <X aria-hidden />
            </button>
          </div>
          <p>Отвечаем в среднем за 2–5 минут. Выберите удобный канал:</p>
          <a href="https://t.me/threeSet_bot" target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden /> Telegram-чат
          </a>
          <Link href="/support" onClick={() => setOpen(false)}>
            <LifeBuoy aria-hidden /> Открыть поддержку
          </Link>
          <Link href="/install" onClick={() => setOpen(false)}>
            <BookOpen aria-hidden /> Инструкции
          </Link>
        </div>
      )}
      <button
        type="button"
        className="support-fab-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Закрыть техподдержку' : 'Техподдержка'}
        aria-expanded={open}
        title="Техподдержка"
      >
        {open ? <X aria-hidden /> : <LifeBuoy aria-hidden />}
      </button>
    </div>
  );
}
