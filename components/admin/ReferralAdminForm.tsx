'use client';

// Referral program admin island: global rates form + withdrawal queue.
// Mutations go through the role-gated BFF routes; the server list re-renders
// via router.refresh(). Approve/reject is idempotent server-side (pending→X
// claim), so double taps are safe.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import type { ReferralSettings } from '@/lib/referrals';

const INPUT =
  'h-12 w-full rounded-2xl border border-line bg-panel px-4 text-base text-foreground placeholder:text-dim disabled:opacity-50';
const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 text-lime transition-colors hover:bg-[#383838] disabled:opacity-50';
const SMALL =
  'flex h-9 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50';
const FIELD_LABEL = 'text-sm text-muted';

interface WithdrawalRow {
  id: string;
  userId: number;
  amount: number;
  status: string;
  contact: string | null;
  createdAt: string;
}

export default function ReferralAdminForm({
  initialSettings,
  initialWithdrawals,
}: {
  initialSettings: ReferralSettings;
  initialWithdrawals: WithdrawalRow[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<'percent' | 'fixed'>(initialSettings.inviterKind);
  const [inviterValue, setInviterValue] = useState(String(initialSettings.inviterValue));
  const [inviteeValue, setInviteeValue] = useState(String(initialSettings.inviteeValue));
  const [minWithdraw, setMinWithdraw] = useState(String(initialSettings.minWithdraw));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const num = (value: string): number | null => {
    if (value.trim().length === 0) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };

  const save = useCallback(async () => {
    if (saving) return;
    const a = num(inviterValue);
    const b = num(inviteeValue);
    const c = num(minWithdraw);
    if (a === null || b === null || c === null) {
      setFailed(true);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSaving(true);
    setFailed(false);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/referrals/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviterKind: kind, inviterValue: a, inviteeValue: b, minWithdraw: c }),
        signal: controller.signal,
      });
      if (!res.ok) setFailed(true);
      else {
        setSaved(true);
        router.refresh();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [saving, kind, inviterValue, inviteeValue, minWithdraw, router]);

  const decide = useCallback(
    async (id: string, approve: boolean) => {
      if (deciding !== null) return;
      setDeciding(id);
      try {
        const res = await fetch('/api/admin/referrals/withdrawals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, approve }),
        });
        if (res.ok) router.refresh();
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setDeciding(null);
      }
    },
    [deciding, router],
  );

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4 rounded-2xl border border-line p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="ref-kind" className={FIELD_LABEL}>
              {t('admin.refInviterKind')}
            </label>
            <select
              id="ref-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as 'percent' | 'fixed')}
              disabled={saving}
              className={INPUT}
            >
              <option value="percent">{t('admin.refKindPercent')}</option>
              <option value="fixed">{t('admin.refKindFixed')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ref-inviter-value" className={FIELD_LABEL}>
              {t('admin.refInviterValue')}
            </label>
            <input
              id="ref-inviter-value"
              value={inviterValue}
              onChange={(event) => setInviterValue(event.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              disabled={saving}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ref-invitee-value" className={FIELD_LABEL}>
              {t('admin.refInviteeValue')}
            </label>
            <input
              id="ref-invitee-value"
              value={inviteeValue}
              onChange={(event) => setInviteeValue(event.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              disabled={saving}
              className={INPUT}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="ref-min-withdraw" className={FIELD_LABEL}>
              {t('admin.refMinWithdraw')}
            </label>
            <input
              id="ref-min-withdraw"
              value={minWithdraw}
              onChange={(event) => setMinWithdraw(event.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              disabled={saving}
              className={INPUT}
            />
          </div>
        </div>

        {saved && (
          <p role="status" className="text-sm text-green">
            {t('admin.refSaved')}
          </p>
        )}
        {failed && (
          <p role="alert" className="text-sm text-red-600">
            {t('admin.refError')}
          </p>
        )}

        <button type="submit" disabled={saving} className={PRIMARY}>
          {saving ? t('admin.refSaving') : t('admin.refSave')}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        <h3 className="text-xl font-semibold text-foreground">{t('admin.refWithdrawalsTitle')}</h3>
        {initialWithdrawals.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.refWithdrawalsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">{t('admin.refColUser')}</th>
                  <th className="px-4 py-3">{t('admin.refColAmount')}</th>
                  <th className="px-4 py-3">{t('admin.refColContact')}</th>
                  <th className="px-4 py-3">{t('admin.refColDate')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {initialWithdrawals.map((row) => (
                  <tr key={row.id} className="hover:bg-foreground/5">
                    <td className="px-4 py-3 font-mono text-xs">#{row.userId}</td>
                    <td className="px-4 py-3 tabular-nums">{row.amount} ₽</td>
                    <td className="px-4 py-3 max-w-[12rem] truncate">{row.contact ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {new Date(row.createdAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void decide(row.id, true)}
                          disabled={deciding !== null}
                          className={SMALL}
                        >
                          {t('admin.refApprove')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void decide(row.id, false)}
                          disabled={deciding !== null}
                          className={SMALL}
                        >
                          {t('admin.refReject')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
