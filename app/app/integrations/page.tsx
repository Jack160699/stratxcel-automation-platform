"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { GoogleSearchIntegrationPanel } from "../components/GoogleSearchIntegrationPanel";
import { ModulePageHeader } from "../components/ModulePageHeader";

export type ConnectorState =
  | "checking"
  | "connected"
  | "action_required"
  | "setup_required"
  | "discovered_public"
  | "testing_access_required";

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

function BusinessStatus({
  state,
  canConnect,
  isDiscovered,
}: {
  state: ConnectorState;
  canConnect: boolean;
  isDiscovered: boolean;
}) {
  if (state === "checking") return <StatusChip state="neutral">Checking</StatusChip>;
  if (state === "connected") return <StatusChip state="success">Connected</StatusChip>;
  if (state === "action_required") return <StatusChip state="warning">Needs attention</StatusChip>;
  if (isDiscovered) return <StatusChip state="accent">Found publicly</StatusChip>;
  if (!canConnect) return <StatusChip state="neutral">Testing access required</StatusChip>;
  return <StatusChip state="neutral">Not connected</StatusChip>;
}

export default function IntegrationsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [status, setStatus] = useState<CustomerIntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Request Access Dialog State
  const [requestModalProvider, setRequestModalProvider] = useState<{ key: string; title: string } | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);

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

  const cards: Array<{
    key: PlatformIconKey;
    title: string;
    state: ConnectorState;
    copy: string;
    isOAuth: boolean;
  }> = [
    {
      key: "website",
      title: "Website",
      state: website?.href ? "connected" : "setup_required",
      copy: website?.href ? "Website saved in your verified business context." : "Add your website through the Audit or Brand Brain.",
      isOAuth: false,
    },
    {
      key: "instagram",
      title: "Instagram",
      state: status?.instagram ?? "checking",
      copy: status?.instagram === "connected"
        ? "Connected to Meta for direct publishing, inbox, and insights."
        : "Connect your Instagram Professional or Creator account for publishing and insights.",
      isOAuth: true,
    },
    {
      key: "facebook",
      title: "Facebook Page",
      state: status?.facebook ?? "checking",
      copy: status?.facebook === "connected"
        ? "Connected to Meta for Facebook Page management."
        : "Connect your Facebook Business Page for automated posts and comments.",
      isOAuth: true,
    },
    {
      key: "threads",
      title: "Threads",
      state: status?.threads ?? "checking",
      copy: status?.threads === "connected"
        ? "Connected to Threads for text and image posts."
        : "Connect your Threads account for micro-blogging and automated updates.",
      isOAuth: true,
    },
    {
      key: "youtube",
      title: "YouTube",
      state: status?.youtube ?? "checking",
      copy: status?.youtube === "connected"
        ? "Connected to YouTube for video uploads and analytics."
        : "Connect your YouTube Channel for video publishing and insights.",
      isOAuth: true,
    },
    {
      key: "linkedin",
      title: "LinkedIn",
      state: status?.linkedin ?? "checking",
      copy: status?.linkedin === "connected"
        ? "Connected to LinkedIn for company page and profile updates."
        : "Connect your LinkedIn account or Organization Page.",
      isOAuth: true,
    },
    {
      key: "whatsapp",
      title: "WhatsApp",
      state: status?.whatsapp ?? "checking",
      copy: status?.whatsapp === "connected"
        ? "WhatsApp Business is active for this workspace."
        : "WhatsApp Business connects via Stratxcel's platform sender for Audit delivery and CRM escalation.",
      isOAuth: false,
    },
    {
      key: "google_business",
      title: "Google Business / Maps",
      state: "setup_required",
      copy: "Your public Google Business profile is shown when discovered. Direct management connects via Google Search Console.",
      isOAuth: false,
    },
  ];

  async function submitAccessRequest() {
    if (!requestModalProvider || !tenantId) return;
    setRequestSubmitting(true);
    try {
      const res = await fetch("/api/platform/integrations/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          provider: requestModalProvider.key,
          reason: requestReason,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRequestFeedback(data.message ?? "Request received. We’ll notify you when testing access is enabled.");
        setTimeout(() => {
          setRequestModalProvider(null);
          setRequestFeedback(null);
          setRequestReason("");
        }, 2500);
      } else {
        setRequestFeedback(data.error ?? "Could not submit request.");
      }
    } catch {
      setRequestFeedback("Could not submit request. Please try again.");
    } finally {
      setRequestSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader
        title="Connectors"
        tenantName={active?.name}
        description="Real connection status and verified business destinations. One-tap connect begins the real provider authorization."
      />

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
          const canConnect = card.isOAuth ? Boolean(status?.selfService?.social) : false;
          const isDiscovered = Boolean(presence?.href && card.state !== "connected");
          const connectHref = tenantId && card.isOAuth
            ? `/api/social/oauth/${card.key}/connect?redirectTo=${encodeURIComponent("/app/integrations")}&tenantId=${encodeURIComponent(tenantId)}`
            : null;

          return (
            <Card key={card.key} className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <CardHeading>
                    <span className="inline-flex items-center gap-2">
                      <PlatformIcon name={card.key} /> {card.title}
                    </span>
                  </CardHeading>
                  <BusinessStatus
                    state={card.state}
                    canConnect={card.isOAuth ? canConnect : true}
                    isDiscovered={isDiscovered}
                  />
                </div>
                <p className="mt-2 text-sm text-sx-text-muted">{card.copy}</p>

                {presence?.href && (
                  <div className="mt-3 rounded-sx-sm bg-sx-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={presence.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-semibold text-sx-accent hover:underline"
                      >
                        {presence.handle || presence.href}
                      </a>
                    </div>
                    <p className="mt-1 text-xs text-sx-text-subtle">
                      {presence.provenance.replaceAll("_", " ")}
                      {presence.lastSync ? ` · synced ${new Date(presence.lastSync).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                )}
              </div>

              {card.isOAuth && tenantId && (
                <div className="mt-5 pt-3 border-t border-sx-border/40 flex items-center justify-between gap-3">
                  {card.state === "connected" && connectHref && (
                    <a href={connectHref}>
                      <Button variant="secondary" size="sm">
                        Reconnect
                      </Button>
                    </a>
                  )}

                  {card.state === "action_required" && connectHref && (
                    <a href={connectHref}>
                      <Button variant="primary" size="sm">
                        Reconnect account
                      </Button>
                    </a>
                  )}

                  {card.state !== "connected" && card.state !== "action_required" && (
                    canConnect && connectHref ? (
                      <a href={connectHref}>
                        <Button variant="primary" size="sm">
                          Connect {card.title}
                        </Button>
                      </a>
                    ) : (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-xs text-sx-text-subtle">Testing access required</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setRequestModalProvider({ key: card.key, title: card.title });
                            setRequestReason("");
                            setRequestFeedback(null);
                          }}
                        >
                          Request access
                        </Button>
                      </div>
                    )
                  )}
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
              Search Console &amp; GA4
            </span>
          </CardHeading>
          <p className="mb-4 mt-2 text-sm text-sx-text-muted">
            Connect Google Search Console and GA4 properties for this workspace via read-only Google OAuth.
          </p>
          <GoogleSearchIntegrationPanel tenantId={tenantId} />
        </Card>
      )}

      {/* Request Access Dialog */}
      {requestModalProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-sx-md bg-sx-surface-1 p-6 shadow-xl border border-sx-border">
            <h3 className="text-lg font-semibold text-sx-text">Request Connector Access</h3>
            <p className="mt-1 text-sm text-sx-text-muted">
              Connector testing for <strong className="text-sx-text">{requestModalProvider.title}</strong> is currently limited to approved test accounts.
            </p>

            {requestFeedback ? (
              <div className="my-4 rounded-sx-sm bg-sx-surface-2 p-3 text-sm text-sx-accent font-medium">
                {requestFeedback}
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <label className="text-xs text-sx-text-subtle">
                  Workspace context: <span className="font-semibold text-sx-text">{active?.name ?? tenantId}</span>
                </label>
                <textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Optional: Tell us what you plan to connect or test..."
                  rows={3}
                  className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5 text-sm text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRequestModalProvider(null)}
                    disabled={requestSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={submitAccessRequest}
                    disabled={requestSubmitting}
                  >
                    {requestSubmitting ? "Submitting…" : "Submit Request"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
