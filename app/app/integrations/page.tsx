"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { GoogleSearchIntegrationPanel } from "../components/GoogleSearchIntegrationPanel";
import { ModulePageHeader } from "../components/ModulePageHeader";

type ConnectorState = "checking" | "connected" | "action_required" | "setup_required";

interface CustomerIntegrationStatus {
  whatsapp: ConnectorState;
  facebook: ConnectorState;
  instagram: ConnectorState;
  threads: ConnectorState;
  youtube: ConnectorState;
  linkedin: ConnectorState;
  google: ConnectorState;
  presence?: Array<{
    key: PlatformIconKey;
    label: string;
    handle: string | null;
    href: string | null;
    provenance: string;
    lastSync: string | null;
  }>;
  selfService?: { google?: boolean; social?: boolean; whatsapp?: boolean };
}

function BusinessStatus({ state }: { state: ConnectorState }) {
  if (state === "checking") return <StatusChip state="neutral">Checking</StatusChip>;
  if (state === "connected") return <StatusChip state="success">Connected</StatusChip>;
  if (state === "action_required") return <StatusChip state="warning">Needs attention</StatusChip>;
  return <StatusChip state="neutral">Not connected</StatusChip>;
}

export default function IntegrationsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [status, setStatus] = useState<CustomerIntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    fetch(`/api/platform/integrations/status?tenantId=${encodeURIComponent(tenantId)}`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(body.error ?? "Could not load connection status.");
          return;
        }
        setError(null);
        setStatus(body as CustomerIntegrationStatus);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load connection status.");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const presenceFor = (key: PlatformIconKey) => status?.presence?.find((entry) => entry.key === key);
  const website = presenceFor("website");
  const cards: Array<{ key: PlatformIconKey; title: string; state: ConnectorState; copy: string }> = [
    {
      key: "website",
      title: "Website",
      state: website?.href ? "connected" : "setup_required",
      copy: website?.href ? "Website saved in your verified business context." : "Add your website through the Audit or Brand Brain.",
    },
    {
      key: "google_business",
      title: "Google Business / Maps",
      state: "setup_required",
      copy: "Your public Google Business listing is shown when discovered. Direct profile management is not connected yet.",
    },
    {
      key: "whatsapp",
      title: "WhatsApp",
      state: status?.whatsapp ?? "checking",
      copy: status?.whatsapp === "connected"
        ? "WhatsApp Business is connected for this workspace."
        : "WhatsApp Business setup is staff-assisted. Stratxcel connects the platform sender used for Audit delivery.",
    },
    {
      key: "facebook",
      title: "Facebook",
      state: status?.facebook ?? "checking",
      copy: "Self-service Facebook connection is not available in this workspace yet.",
    },
    {
      key: "instagram",
      title: "Instagram",
      state: status?.instagram ?? "checking",
      copy: "Self-service Instagram connection is not available in this workspace yet.",
    },
    {
      key: "threads",
      title: "Threads",
      state: status?.threads ?? "checking",
      copy: "Self-service Threads connection is not available in this workspace yet.",
    },
    {
      key: "youtube",
      title: "YouTube",
      state: status?.youtube ?? "checking",
      copy: "Self-service YouTube connection is not available in this workspace yet.",
    },
    {
      key: "linkedin",
      title: "LinkedIn",
      state: status?.linkedin ?? "checking",
      copy: "Self-service LinkedIn connection is not available in this workspace yet.",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader title="Connectors" tenantName={active?.name} description="Real connection status and verified business destinations. Actions appear only where a live backend exists." />
      {error && (
        <ErrorState
          message={error}
          onRetry={() => {
            if (!tenantId) return;
            setError(null);
            fetch(`/api/platform/integrations/status?tenantId=${encodeURIComponent(tenantId)}`)
              .then(async (response) => {
                const body = await response.json();
                if (!response.ok) {
                  setError(body.error ?? "Could not load connection status.");
                  return;
                }
                setStatus(body as CustomerIntegrationStatus);
              })
              .catch(() => setError("Could not load connection status."));
          }}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const presence = presenceFor(card.key);
          return (
            <Card key={card.key} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <CardHeading>
                  <span className="inline-flex items-center gap-2"><PlatformIcon name={card.key} /> {card.title}</span>
                </CardHeading>
                <BusinessStatus state={card.state} />
              </div>
              <p className="mt-2 text-sm text-sx-text-muted">{card.copy}</p>
              {presence?.href && (
                <div className="mt-3 rounded-sx-sm bg-sx-surface-2 p-3">
                  <a href={presence.href} target="_blank" rel="noreferrer" className="block break-all text-sm font-semibold text-sx-accent hover:underline">
                    {presence.handle || presence.href}
                  </a>
                  <p className="mt-1 text-xs text-sx-text-subtle">
                    {presence.provenance.replaceAll("_", " ")}
                    {presence.lastSync ? ` · synced ${new Date(presence.lastSync).toLocaleDateString()}` : ""}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {tenantId && (
        <Card className="p-5">
          <CardHeading>
            <span className="inline-flex items-center gap-2">
              <PlatformIcon name="google" />
              <PlatformIcon name="analytics" />
              Search Console & Analytics
            </span>
          </CardHeading>
          <p className="mb-4 mt-2 text-sm text-sx-text-muted">Connect Google properties for this workspace when OAuth is available.</p>
          <GoogleSearchIntegrationPanel tenantId={tenantId} />
        </Card>
      )}
    </div>
  );
}
