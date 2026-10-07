import Link from 'next/link';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import SubscriptionCard from '@/components/SubscriptionCard';
import { ArtemidaError } from '@/lib/artemida';
import { t } from '@/lib/i18n';
import {
  listKeys,
  listKeysByUserId,
  manageableDeviceCounts,
  revalidateKeys,
  revalidateKeysByUserId,
  type RenderedKey,
} from '@/lib/keys-service';
import { logger } from '@/lib/logger';
import { getSessionUser, requireSession, requireTelegramSession, SessionError } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Мои ключи — 3set VPN',
};

const PRIMARY =
  'flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-5 font-display text-sm font-medium tracking-wide text-lime transition-colors hover:opacity-90';
const SECONDARY =
  'flex h-12 items-center justify-center gap-2 rounded-lg border border-line px-5 text-sm text-muted transition-colors hover:bg-foreground/5';

/** Error state: mapped copy + retry, never raw provider text (D-19/D-24). */
function KeysError({ error }: { error: unknown }) {
  const message =
    error instanceof ArtemidaError
      ? error.code === 'rate_limited'
        ? t('common.errorRateLimit', { seconds: error.retryAfterSec ?? 60 })
        : error.code === 'bad_gateway' || error.code === 'unavailable'
          ? t('common.errorUnavailable')
          : t('common.errorLoad')
      : t('common.errorLoad');

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6" role="alert">
      <p className="text-muted">{message}</p>
      <Link href="/subscription" className={SECONDARY}>
        {t('common.retry')}
      </Link>
    </section>
  );
}

function KeysGrid({
  keys,
  manageable,
}: {
  keys: RenderedKey[];
  manageable?: Map<string, number | null>;
}) {
  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-panel p-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime/20 text-2xl text-green">
          ⚿
        </span>
        <h3 className="text-lg font-semibold text-foreground">Пока нет подписок</h3>
        <p className="max-w-sm text-sm text-muted">
          Купите подписку — ключ и персональная ссылка появятся здесь автоматически.
        </p>
        <Link href="/#tariff" className={PRIMARY}>
          Купить подписку
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {keys.map((item) => (
        <SubscriptionCard
          key={item.id}
          item={item}
          manageableDevices={manageable?.get(item.id)}
        />
      ))}
    </div>
  );
}

async function KeysSection({ telegramId, userId }: { telegramId: number | null; userId: number }) {
  let keys: RenderedKey[];
  try {
    keys = telegramId !== null ? await listKeys(BigInt(telegramId)) : await listKeysByUserId(userId);
  } catch (err) {
    return <KeysError error={err} />;
  }

  const owner = telegramId !== null ? { telegramId: BigInt(telegramId) } : { userId };
  const manageable = await manageableDeviceCounts(
    owner,
    keys.map((item) => item.id),
  );
  const grid = <KeysGrid keys={keys} manageable={manageable} />;

  // D-29: keep refreshing the mirror after the response is sent.
  after(async () => {
    try {
      if (telegramId !== null) await revalidateKeys(BigInt(telegramId));
      else await revalidateKeysByUserId(userId);
    } catch (err) {
      logger.warn({ route: 'subscription', outcome: 'revalidate_failed', code: err instanceof ArtemidaError ? err.code : undefined });
    }
  });

  return grid;
}

export default async function SubscriptionPage() {
  let telegramId: number | null = null;
  try {
    telegramId = await requireTelegramSession();
  } catch (err) {
    if (!(err instanceof SessionError)) throw err;
  }

  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) redirect('/login');
    throw err;
  }

  const navUser = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      <Nav user={navUser} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6">
        {/* Hero */}
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
              Управление доступом
            </span>
            <h1 className="text-3xl font-semibold text-foreground">Ваши подписки</h1>
            <p className="max-w-xl text-muted">
              Каждая покупка создаёт отдельную ссылку подписки — ограничений по количеству нет.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/guides" className={PRIMARY}>
              Подключить
            </Link>
          </div>
        </section>

        {/* Keys */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
              Подписки
            </span>
            <h2 className="text-2xl font-semibold text-foreground">Подключения 3set</h2>
          </div>
          <KeysSection telegramId={telegramId} userId={userId} />
        </section>

        {/* Support strip */}
        <section className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-panel p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-green">
              Поддержка 3set
            </span>
            <h3 className="text-lg font-semibold text-foreground">Поможем разобраться</h3>
            <p className="text-sm text-muted">
              Если подписка не обновилась, серверы не появились или устройство не отвязывается —
              напишите поддержке.
            </p>
          </div>
          <Link href="/support" className={SECONDARY}>
            Открыть поддержку
          </Link>
        </section>
      </main>
    </div>
  );
}
