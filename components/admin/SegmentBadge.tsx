import { t } from '@/lib/i18n';

export default function SegmentBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-line bg-panel px-2 py-1 text-xs text-foreground">
      {label}
    </span>
  );
}
