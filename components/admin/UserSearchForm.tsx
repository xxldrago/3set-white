'use client';

// Admin user-search client island (ADM-02 / UI-SPEC §3).
//
// Copies `TariffPicker`'s discipline: `'use client'`, an in-flight
// `AbortController` that aborts a stale request, and unmount cleanup. Search is
// submit-driven (not debounced) because the field is an explicit query — the
// button is disabled while the trimmed value is blank or a request is in flight.
// The query text is retained across every state (idle/loading/results/no-result/
// error) because the input value never resets. Results are rendered by the
// presentational `UserSearchResults`.
import { useCallback, useEffect, useRef, useState } from 'react';
import UserSearchResults from './UserSearchResults';
import { t } from '@/lib/i18n';
import type { AdminSearchResult } from '@/lib/admin-service';

const CARD = 'flex flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/15';
const INPUT =
  'h-12 w-full rounded-full border border-black/[.08] bg-transparent px-5 text-base text-black outline-none transition-colors focus:outline-2 focus:outline-offset-2 dark:border-white/[.145] dark:text-zinc-50';
const PRIMARY =
  'flex h-12 items-center justify-center rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const SECONDARY =
  'flex h-11 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/** Loading fallback while the gated search route resolves (UI-SPEC §3). */
function SkeletonRows() {
  return (
    <section className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10"
        />
      ))}
    </section>
  );
}

export default function UserSearchForm() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminSearchResult[]>([]);
  const [count, setCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [state, setState] = useState<SearchState>('idle');
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = query.trim();
  const inFlight = state === 'loading';

  const runSearch = useCallback(async () => {
    const value = trimmed;
    if (value.length === 0) return;

    // Cancel the previous in-flight request so a fast re-submit cannot race a
    // stale result onto the screen.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState('loading');
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(value)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('admin_search_failed');
      const body = (await res.json()) as { rows?: unknown; count?: unknown; truncated?: unknown };
      if (!Array.isArray(body.rows)) throw new Error('admin_search_shape');
      const nextRows = body.rows as AdminSearchResult[];
      setRows(nextRows);
      setCount(typeof body.count === 'number' ? body.count : nextRows.length);
      setTruncated(body.truncated === true);
      setState(nextRows.length === 0 ? 'empty' : 'results');
    } catch {
      if (controller.signal.aborted) return;
      setRows([]);
      setCount(0);
      setTruncated(false);
      setState('error');
    }
  }, [trimmed]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="flex flex-col gap-6">
      <form
        className={CARD}
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <label htmlFor="admin-user-search" className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('admin.searchLabel')}
        </label>
        <input
          id="admin-user-search"
          type="search"
          className={INPUT}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('admin.searchPlaceholder')}
          autoComplete="off"
        />
        <button
          type="submit"
          className={PRIMARY}
          disabled={trimmed.length === 0 || inFlight}
        >
          {inFlight ? t('admin.searchCtaLoading') : t('admin.searchCta')}
        </button>
      </form>

      {state === 'idle' && (
        <section className={CARD}>
          <p className="text-zinc-600 dark:text-zinc-400">{t('admin.searchIdle')}</p>
        </section>
      )}

      {state === 'loading' && <SkeletonRows />}

      {state === 'empty' && (
        <section className={CARD}>
          <p className="text-zinc-600 dark:text-zinc-400">{t('admin.searchNoResults')}</p>
        </section>
      )}

      {state === 'error' && (
        <section className={`${CARD} border-red-600/30 dark:border-red-400/30`} role="alert">
          <p className="text-zinc-600 dark:text-zinc-400">{t('admin.searchError')}</p>
          <button type="button" onClick={() => void runSearch()} className={SECONDARY}>
            {t('common.retry')}
          </button>
        </section>
      )}

      {state === 'results' && (
        <UserSearchResults rows={rows} count={count} truncated={truncated} />
      )}
    </div>
  );
}
