"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";
import { PlatformIcon } from "@/components/audit/PlatformIcon";

interface CustomerIntegrationStatus {
  whatsapp: "connected" | "action_required" | "setup_required";
}

async function requestStatus(tenantId: string): Promise<{ status: CustomerIntegrationStatus | null; error: string | null }> {
  const response = await fetch(`/api/platform/integrations/status?tenantId=${encodeURIComponent(tenantId)}`);
  const body = await response.json();
  return response.ok
    ? { status: body as CustomerIntegrationStatus, error: null }
    : { status: null, error: body.error ?? "Could not load connection status." };
}

const CONNECTIONS = [
  {
    key: "social",
    title: "Facebook, Instagram & Threads",
    description: "Connect your social channels with help from the Stratxcel team. Self-service account connection is not available in this workspace yet.",
  },
  {
    key: "google",
    title: "Google Search & Analytics",
    description: "Google connections are configured from Search & SEO when a supported property is ready.",
  },
] as const;

function BusinessStatus({ state }: { state: "checking" | "connected" | "action_required" | "setup_required" }) {
  if (state === "checking") return <StatusChip state="neutral">Checking</StatusChip>;
  if (state === "connected") return <StatusChip state="success">Connected</StatusChip>;
  if (state === "action_required") return <StatusChip state="warning">Action required</StatusChip>;
  return <StatusChip state="neutral">Setup required</StatusChip>;
}

export default function IntegrationsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [status, setStatus] = useState<CustomerIntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const result = await requestStatus(tenantId);
    setError(result.error);
    if (result.status) setStatus(result.status);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void requestStatus(tenantId).then((result) => {
      if (cancelled) return;
      setError(result.error);
      if (result.status) setStatus(result.status);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Connectors{active ? ` — ${active.name}` : ""}</h1>
        <p className="mt-1 text-sm text-sx-text-muted">See which business channels are ready and where setup help is needed.</p>
      </header>
      {error && <ErrorState message={error} onRetry={load} />}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <CardHeading>
              <span className="inline-flex items-center gap-2"><PlatformIcon name="whatsapp" /> WhatsApp Business</span>
            </CardHeading>
            <BusinessStatus state={status?.whatsapp ?? "checking"} />
          </div>
          <p className="mt-2 text-sm text-sx-text-muted">
            {status === null
              ? "Checking your WhatsApp Business connection."
              : status.whatsapp === "connected"
                ? "Your WhatsApp Business channel is connected."
                : status.whatsapp === "action_required"
                  ? "Your WhatsApp connection needs attention from the Stratxcel team."
                  : "WhatsApp Business setup is staff-assisted. Contact Stratxcel when you are ready to connect it."}
          </p>
        </Card>

        {CONNECTIONS.map((connection) => (
          <Card key={connection.key} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <CardHeading>
              <span className="inline-flex items-center gap-2">
                {connection.key === "social" ? (
                  <>
                    <PlatformIcon name="facebook" />
                    <PlatformIcon name="instagram" />
                    <PlatformIcon name="threads" />
                  </>
                ) : (
                  <>
                    <PlatformIcon name="google" />
                    <PlatformIcon name="analytics" />
                  </>
                )}
                {connection.title}
              </span>
            </CardHeading>
              <BusinessStatus state="setup_required" />
            </div>
            <p className="mt-2 text-sm text-sx-text-muted">{connection.description}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
