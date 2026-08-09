"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Field } from "@/components/ui/Input";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";

interface GoogleSite {
  siteUrl: string;
  permissionLevel: string;
}
interface Ga4Property {
  propertyId: string;
  displayName: string;
  accountDisplayName: string;
}
interface ResourcesState {
  status: "disconnected" | "connecting" | "connected" | "revoked" | "error";
  searchConsoleSiteUrl: string | null;
  searchConsoleLastSyncedAt: string | null;
  ga4PropertyId: string | null;
  ga4PropertyDisplayName: string | null;
  ga4LastSyncedAt: string | null;
  lastError: string | null;
  searchConsoleSites: GoogleSite[];
  searchConsoleError: string | null;
  ga4Properties: Ga4Property[];
  ga4Error: string | null;
}

const formatSync = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never synced");

/**
 * Search & Discovery's "Google Search" tab panel: shows the tenant's
 * Google Search Console + GA4 connection state and lets an admin/owner
 * connect, pick properties, and disconnect. Real API-backed — never shows
 * a provider as connected unless /resources actually reflects a live,
 * authenticated Google connection. Never renders a token, client ID/secret,
 * or raw OAuth error — only short, named reason codes.
 */
export function GoogleSearchIntegrationPanel({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<ResourcesState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [pendingSite, setPendingSite] = useState("");
  const [pendingGa4, setPendingGa4] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/platform/search/google/resources?tenantId=${encodeURIComponent(tenantId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) return setError(body.error ?? "SEARCH_GOOGLE_STATUS_FAILED");
      setState(body);
      setPendingSite((current) => current || body.searchConsoleSiteUrl || "");
      setPendingGa4((current) => current || body.ga4PropertyId || "");
    } catch {
      setError("SEARCH_GOOGLE_STATUS_FAILED");
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  // After returning from the Google OAuth callback redirect, drop the
  // one-shot query params and refresh state — never trust them for
  // anything beyond a one-time "reload now" signal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("googleConnected") || params.has("googleConnectError")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("googleConnected");
      url.searchParams.delete("googleConnectError");
      window.history.replaceState({}, "", url.toString());
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveConfig() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/search/google/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          searchConsoleSiteUrl: pendingSite || null,
          ga4PropertyId: pendingGa4 || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) return setError(body.error ?? "SEARCH_GOOGLE_CONFIG_FAILED");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/search/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const body = await response.json();
      if (!response.ok) return setError(body.error ?? "SEARCH_GOOGLE_DISCONNECT_FAILED");
      setPendingSite("");
      setPendingGa4("");
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = state?.status === "connected";
  const connectHref = `/api/platform/search/google/connect?tenantId=${encodeURIComponent(tenantId)}`;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardHeading>Google Search Console &amp; GA4</CardHeading>
        <StatusChip state={connected ? "success" : state?.status === "error" ? "danger" : "dashed"}>
          {connected ? "Connected" : state?.status === "error" ? "Error" : "Not connected"}
        </StatusChip>
      </div>
      <p className="mt-1.5 text-xs text-sx-text-muted">
        One Google sign-in covers both read-only surfaces. Stratxcel never stores your Google password and only requests read-only access.
      </p>

      {error && (
        <div className="mt-3">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {!connected ? (
        <div className="mt-3">
          <a href={connectHref}>
            <Button variant="primary" size="sm">
              Connect Google
            </Button>
          </a>
          {state?.lastError && <p className="mt-2 text-xs text-sx-text-subtle">Last attempt: {state.status === "error" ? "could not complete the connection." : state.lastError}</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Search Console property">
              <Select value={pendingSite} onChange={(event) => setPendingSite(event.target.value)}>
                <option value="">Select a property…</option>
                {state?.searchConsoleSites.map((site) => (
                  <option key={site.siteUrl} value={site.siteUrl}>
                    {site.siteUrl}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-sx-text-subtle">
                {state?.searchConsoleSiteUrl ? `Selected · last sync: ${formatSync(state.searchConsoleLastSyncedAt)}` : "No property selected yet"}
                {state?.searchConsoleError ? ` · could not list properties (${state.searchConsoleError})` : ""}
              </p>
            </Field>
            <Field label="GA4 property">
              <Select value={pendingGa4} onChange={(event) => setPendingGa4(event.target.value)}>
                <option value="">Select a property…</option>
                {state?.ga4Properties.map((property) => (
                  <option key={property.propertyId} value={property.propertyId}>
                    {property.displayName} ({property.accountDisplayName})
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-sx-text-subtle">
                {state?.ga4PropertyId ? `Selected · last sync: ${formatSync(state.ga4LastSyncedAt)}` : "No property selected yet"}
                {state?.ga4Error ? ` · could not list properties (${state.ga4Error})` : ""}
              </p>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={saveConfig} disabled={saving}>
              {saving ? "Saving…" : "Save property selection"}
            </Button>
            <a href={connectHref}>
              <Button variant="secondary" size="sm">
                Reconnect / change Google account
              </Button>
            </a>
            <Button variant="danger" size="sm" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect Google"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
