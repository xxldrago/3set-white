'use client';

// Shared password input (Phase 6 UI-SPEC §1): label + type=password input +
// 44×44px show/hide toggle + reserved field-error slot. Presentational only —
// validation copy and values live in the parent forms (login, register,
// reset-confirm, change-password). The toggle flips `type` and never clears
// the value.
import { useState } from 'react';
import { t } from '@/lib/i18n';

const INPUT =
  'h-12 w-full rounded-2xl border border-black/[.08] bg-white px-4 text-base text-black placeholder:text-zinc-500 disabled:opacity-50 dark:border-white/[.145] dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500';
const INPUT_INVALID = 'border-red-600/50 dark:border-red-400/50';
const FIELD_LABEL = 'text-sm text-zinc-600 dark:text-zinc-400';
const TOGGLE =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-solid border-black/[.08] transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      {off ? (
        <path d="M3 3l14 14M10 5.5c2.8 0 5.2 1.7 6.5 4a8.6 8.6 0 0 1-2.4 2.9M6.6 6.9A8.3 8.3 0 0 0 3.5 9.5c1.3-2.3 3.7-4 6.5-4M8.5 8.7a2 2 0 0 0 2.8 2.8" />
      ) : (
        <path d="M2.5 10S5.5 5.5 10 5.5 17.5 10 17.5 10 14.5 14.5 10 14.5 2.5 10 2.5 10Z M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      )}
    </svg>
  );
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  hint,
  error,
  disabled,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          disabled={disabled}
          className={`${INPUT} ${error ? INPUT_INVALID : ''}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          title={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          className={TOGGLE}
        >
          <EyeIcon off={visible} />
        </button>
      </div>
      {hint && !error && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>
      )}
      {/* Reserved slot: the submit button never shifts when an error appears. */}
      <div className="min-h-5">
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
