// Presentational ticket thread (SUP-01/SUP-03, UI-SPEC §2).
//
// No data fetching here: the server page passes a provider-free `TicketThread`
// value from `lib/tickets-service` (subject/status/messages only — never a
// storage path or provider status). Messages render oldest→newest as
// sender-aware bubbles: user messages align right on a subtly tinted surface,
// support messages align left on the plain card surface with the
// `support.senderLabel` («Поддержка») label above the body. The raw `author`
// enum is never rendered (T-04-19/D-19/D-24). Bodies preserve newlines and wrap
// long tokens (`whitespace-pre-wrap break-words`); timestamps use the shared
// `DD.MM.YYYY · HH:mm` formatter.
import type {
  TicketThread as TicketThreadData,
  TicketThreadMessage,
} from '@/lib/tickets-service';
import { t } from '@/lib/i18n';
import { formatPaymentDate } from './PaymentHistoryList';

const BUBBLE =
  'flex flex-col gap-1 rounded-2xl border border-black/10 p-4 dark:border-white/15';

function MessageBubble({ message }: { message: TicketThreadMessage }) {
  const isSupport = message.author === 'support';
  return (
    <div className={`flex max-w-[85%] flex-col gap-1 ${isSupport ? 'self-start' : 'self-end'}`}>
      <div className={`${BUBBLE} ${isSupport ? '' : 'bg-black/[.03] dark:bg-white/[0.06]'}`}>
        {isSupport && (
          <p className="text-sm font-semibold text-black dark:text-zinc-50">
            {t('support.senderLabel')}
          </p>
        )}
        {message.body && (
          <p className="text-base leading-[1.5] whitespace-pre-wrap break-words text-black dark:text-zinc-50">
            {message.body}
          </p>
        )}
      </div>
      <time className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
        {formatPaymentDate(message.createdAt)}
      </time>
    </div>
  );
}

export default function TicketThread({ thread }: { thread: TicketThreadData }) {
  return (
    <div className="flex flex-col gap-3">
      {thread.messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
