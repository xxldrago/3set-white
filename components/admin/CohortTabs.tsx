'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export default function CohortTabs({
  param,
  label,
  options,
  labels,
}: {
  param: string;
  label: string;
  options: readonly string[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? 'all';
  const active = options.includes(current) ? current : 'all';

  function choose(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, value);
    router.replace(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-xs text-muted">{label}</span>
      {options.map((value) => {
        const isActive = value === active;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => choose(value)}
            className={
              isActive
                ? 'h-11 rounded-lg bg-foreground px-4 text-sm text-lime focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green'
                : 'h-11 rounded-lg border border-line px-4 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green'
            }
          >
            {labels[value] ?? value}
          </button>
        );
      })}
    </div>
  );
}
