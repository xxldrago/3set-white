'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { t } from '@/lib/i18n';

const PERIODS = [7, 30, 90] as const;

export default function PeriodSelector({ selected = 30 }: { selected?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function choose(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', String(days));
    router.replace(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  return (
    <div className="flex gap-3" aria-label={t('admin.statsPeriod')}>
      {PERIODS.map((days) => {
        const active = days === selected;
        const label = days === 7 ? t('admin.statsPeriod7') : days === 30 ? t('admin.statsPeriod30') : t('admin.statsPeriod90');
        return (
          <button
            key={days}
            type="button"
            aria-pressed={active}
            onClick={() => choose(days)}
            className={active ? 'h-11 flex-1 rounded-full bg-foreground px-4 text-background' : 'h-11 flex-1 rounded-full border border-black/[.08] px-4 dark:border-white/[.145]'}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
