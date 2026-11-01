'use client';

export default function ExportCsvLink({ report, label = 'Экспорт CSV' }: { report: string; label?: string }) {
  return (
    <a
      href={`/api/admin/export/${report}`}
      download
      className="rounded-lg border border-line px-3 py-2 text-sm text-foreground hover:bg-foreground/5"
    >
      {label}
    </a>
  );
}
