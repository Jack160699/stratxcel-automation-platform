"use client";

import { useEffect, useState, useCallback } from "react";
import { PlatformIcon, type PlatformIconKey } from "@/components/audit/PlatformIcon";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import type { CanonicalConnectionStatus, V1DigitalPresencePlatform } from "@/lib/connectors/canonical-status";

interface DigitalPresenceCardsProps {
  tenantId: string;
  readOnly?: boolean;
  returnPath?: string;
  onStatusChange?: () => void;
}

export function DigitalPresenceCards({
  tenantId,
  readOnly = false,
  returnPath = "/app/brand",
  onStatusChange,
}: DigitalPresenceCardsProps) {
  const [connections, setConnections] = useState<Record<string, CanonicalConnectionStatus> | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadStatus = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/platform/integrations/status?tenantId=${encodeURIComponent(tenantId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.connections) {
        setConnections(data.connections);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Clean OAuth query params and trigger reload
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    const provider = params.get("provider") || params.get("connected");
    const googleConnected = params.get("googleConnected");

    if (oauth === "success" || googleConnected === "1" || provider) {
      setFeedback({
        type: "success",
        message: `✓ ${provider ? provider.replace("_", " ") : "Connection"} updated successfully!`,
      });
      void loadStatus();
      if (onStatusChange) onStatusChange();

      // Clean query params from URL without reload
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("oauth");
      cleanUrl.searchParams.delete("provider");
      cleanUrl.searchParams.delete("connected");
      cleanUrl.searchParams.delete("googleConnected");
      window.history.replaceState({}, "", cleanUrl.pathname);

      setTimeout(() => setFeedback(null), 5000);
    }
  }, [loadStatus, onStatusChange]);

  async function handleDisconnect(provider: string) {
    if (readOnly || !tenantId) return;
    const confirmed = window.confirm(`Are you sure you want to disconnect ${provider.replace("_", " ")}?`);
    if (!confirmed) return;

    setDisconnecting(provider);
    setFeedback(null);
    try {
      const res = await fetch("/api/platform/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, provider }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFeedback({ type: "error", message: body.error || "Failed to disconnect account." });
        return;
      }
      setFeedback({ type: "success", message: `✓ ${provider.replace("_", " ")} disconnected.` });
      await loadStatus();
      if (onStatusChange) onStatusChange();
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback({ type: "error", message: "Network error disconnecting account." });
    } finally {
      setDisconnecting(null);
    }
  }

  // Canonical V1.5 order
  const v1Platforms: Array<{
    key: V1DigitalPresencePlatform;
    iconKey: PlatformIconKey;
    label: string;
    connectHref: string | null;
    manageHref?: string;
  }> = [
    {
      key: "website",
      iconKey: "website",
      label: "Website",
      connectHref: null,
    },
    {
      key: "google_business",
      iconKey: "google_business",
      label: "Google Business",
      connectHref: `/api/social/oauth/google_business/connect?redirectTo=${encodeURIComponent(returnPath)}&tenantId=${encodeURIComponent(tenantId)}`,
    },
    {
      key: "instagram",
      iconKey: "instagram",
      label: "Instagram",
      connectHref: `/api/social/oauth/instagram/connect?redirectTo=${encodeURIComponent(returnPath)}&tenantId=${encodeURIComponent(tenantId)}`,
    },
    {
      key: "facebook",
      iconKey: "facebook",
      label: "Facebook",
      connectHref: `/api/social/oauth/facebook/connect?redirectTo=${encodeURIComponent(returnPath)}&tenantId=${encodeURIComponent(tenantId)}`,
    },
    {
      key: "youtube",
      iconKey: "youtube",
      label: "YouTube",
      connectHref: `/api/social/oauth/youtube/connect?redirectTo=${encodeURIComponent(returnPath)}&tenantId=${encodeURIComponent(tenantId)}`,
    },
    {
      key: "google_analytics",
      iconKey: "google_analytics",
      label: "Google Analytics (GA4)",
      connectHref: `/api/platform/search/google/connect?redirectTo=${encodeURIComponent(returnPath)}&tenantId=${encodeURIComponent(tenantId)}`,
      manageHref: "/app/integrations",
    },
    {
      key: "google_search_console",
      iconKey: "google_search_console",
      label: "Google Search Console",
      connectHref: `/api/platform/search/google/connect?redirectTo=${encodeURIComponent(returnPath)}&tenantId=${encodeURIComponent(tenantId)}`,
      manageHref: "/app/integrations",
    },
    {
      key: "whatsapp",
      iconKey: "whatsapp",
      label: "WhatsApp Number",
      connectHref: null,
      manageHref: "/app/integrations",
    },
  ];

  if (loading && !connections) {
    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 mt-3">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-28 rounded-sx-sm bg-sx-surface-2 animate-pulse border border-sx-border/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <div
          className={`rounded-sx-sm px-3.5 py-2 text-xs font-medium flex items-center justify-between ${
            feedback.type === "success"
              ? "bg-sx-success/10 border border-sx-success/30 text-sx-success"
              : "bg-sx-danger/10 border border-sx-danger/30 text-sx-danger"
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {v1Platforms.map((item) => {
          const status = connections?.[item.key];
          const state = status?.connectionState ?? "NOT_CONNECTED";
          const isConnected = state === "CONNECTED";
          const isDiscovered = state === "DISCOVERED_PUBLICLY";
          const isReauth = state === "REAUTH_REQUIRED";
          const isError = state === "ERROR";

          return (
            <div
              key={item.key}
              className={`flex flex-col justify-between rounded-sx-sm p-3.5 border transition-all ${
                isConnected
                  ? "bg-sx-surface-2/90 border-sx-border/80 shadow-xs"
                  : isDiscovered
                  ? "bg-sx-surface-1 border-sx-accent/30"
                  : "bg-sx-surface-1/60 border-sx-border/40"
              }`}
            >
              <div>
                {/* Header: Icon + Title + Status Chip */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlatformIcon name={item.iconKey} />
                    <span className="font-semibold text-sx-text text-sm truncate">{item.label}</span>
                  </div>
                  <div className="shrink-0">
                    {isConnected ? (
                      <StatusChip state="success">Connected</StatusChip>
                    ) : isReauth ? (
                      <StatusChip state="warning">Needs attention</StatusChip>
                    ) : isError ? (
                      <StatusChip state="danger">Error</StatusChip>
                    ) : isDiscovered ? (
                      <StatusChip state="accent">Found publicly</StatusChip>
                    ) : (
                      <StatusChip state="dashed">Not connected</StatusChip>
                    )}
                  </div>
                </div>

                {/* Subtitle / Handle */}
                <div className="mt-2 text-xs">
                  {status?.handle ? (
                    <div className="truncate font-mono font-medium text-sx-text">
                      {status.publicUrl ? (
                        <a
                          href={status.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-sx-accent hover:underline"
                        >
                          {status.handle}
                        </a>
                      ) : (
                        <span>{status.handle}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sx-text-subtle">
                      {item.key === "website" ? "No website entered" : "Not authenticated"}
                    </span>
                  )}

                  <p className="mt-1 text-[11px] text-sx-text-muted leading-tight">
                    {isConnected
                      ? "Authenticated · active publishing & insights"
                      : isDiscovered
                      ? "Discovered on website · Connect to authenticate"
                      : isReauth
                      ? "Token expired · Reconnect to restore access"
                      : "Connect account to enable AI missions"}
                  </p>
                </div>
              </div>

              {/* Action Buttons Footer */}
              {!readOnly && (
                <div className="mt-3 pt-2.5 border-t border-sx-border/40 flex items-center justify-between gap-2">
                  {isConnected ? (
                    <div className="flex w-full items-center justify-between gap-1.5">
                      {item.manageHref ? (
                        <a href={item.manageHref} className="inline-block">
                          <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2">
                            Manage
                          </Button>
                        </a>
                      ) : item.connectHref ? (
                        <a href={item.connectHref} className="inline-block">
                          <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2">
                            Reconnect
                          </Button>
                        </a>
                      ) : (
                        <span />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] h-7 px-2 text-sx-danger hover:bg-sx-danger/10"
                        onClick={() => handleDisconnect(item.key)}
                        disabled={disconnecting === item.key}
                      >
                        {disconnecting === item.key ? "…" : "Disconnect"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex w-full justify-end">
                      {item.manageHref && (item.key === "whatsapp" || item.key.startsWith("google_")) ? (
                        <a href={item.manageHref} className="w-full">
                          <Button variant="primary" size="sm" className="w-full text-xs h-7">
                            {item.key === "whatsapp" ? "Verify Number" : "Connect Property"}
                          </Button>
                        </a>
                      ) : item.connectHref ? (
                        <a href={item.connectHref} className="w-full">
                          <Button
                            variant={isDiscovered ? "primary" : "secondary"}
                            size="sm"
                            className="w-full text-xs h-7"
                          >
                            {isReauth ? "Reconnect" : isDiscovered ? "Authenticate" : "Connect"}
                          </Button>
                        </a>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
