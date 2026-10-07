'use client';

// Device list modal for one subscription card. The "Устройства" trigger opens a
// blocking overlay that lists every provider device row for that key; each row
// keeps the project's two-tap ConfirmPanel, and "clear" wipes all rows. All
// reads and mutations stay on the existing ownership-scoped BFF device routes.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Device } from '@/lib/artemida';
import { t } from '@/lib/i18n';
import ConfirmPanel from './ConfirmPanel';

interface DeviceListModalProps {
  keyId: string;
  deviceLimit: number;
}

export default function DeviceListModal({ keyId, deviceLimit }: DeviceListModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const loadDevices = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setFailure(false);
      try {
        const response = await fetch(`/api/keys/${encodeURIComponent(keyId)}/devices`, {
          cache: 'no-store',
          signal,
        });
        if (!response.ok) throw new Error('devices_load_failed');
        const body = (await response.json()) as { devices?: unknown };
        if (!body || !Array.isArray(body.devices)) throw new Error('devices_shape_invalid');
        const rows = body.devices.filter(
          (entry): entry is Device =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { token?: unknown }).token === 'string' &&
            (entry as { token: string }).token.length > 0,
        );
        if (signal?.aborted) return;
        setDevices(rows);
        setLoading(false);
      } catch (error) {
        if (signal?.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setDevices([]);
        setFailure(true);
        setLoading(false);
      }
    },
    [keyId],
  );

  const openModal = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setOpen(true);
    void loadDevices(controller.signal);
  }, [loadDevices]);

  const closeModal = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closeModal]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm text-muted transition-colors hover:bg-foreground/5"
      >
        {t('key.devicesTitle')}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t('common.cancel')}
            onClick={closeModal}
            className="absolute inset-0 bg-foreground/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('key.devicesTitle')}
            className="relative flex max-h-[80vh] w-full max-w-xl flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-panel p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
                  {t('key.devicesTitle')}
                </span>
                <h3 className="text-xl font-semibold text-foreground">
                  {loading
                    ? '…'
                    : t('key.devicesCount', { n: devices.length, max: deviceLimit })}
                </h3>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeModal}
                aria-label={t('common.cancel')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg text-muted transition-colors hover:bg-foreground/5"
              >
                ×
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" aria-live="polite">
              {loading ? (
                <div className="flex flex-col gap-2" aria-hidden>
                  {Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={index}
                      className="h-16 animate-pulse rounded-xl bg-foreground/5"
                    />
                  ))}
                </div>
              ) : failure ? (
                <>
                  <p role="alert" className="text-sm text-muted">
                    {t('common.errorLoad')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadDevices()}
                    className="flex h-11 items-center justify-center rounded-lg border border-line px-4 text-sm transition-colors hover:bg-foreground/5"
                  >
                    {t('common.retry')}
                  </button>
                </>
              ) : devices.length === 0 ? (
                <p className="text-sm text-muted">{t('devices.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {devices.map((device) => {
                    const label = device.name ?? device.token;
                    const deleteUrl = `/api/keys/${encodeURIComponent(keyId)}/devices/${encodeURIComponent(device.token)}`;
                    return (
                      <li
                        key={device.token}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 p-3"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={label}>
                          {label}
                        </span>
                        <ConfirmPanel
                          kind="delete"
                          method="DELETE"
                          deviceName={label}
                          url={deleteUrl}
                          onDone={() => void loadDevices()}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {devices.length > 0 && !failure && (
              <ConfirmPanel
                kind="clear"
                method="POST"
                deviceCount={devices.length}
                url={`/api/keys/${encodeURIComponent(keyId)}/devices/clear`}
                onDone={() => void loadDevices()}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
