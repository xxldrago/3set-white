import type { ReactNode } from 'react';

// AUTH-06 fix (D-91, UI-SPEC §1): centered in-flow wrapper for the Telegram
// widget iframe. `items-center` forces the third-party-injected iframe (an
// inline replaced element) to the column center on desktop; `min-h-24`
// reserves space so a late script inject causes no layout shift. Containment
// only — never absolute/fixed positioning on the slot, the iframe, or the
// wrapped LoginButton, which is reused verbatim.
export default function TelegramWidgetSlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-3">{children}</div>
  );
}
