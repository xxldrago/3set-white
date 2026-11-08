"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";

interface Provider {
  id: string;
  name: string;
  available: boolean;
}

interface ProvidersData {
  active: string;
  providers: Provider[];
}

interface ProvidersClientProps {
  initialData: ProvidersData;
}

export function ProvidersClient({ initialData }: ProvidersClientProps) {
  const [active, setActive] = useState(initialData.active);
  const [providers, setProviders] = useState(initialData.providers);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/providers")
      .then((r) => r.json())
      .then((d) => {
        setActive(d.active);
        setProviders(d.providers);
      });
  }, []);

  const handleSwitch = async (providerId: string) => {
    if (active === providerId) return;
    setSwitching(providerId);
    try {
      const res = await fetch("/api/admin/providers/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      if (res.ok) {
        setActive(providerId);
      }
    } finally {
      setSwitching(null);
    }
  };

  const platega = providers.find((p) => p.id === "platega");
  const oneplat = providers.find((p) => p.id === "oneplat");

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold text-foreground">{t("admin.providersTitle")}</h2>
        <p className="text-sm text-muted">{t("admin.providersDescription")}</p>
      </header>

      <div className="rounded-2xl border border-line p-6 space-y-6">
        {platega && (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">{t("admin.providersPlatega")}</h3>
              <p className="text-sm text-muted">{t("admin.providersPlategaDesc")}</p>
            </div>
            {active === "platega" && <ProviderBadge />}
          </div>
        )}

        {oneplat && (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">{t("admin.providersOneplat")}</h3>
              <p className="text-sm text-muted">{t("admin.providersOneplatDesc")}</p>
            </div>
            <ProviderSwitch
              provider={oneplat}
              active={active === "oneplat"}
              loading={switching === "oneplat"}
              onClick={() => handleSwitch("oneplat")}
            />
          </div>
        )}

        <div className="pt-4 border-t border-line text-sm text-muted">
          <p>{t("admin.providersNote")}</p>
        </div>
      </div>
    </section>
  );
}

function ProviderBadge() {
  return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-green-500/10 text-green-500">
      {t("admin.providersActive")}
    </span>
  );
}

interface ProviderSwitchProps {
  provider: Provider;
  active: boolean;
  loading: boolean;
  onClick: () => void;
}

function ProviderSwitch({ provider, active, loading, onClick }: ProviderSwitchProps) {
  if (!provider.available) {
    return (
      <span className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium bg-foreground/5 text-foreground/50 cursor-not-allowed">
        {t("admin.providersOneplatNote")}
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={active || loading}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-green-500/10 text-green-500 cursor-default"
          : "bg-foreground/5 text-foreground hover:bg-foreground/10"
      }`}
    >
      {active ? t("admin.providersActive") : loading ? t("admin.providersSwitching") : t("admin.providersMakeActive")}
    </button>
  );
}