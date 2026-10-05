'use client';

import { useEffect, useRef } from 'react';

interface TelegramWidgetInjectorProps {
  botUsername: string;
  onAuth: (user: unknown) => void;
  buttonSize?: 'small' | 'medium' | 'large';
  cornerRadius?: number;
  requestAccess?: 'write';
  lang?: string;
}

export default function TelegramWidgetInjector({
  botUsername,
  onAuth,
  buttonSize = 'large',
  cornerRadius,
  requestAccess,
  lang = 'ru',
}: TelegramWidgetInjectorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    // The Telegram widget script will look for an element with id "telegram-login-<botUsername>"
    // and inject the iframe there. So we need a unique ID for each instance.
    const widgetId = `telegram-login-${botUsername}-${Math.random().toString(36).substring(7)}`;

    ref.current.id = widgetId;

    // Dynamically create and append the script tag
    const script = document.createElement('script');
    script.src = `https://telegram.org/js/telegram-widget.js?22`;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', buttonSize);
    if (cornerRadius) {
      script.setAttribute('data-radius', cornerRadius.toString());
    }
    if (requestAccess) {
      script.setAttribute('data-request-access', requestAccess);
    }
    script.setAttribute('data-lang', lang);
    script.setAttribute('data-onauth', `window.${widgetId}OnAuth(user)`); // Use a global callback tied to this widget instance
    script.async = true;

    // Define the global callback function
    (window as any)[`${widgetId}OnAuth`] = onAuth;

    ref.current.appendChild(script);

    return () => {
      // Clean up the script and global callback when the component unmounts
      if (ref.current && script.parentNode === ref.current) {
        ref.current.removeChild(script);
      }
      delete (window as any)[`${widgetId}OnAuth`];
    };
  }, [botUsername, onAuth, buttonSize, cornerRadius, requestAccess, lang]);

  return <div ref={ref} />;
}
