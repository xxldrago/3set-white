'use client';

// Cabinet referral island (profile page): public link + stats + withdrawal
// request. Loads `/api/wallet` once; the copy button uses the clipboard API
// with a transient status line. Amounts render from server integers — never
// recomputed here.
import { useCallback, useEffect, useRef, useState } from 'react';
import { t, tp } from '@/lib/i18n';

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line p-6 border-line';
const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-lg bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-lg border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50';
const FIELD_LABEL = 'text-sm text-muted';

interface RateView {
  kind: string;
  value: number;
}

interface WalletSummary {
  code: string;
  referrals: number;
  earned: number;
  balance: number;
  minWithdraw: number;
  bonusDays: number;
  myRate: RateView;
  downline: RateView | null;
  isPartner: boolean;
  userMode: 'days' | 'money';
  userDays: number;
  inviteeDays: number;
}

function rateText(rate: RateView): string {
  if (rate.kind === 'fixed') return `${rate.value} ₽`;
  if (rate.kind === 'percent') return `${rate.value}%`;
  return t('auth.refRateDays', { n: rate.value });
}

/** Downline rate editor: what MY referrals earn when they bring buyers. */
function DownlineEditor({ initial }: { initial: RateView | null }) {
  const [kind, setKind] = useState<'percent' | 'fixed' | 'days' | ''>(
    initial && (initial.kind === 'percent' || initial.kind === 'fixed' || initial.kind === 'days')
      ? initial.kind
      : '',
  );
  const [value, setValue] = useState(initial ? String(initial.value) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = useCallback(async () => {
    if (saving) return;
    const amount = value.trim().length === 0 ? null : Number(value);
    if (kind === '') {
      // Clear back to global.
      setSaving(true);
      setFailed(false);
      setSaved(false);
      try {
        const res = await fetch('/api/referrals/downline', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: null }),
        });
        if (res.ok) setSaved(true);
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (amount === null || !Number.isSafeInteger(amount) || amount < 0) {
      setFailed(true);
      return;
    }
    setSaving(true);
    setFailed(false);
    setSaved(false);
    try {
      const res = await fetch('/api/referrals/downline', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, value: amount }),
      });
      if (res.ok) setSaved(true);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [saving, kind, value]);

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <span className="text-base font-semibold text-foreground">{t('auth.refDownlineTitle')}</span>
      <p className="text-sm text-muted">{t('auth.refDownlineHint')}</p>
      <div className="flex items-center gap-2">
        <select
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as 'percent' | 'fixed' | 'days' | '')
          }
          disabled={saving}
          aria-label={t('auth.refDownlineKind')}
          className="h-12 shrink-0 rounded-2xl border border-line bg-panel px-3 text-sm text-foreground"
        >
          <option value="">{t('admin.refCustomGlobal')}</option>
          <option value="percent">%</option>
          <option value="fixed">₽</option>
          <option value="days">{t('auth.refDownlineDays')}</option>
        </select>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder="—"
          disabled={saving}
          aria-label={t('auth.refDownlineTitle')}
          className={INPUT}
        />
        <button type="button" onClick={() => void save()} disabled={saving} className={SECONDARY}>
          {t('admin.refCustomSave')}
        </button>
      </div>
      {saved && (
        <p role="status" className="text-sm text-green">
          {t('admin.refCustomSaved')}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          {t('admin.refError')}
        </p>
      )}
    </div>
  );
}

export function ReferralSectionSkeleton() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      <div className="h-7 w-40 animate-pulse rounded-full bg-foreground/5" />
      <div className="h-16 animate-pulse rounded-2xl bg-foreground/5" />
    </section>
  );
}

export default function ReferralSection() {
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [contact, setContact] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    void fetch('/api/wallet', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('wallet_load_failed');
        setSummary((await res.json()) as WalletSummary);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const copy = useCallback(async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/?ref=${summary.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [summary]);

  const withdraw = useCallback(async () => {
    if (withdrawing) return;
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value <= 0) {
      setWithdrawError(t('auth.refWithdrawError'));
      return;
    }
    setWithdrawing(true);
    setWithdrawError(null);
    setWithdrawn(false);
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: value, contact: contact.trim() || undefined }),
      });
      if (!res.ok) throw new Error('withdraw_failed');
      setAmount('');
      setContact('');
      setWithdrawn(true);
      const refreshed = await fetch('/api/wallet');
      if (refreshed.ok) setSummary((await refreshed.json()) as WalletSummary);
    } catch {
      setWithdrawError(t('auth.refWithdrawError'));
    } finally {
      setWithdrawing(false);
    }
  }, [withdrawing, amount, contact]);

  if (failed) return null;
  if (!summary) return <ReferralSectionSkeleton />;

  const link = `/?ref=${summary.code}`;

  return (
    <section id="referrals" className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-foreground">
          {t('auth.refSectionTitle')}
        </h2>
        <p className="text-sm text-muted">
          {summary.isPartner || summary.userMode === 'money'
            ? t('auth.refSectionIntro')
            : t('auth.refSectionIntroDays', {
                n: summary.userDays,
                days: tp('home.refDay', summary.userDays),
                m: summary.inviteeDays,
                friendDays: tp('home.refDay', summary.inviteeDays),
              })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className={FIELD_LABEL}>{t('auth.refYourLink')}</span>
        <div className="flex items-center gap-2">
          <input
            value={link}
            readOnly
            aria-label={t('auth.refYourLink')}
            className={INPUT}
            onFocus={(event) => event.target.select()}
          />
          <button type="button" onClick={() => void copy()} className={SECONDARY}>
            {t('auth.refCopy')}
          </button>
        </div>
        {copied && (
          <p role="status" className="text-sm text-green">
            {t('auth.refCopied')}
          </p>
        )}
      </div>

      <p className="text-sm text-muted">
        {t('auth.refMyRate', { rate: rateText(summary.myRate) })}
      </p>

      <dl className="grid grid-cols-2 gap-2 text-center min-w-0 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">{t('auth.refStatsInvited')}</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {summary.referrals}
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
          <dt className="text-xs text-muted">{t('auth.refStatsDays')}</dt>
          <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
            {summary.bonusDays}
          </dd>
        </div>
        {(summary.isPartner || summary.userMode === 'money') && (
          <>
            <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
              <dt className="text-xs text-muted">{t('auth.refStatsEarned')}</dt>
              <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
                {summary.earned} ₽
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-2xl bg-panel p-3">
              <dt className="text-xs text-muted">{t('auth.refStatsBalance')}</dt>
              <dd className="truncate text-lg sm:text-xl font-semibold tabular-nums text-foreground">
                {summary.balance} ₽
              </dd>
            </div>
          </>
        )}
      </dl>

      <DownlineEditor initial={summary.downline} />

      {(summary.isPartner || summary.userMode === 'money') && (
      <form
        className="flex flex-col gap-3 border-t border-line pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void withdraw();
        }}
      >
        <h3 className="text-base font-semibold text-foreground">
          {t('auth.refWithdrawTitle')}
        </h3>
        <p className="text-sm text-muted">
          {t('auth.refWithdrawHint', { min: summary.minWithdraw })}
        </p>
        <div className="flex flex-col gap-2">
          <label htmlFor="withdraw-amount" className={FIELD_LABEL}>
            {t('auth.refWithdrawAmount')}
          </label>
          <input
            id="withdraw-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            disabled={withdrawing}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="withdraw-contact" className={FIELD_LABEL}>
            {t('auth.refWithdrawContact')}
          </label>
          <input
            id="withdraw-contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            disabled={withdrawing}
            className={INPUT}
          />
        </div>
        {withdrawn && (
          <p role="status" className="text-sm text-green">
            {t('auth.refWithdrawSent')}
          </p>
        )}
        {withdrawError && (
          <p role="alert" className="text-sm text-red-600">
            {withdrawError}
          </p>
        )}
        <button type="submit" disabled={withdrawing || amount.length === 0} className={PRIMARY}>
          {t('auth.refWithdrawCta')}
        </button>
      </form>
      )}
    </section>
  );
}
