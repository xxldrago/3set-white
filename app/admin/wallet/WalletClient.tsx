'use client';

// Operator wallet panel: shows the ARTEMIDA API balance and creates a top-up
// invoice. The provider hosts the payment page, so we render a link and poll the
// status until it settles — polling never double-credits (the provider credits
// exactly once), which is why no local "already topped up" guard is needed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { t } from '@/lib/i18n';

interface Balance {
  balance: number;
  currency: string;
  unlimited: boolean;
}

interface Topup {
  paymentId: string;
  amount: number;
  currency: string;
  url: string | null;
  status: string;
}

interface TopupStatus {
  paymentId: string;
  status: string;
  paid: boolean;
  processed: boolean;
  processing: boolean;
  balance: number | null;
}

const formatter = new Intl.NumberFormat('ru-RU');
const PRESETS = [500, 1000, 2500, 5000] as const;
const POLL_MS = 5000;

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6';
const PRIMARY =
  'flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-sm font-bold text-lime transition-colors hover:opacity-90 disabled:opacity-50';
const SECONDARY =
  'flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm text-muted transition-colors hover:bg-foreground/5 disabled:opacity-50';

export default function WalletClient({ initialBalance }: { initialBalance: Balance | null }) {
  const [balance, setBalance] = useState<Balance | null>(initialBalance);
  const [amount, setAmount] = useState('1000');
  const [topup, setTopup] = useState<Topup | null>(null);
  const [status, setStatus] = useState<TopupStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<'create' | 'status' | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/wallet');
      if (!res.ok) return;
      const body = (await res.json()) as { balance: Balance };
      setBalance(body.balance);
    } catch {
      // Balance is informational here; a failure must not blank the page.
    }
  }, []);

  const pollStatus = useCallback(
    async (paymentId: string) => {
      try {
        const res = await fetch(`/api/admin/wallet/topups/${encodeURIComponent(paymentId)}`);
        if (!res.ok) throw new Error('status_failed');
        const body = (await res.json()) as { status: TopupStatus };
        setStatus(body.status);
        setError(null);
        // Settled (paid+processed) or failed: stop polling and refresh the
        // balance so the operator sees the credit.
        if (body.status.processed || body.status.status === 'CANCELED') {
          stopPolling();
          await refreshBalance();
        }
      } catch {
        setError('status');
      }
    },
    [refreshBalance, stopPolling],
  );

  const createTopup = useCallback(async () => {
    const parsed = Number.parseInt(amount, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError('create');
      return;
    }
    setCreating(true);
    setError(null);
    setStatus(null);
    stopPolling();
    try {
      const res = await fetch('/api/admin/wallet/topups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: parsed }),
      });
      if (!res.ok) throw new Error('create_failed');
      const body = (await res.json()) as { topup: Topup };
      setTopup(body.topup);
      timerRef.current = setInterval(() => void pollStatus(body.topup.paymentId), POLL_MS);
    } catch {
      setError('create');
    } finally {
      setCreating(false);
    }
  }, [amount, pollStatus, stopPolling]);

  const settled = status !== null && (status.processed || status.status === 'CANCELED');

  return (
    <div className="flex flex-col gap-6">
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            <h3 className="text-lg font-semibold text-foreground">{t('admin.walletTitle')}</h3>
          </div>
          <button type="button" onClick={() => void refreshBalance()} className={SECONDARY}>
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            {t('admin.walletRefresh')}
          </button>
        </div>

        <p className="text-sm text-muted">{t('admin.walletHint')}</p>

        <p className="text-3xl font-semibold tabular-nums text-foreground">
          {balance === null
            ? t('admin.walletUnavailable')
            : `${formatter.format(balance.balance)} ${balance.currency}`}
        </p>
      </section>

      <section className={CARD}>
        <h3 className="text-lg font-semibold text-foreground">{t('admin.walletTopupTitle')}</h3>
        <p className="text-sm text-muted">{t('admin.walletTopupHint')}</p>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              className={
                amount === String(preset)
                  ? 'h-10 rounded-lg bg-foreground px-4 text-sm font-bold text-lime'
                  : 'h-10 rounded-lg border border-line px-4 text-sm text-muted transition-colors hover:bg-foreground/5'
              }
            >
              {formatter.format(preset)} ₽
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t('admin.walletAmountLabel')}</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-11 w-40 rounded-xl border border-line bg-transparent px-3 text-base tabular-nums text-foreground outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void createTopup()}
            disabled={creating}
            className={PRIMARY}
          >
            {creating ? t('admin.walletCreating') : t('admin.walletCreate')}
          </button>
        </div>

        {error === 'create' && (
          <p role="alert" className="text-sm text-red-600">
            {t('admin.walletCreateError')}
          </p>
        )}

        {topup !== null && (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel-2 p-4">
            <p className="text-sm text-foreground">
              {t('admin.walletInvoice', {
                amount: formatter.format(topup.amount),
                id: topup.paymentId,
              })}
            </p>
            {topup.url !== null && !settled && (
              <a href={topup.url} target="_blank" rel="noreferrer" className={PRIMARY}>
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                {t('admin.walletOpenPayment')}
              </a>
            )}
            <p className="text-xs text-dim">
              {status === null
                ? t('admin.walletStatusPending')
                : status.processed
                  ? t('admin.walletStatusPaid')
                  : status.status === 'CANCELED'
                    ? t('admin.walletStatusCanceled')
                    : t('admin.walletStatusWaiting', { status: status.status })}
            </p>
            {error === 'status' && (
              <p role="alert" className="text-sm text-red-600">
                {t('admin.walletStatusError')}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
