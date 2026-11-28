// Client island for /admin/partner/links: mint and delete named referral
// links. The partner picks the target — themself (own link) or one of their
// direct subpartners (sub-referral link). The API re-checks the role and that
// the target really is a direct referral, so this component only mirrors the
// rules for a friendly UI.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CopyButton from '@/components/CopyButton';

export interface PartnerLinkItem {
  id: string;
  code: string;
  label: string | null;
  targetUserId: number;
  targetName: string | null;
}

export interface SubpartnerOption {
  userId: number;
  displayName: string | null;
  email: string | null;
}

export default function PartnerLinksManager({
  baseUrl,
  links,
  subpartners,
  ownUserId,
}: {
  baseUrl: string;
  links: PartnerLinkItem[];
  subpartners: SubpartnerOption[];
  /** Caller's own userId — a link targeting it is an "own" link. */
  ownUserId: number;
}) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const nameFor = (targetUserId: number): string => {
    if (targetUserId === ownUserId) return 'Вы';
    const sub = subpartners.find((row) => row.userId === targetUserId);
    return sub?.displayName ?? sub?.email ?? `#${targetUserId}`;
  };

  const onCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/partner/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: label.trim() === '' ? null : label.trim(),
          targetUserId: target === '' ? null : Number(target),
        }),
      });
      if (!res.ok) {
        setError(
          res.status === 404
            ? 'Субпартнёр не найден среди ваших рефералов'
            : res.status === 400
              ? 'Не удалось создать ссылку (лимит или неверные данные)'
              : 'Ошибка сервера, попробуйте ещё раз',
        );
        setBusy(false);
        return;
      }
      setLabel('');
      setTarget('');
      router.refresh();
    } catch {
      setError('Нет связи с сервером');
    }
    setBusy(false);
  };

  const onDelete = async (id: string) => {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/partner/links?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) setError('Не удалось удалить ссылку');
      else router.refresh();
    } catch {
      setError('Нет связи с сервером');
    }
    setDeleting(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Название (необязательно)</span>
          <input
            type="text"
            value={label}
            maxLength={60}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Например: Telegram-канал"
            className="h-10 w-56 rounded-lg border border-line bg-transparent px-3 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Чья ссылка</span>
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="h-10 min-w-56 rounded-lg border border-line bg-transparent px-3 text-sm text-foreground"
          >
            <option value="">Моя ссылка</option>
            {subpartners.map((sub) => (
              <option key={sub.userId} value={String(sub.userId)}>
                Субпартнёр: {sub.displayName ?? sub.email ?? `#${sub.userId}`}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-lg bg-foreground px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-50"
        >
          {busy ? 'Создаём…' : 'Создать ссылку'}
        </button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </form>

      {links.length === 0 ? (
        <p className="text-sm text-muted">
          Дополнительных ссылок пока нет — создайте первую: каждая получит свой код, а
          регистрации и оплаты по ней закрепятся за выбранным аккаунтом.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2 font-semibold text-muted">
                  Название
                </th>
                <th scope="col" className="px-3 py-2 font-semibold text-muted">
                  За кем закреплена
                </th>
                <th scope="col" className="px-3 py-2 font-semibold text-muted">
                  Код
                </th>
                <th scope="col" className="px-3 py-2 font-semibold text-muted">
                  Ссылка
                </th>
                <th scope="col" className="px-3 py-2 font-semibold text-muted">
                  <span className="sr-only">Действия</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {links.map((row) => {
                const url = `${baseUrl}/signup?ref=${row.code}`;
                return (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-3 align-middle text-foreground">
                      {row.label ?? <span className="text-muted">Без названия</span>}
                    </td>
                    <td className="px-3 py-3 align-middle">{nameFor(row.targetUserId)}</td>
                    <td className="px-3 py-3 align-middle font-mono text-xs">{row.code}</td>
                    <td className="px-3 py-3 align-middle">
                      <code className="break-all font-mono text-xs text-muted">{url}</code>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex items-center gap-2">
                        <CopyButton value={url} />
                        <button
                          type="button"
                          onClick={() => onDelete(row.id)}
                          disabled={deleting === row.id}
                          className="h-10 rounded-lg border border-line px-3 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
                        >
                          {deleting === row.id ? '…' : 'Удалить'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
