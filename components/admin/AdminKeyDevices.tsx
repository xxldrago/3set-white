'use client';

// Lazy bound-device list for one admin key row. Loads on expand through the
// ownership-checked admin endpoint; provider failures render the shared
// retry copy inline without touching the rest of the profile.
import { useCallback, useState } from 'react';
import { t } from '@/lib/i18n';

const SMALL =
  'flex h-9 items-center justify-center rounded-full border border-solid border-line px-4 text-sm transition-colors hover:bg-foreground/5 disabled:opacity-50';

interface DeviceRow {
  token: string;
  name: string | null;
}

export default function AdminKeyDevices({ userId, keyId }: { userId: number; keyId: string }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (devices !== null) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/admin/users/${userId}/keys/${encodeURIComponent(keyId)}/devices`,
      );
      if (!res.ok) throw new Error('devices_failed');
      const body = (await res.json()) as { devices?: unknown };
      if (!Array.isArray(body.devices)) throw new Error('devices_shape');
      setDevices(body.devices as DeviceRow[]);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [open, devices, userId, keyId]);

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => void load()} disabled={loading} className={SMALL}>
        {open ? t('admin.keyDevicesHide') : t('admin.keyDevicesShow')}
      </button>
      {open && loading && (
        <div className="h-8 animate-pulse rounded-xl bg-foreground/5" aria-hidden />
      )}
      {open && !loading && failed && (
        <p role="alert" className="text-sm text-red-600">
          {t('common.errorLoad')}
        </p>
      )}
      {open && !loading && !failed && devices !== null && (
        devices.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.keyDevicesEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {devices.map((device) => (
              <li key={device.token} className="truncate font-mono text-xs" title={device.token}>
                {device.name ?? device.token}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
