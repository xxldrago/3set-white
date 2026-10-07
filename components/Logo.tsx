interface LogoProps {
  /** Show the `.online` TLD suffix (off for compact contexts). */
  withTld?: boolean;
  className?: string;
}

/**
 * 3set brand logo (ported from 3set.online): the shield-check mark plus the
 * `3set` wordmark, with `set` in brand green and an optional mono `.online`.
 */
export default function Logo({ withTld = true, className = '' }: LogoProps) {
  return (
    <span
      className={`flex items-center gap-2.5 font-display text-[17px] font-bold leading-none text-foreground ${className}`}
    >
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" fill="none" aria-hidden="true">
        <path d="M16 3l10 4.5V15c0 7-4.5 11-10 13C10.5 26 6 22 6 15V7.5L16 3z" fill="#0e1512" />
        <path
          d="M11 16l3.5 3.5L21 13"
          stroke="#b7ff45"
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </svg>
      <span className="tracking-tight">
        3<em className="not-italic text-green">set</em>
        {withTld && (
          <span className="ml-0.5 font-mono text-[11px] font-normal text-dim">.online</span>
        )}
      </span>
    </span>
  );
}
