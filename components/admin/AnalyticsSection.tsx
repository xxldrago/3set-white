// Admin analytics — presentational section wrapper (UI-SPEC §6.1). The only
// new structural element on the page: a top rule + h2 + flex-col gap-4 body.
// Used twice («Юнит-экономика», «Удержание») below the Phase 7 sparkline.
// aria-label makes the section a named landmark without a second heading.
// Server component — no 'use client', no data loading.
export default function AnalyticsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}