"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { SocialConnection, SocialPlatformKey } from "../types";

/** Provider label used for OAuth attribution in UI. */
const PROVIDER_LABELS: Partial<Record<SocialPlatformKey, string>> = {
  instagram: "Meta",
  facebook: "Meta",
  threads: "Meta",
  linkedin: "LinkedIn",
  youtube: "Google",
};

interface PlatformCard {
  key: SocialPlatformKey;
  label: string;
  oauthAvailable: boolean;
  deferredReason?: string;
  publicProfilePlaceholder?: string;
}

const PLATFORM_CARDS: PlatformCard[] = [
  { key: "instagram", label: "Instagram", oauthAvailable: true, publicProfilePlaceholder: "@yourbrand" },
  { key: "facebook", label: "Facebook", oauthAvailable: true, publicProfilePlaceholder: "Page name or URL" },
  { key: "threads", label: "Threads", oauthAvailable: true, publicProfilePlaceholder: "@yourbrand" },
  { key: "linkedin", label: "LinkedIn", oauthAvailable: true, publicProfilePlaceholder: "Company page URL" },
  { key: "youtube", label: "YouTube", oauthAvailable: true, publicProfilePlaceholder: "@YourChannel or URL" },
  { key: "whatsapp", label: "WhatsApp", oauthAvailable: false, deferredReason: "Requires Meta Business setup after workspace creation", publicProfilePlaceholder: "+91 98765 43210" },
];

export function StepConnectors({
  connections = [],
  onConnectionsChange,
}: {
  connections: SocialConnection[];
  onConnectionsChange: (next: SocialConnection[]) => void;
}) {
  const [publicProfilePlatform, setPublicProfilePlatform] = useState<SocialPlatformKey | null>(null);
  const [publicProfileInput, setPublicProfileInput] = useState("");
  const [publicProfileError, setPublicProfileError] = useState<string | null>(null);

  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Rehydrate fresh OAuth connections from server on mount and check query params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    const oauthStatus = params.get("oauth");
    const provider = params.get("provider") || params.get("connected");
    const connectError = params.get("connect_error");

    if (oauthStatus === "success" || params.get("connected")) {
      const pName = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "Account";
      setNotification({ type: "success", message: `✓ ${pName} connected successfully via OAuth!` });
    } else if (oauthStatus === "denied") {
      setNotification({ type: "info", message: "Connection request was cancelled. You can connect anytime later." });
    } else if (oauthStatus === "error" || connectError) {
      setNotification({ type: "error", message: `Connection failed: ${connectError || "Authorization could not be completed"}` });
    }

    if (oauthStatus || connectError || params.get("connected")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth");
      url.searchParams.delete("provider");
      url.searchParams.delete("connected");
      url.searchParams.delete("connect_error");
      window.history.replaceState({}, "", url.pathname);
    }

    void loadFreshServerOAuthConnections();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFreshServerOAuthConnections() {
    try {
      const res = await fetch("/api/platform/onboarding", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { oauthConnections?: Record<string, any> };
      const oauthConnections = body.oauthConnections ?? {};

      if (Object.keys(oauthConnections).length === 0) return;

      const updated = [...connections];
      for (const [platform, data] of Object.entries(oauthConnections)) {
        const key = platform as SocialPlatformKey;
        const idx = updated.findIndex((c) => c.platform === key);
        const conn: SocialConnection = {
          platform: key,
          handle: data.username ? (data.username.startsWith("@") ? data.username : `@${data.username}`) : undefined,
          displayName: data.displayName || data.username || platform,
          status: "connected",
          connectionType: "oauth",
          providerAccountId: data.providerAccountId,
          providerDisplayName: data.displayName || undefined,
          providerLabel: data.providerLabel || PROVIDER_LABELS[key] || "OAuth",
          connectedAt: data.connectedAt || new Date().toISOString(),
        };
        if (idx >= 0) {
          updated[idx] = conn;
        } else {
          updated.push(conn);
        }
      }

      onConnectionsChange(updated);
    } catch {
      // Non-blocking trace
    }
  }

  function startOAuth(platform: SocialPlatformKey) {
    // Navigate directly to canonical OAuth authorization route
    window.location.href = `/api/social/oauth/${platform}/connect?redirectTo=/app`;
  }

  function handleDisconnect(platform: SocialPlatformKey) {
    const nextConnections = connections.filter((c) => c.platform !== platform);
    nextConnections.push({
      platform,
      status: "not_connected",
    });
    onConnectionsChange(nextConnections);
  }

  function handleSavePublicProfile() {
    if (!publicProfilePlatform) return;
    const trimmed = publicProfileInput.trim();
    if (!trimmed) {
      setPublicProfileError("Enter a handle, URL, or identifier.");
      return;
    }

    let handle = trimmed;
    if (["instagram", "threads", "youtube"].includes(publicProfilePlatform)) {
      if (!handle.startsWith("@") && !handle.startsWith("http")) handle = `@${handle}`;
    }

    const nextConnections = connections.filter((c) => c.platform !== publicProfilePlatform);
    nextConnections.push({
      platform: publicProfilePlatform,
      handle: handle.startsWith("@") || publicProfilePlatform === "whatsapp" ? handle : undefined,
      url: handle.startsWith("http") ? handle : undefined,
      displayName: handle,
      status: "connected",
      connectionType: "public_profile",
      connectedAt: new Date().toISOString(),
    });

    onConnectionsChange(nextConnections);
    setPublicProfilePlatform(null);
    setPublicProfileInput("");
    setPublicProfileError(null);
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <h3 className="font-sx-sans text-base font-semibold text-sx-text">Connect your business channels</h3>
        <p className="font-sx-sans text-xs text-sx-text-muted mt-1">
          Connect the accounts you want StratXcel to work with. You can skip any channel and connect it later.
        </p>
      </div>

      {notification && (
        <div
          className={`flex items-center justify-between rounded-sx-sm px-3.5 py-2.5 text-xs font-medium ${
            notification.type === "success"
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : notification.type === "error"
              ? "border border-rose-400/30 bg-rose-500/10 text-rose-300"
              : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="ml-3 font-bold opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {PLATFORM_CARDS.map((card) => {
          const connection = connections.find((c) => c.platform === card.key);
          const isOAuthConnected = connection?.status === "connected" && connection.connectionType === "oauth";
          const isPublicProfile = connection?.status === "connected" && connection.connectionType === "public_profile";
          const isConnected = isOAuthConnected || isPublicProfile;
          const identifier = connection?.handle || connection?.displayName || connection?.url;

          return (
            <div
              key={card.key}
              data-platform={card.key}
              className={`flex flex-col gap-2 p-3 rounded-sx-md border transition-colors ${
                isOAuthConnected
                  ? "border-emerald-500/30 bg-emerald-950/10"
                  : isPublicProfile
                  ? "border-amber-500/20 bg-amber-950/5"
                  : "border-sx-border bg-sx-surface-2/60 hover:bg-sx-surface-2"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border">
                    <PlatformIcon name={card.key} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-sx-sans text-xs font-semibold text-sx-text truncate">{card.label}</p>
                    {isOAuthConnected ? (
                      <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1">
                        <span>✓</span>
                        <span className="truncate">{identifier || "Connected"}</span>
                      </p>
                    ) : isPublicProfile ? (
                      <p className="font-sx-sans text-[11px] font-medium text-amber-400 truncate flex items-center gap-1">
                        <span>○</span>
                        <span className="truncate">{identifier || "Public profile"}</span>
                      </p>
                    ) : (
                      <p className="font-sx-sans text-[11px] text-sx-text-subtle">Not connected</p>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(card.key)}
                      className="px-2 py-1 text-[11px] font-medium rounded-sx-sm text-sx-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : card.oauthAvailable ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => startOAuth(card.key)}
                      className="h-8 text-xs font-semibold"
                    >
                      Connect
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setPublicProfilePlatform(card.key);
                        setPublicProfileInput("");
                        setPublicProfileError(null);
                      }}
                      className="h-8 text-xs font-semibold"
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>

              {/* OAuth attribution badge */}
              {isOAuthConnected && (
                <p className="text-[10px] text-emerald-400/80 font-medium pl-10">
                  ✓ Connected via {connection?.providerLabel || "OAuth"}
                </p>
              )}

              {/* Public profile badge */}
              {isPublicProfile && (
                <p className="text-[10px] text-amber-400/70 font-medium pl-10">
                  Public profile only — not an authorized connection
                </p>
              )}

              {/* Deferred provider explanation */}
              {!isConnected && card.deferredReason && (
                <p className="text-[10px] text-sx-text-subtle pl-10">
                  {card.deferredReason}
                </p>
              )}

              {/* "Add public profile" secondary link for OAuth providers */}
              {!isConnected && card.oauthAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    setPublicProfilePlatform(card.key);
                    setPublicProfileInput("");
                    setPublicProfileError(null);
                  }}
                  className="text-[10px] text-sx-text-subtle hover:text-sx-text-muted underline underline-offset-2 pl-10 text-left"
                >
                  Add public profile manually instead
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-sx-text-subtle text-center mt-1">
        You can skip channels now and connect them anytime from your workspace dashboard.
      </p>

      {/* Manual Public Profile Input Dialog */}
      {publicProfilePlatform && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-profile-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PlatformIcon name={publicProfilePlatform} className="h-5 w-5" />
                <h4 id="public-profile-dialog-title" className="font-sx-sans text-base font-semibold text-sx-text">
                  Add public profile
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPublicProfilePlatform(null)}
                className="text-sx-text-muted hover:text-sx-text text-sm"
              >
                ✕
              </button>
            </div>

            <div className="rounded-sx-sm border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-xs text-amber-300 font-medium">
                This adds a public profile reference only.
              </p>
              <p className="text-[11px] text-amber-300/70 mt-0.5">
                StratXcel can use this for audit research, but cannot manage or publish to this account without a real provider connection.
              </p>
            </div>

            <FormField
              label={`${PLATFORM_CARDS.find((c) => c.key === publicProfilePlatform)?.label} public profile`}
              htmlFor="public-profile-input"
              error={publicProfileError}
            >
              <Input
                id="public-profile-input"
                value={publicProfileInput}
                onChange={(e) => setPublicProfileInput(e.target.value)}
                placeholder={PLATFORM_CARDS.find((c) => c.key === publicProfilePlatform)?.publicProfilePlaceholder || "Handle, URL, or identifier"}
                autoFocus
                className="h-11 text-sm font-mono"
              />
            </FormField>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="touch"
                onClick={() => setPublicProfilePlatform(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="touch"
                onClick={handleSavePublicProfile}
              >
                Save Public Profile
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
