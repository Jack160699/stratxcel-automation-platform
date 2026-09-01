"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlatformIcon } from "@/components/audit/PlatformIcon";

interface VercelProject {
  projectName: string;
  domains: unknown;
  framework: string | null;
  lastDeploymentState: string | null;
  lastDeploymentUrl: string | null;
}

/**
 * Customer-friendly Vercel connect error copy (docs/discovery/
 * SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 19). The raw backend reason
 * is still the real, specific cause -- it just doesn't belong in front of
 * a customer who was never told what a Personal Access Token or an HTTP
 * status code is.
 *
 * Update 23: a real customer still saw the one generic "Vercel could not
 * be reached" message after Update 19's fix -- traced to
 * validateVercelToken collapsing every non-401/403 failure (a genuinely
 * team-less token, a Vercel outage, an unrecognized response shape) into
 * the same raw VERCEL_API_ERROR_404/500/502/503 status codes, all mapped
 * here to one string. client.ts now returns a small, differentiated,
 * real-cause reason set instead -- each gets its own distinct, correct,
 * actionable message.
 *
 * Update 24: a customer then reported this EXACT INVALID_TOKEN message for
 * a token they described as real. Traced end to end (docs/discovery/
 * SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 24): no bug in header
 * construction or trimming (both client and server already trim; the
 * Authorization header is exactly "Bearer <token>") -- Vercel's own API
 * genuinely returns 401/403 for that specific token. This is a real,
 * external fact about that token (expired, revoked, or malformed on
 * Vercel's side), not a defect this codebase can override. Copy below
 * updated to this update's specified exact wording for the token-level
 * failures.
 */
function friendlyVercelConnectError(reason: string | undefined): string {
  switch (reason) {
    case "INVALID_TOKEN":
      return "This Vercel token is not valid. Double-check that you copied the whole token and that it hasn't expired or been revoked.";
    case "TEAM_REQUIRED":
      return "This token does not have access to the required Vercel team. Create a token scoped to the team your site belongs to, then try again.";
    case "PROVIDER_UNAVAILABLE":
      return "Vercel is temporarily unavailable. Please try again in a moment.";
    case "INTERNAL_ERROR":
      return "Something went wrong on our end connecting to Vercel. Please try again.";
    default:
      return "Could not connect to Vercel. Check the token and try again.";
  }
}

/**
 * Update 24: friendly copy for the SEPARATE, non-blocking post-connect
 * diagnostic state (search_website_connections.diagnostic_state) -- a
 * connection with a genuinely valid token that simply hasn't (yet) found
 * a matching project/domain in the connected Vercel account. Per this
 * update's brief, section 9: this must never be shown as, or confused
 * with, a token failure -- the token connected; only the project/domain
 * match is still pending. `websiteHostname` is the tenant's OWN real
 * canonical website (never a hardcoded example domain), so this never
 * shows another tenant's domain.
 */
function friendlyDiagnosticState(state: string | null | undefined, websiteHostname: string | null): string | null {
  switch (state) {
    case "PROJECT_NOT_FOUND":
      return "Token connected. We couldn't find a matching website project in this Vercel account yet.";
    case "DOMAIN_MISMATCH":
      return websiteHostname
        ? `Token connected. None of the projects in this Vercel account contain ${websiteHostname}.`
        : "Token connected. None of the projects in this Vercel account match your website.";
    case "PROJECT_ACCESS_MISSING":
      return "Token connected, but it doesn't have permission to list projects in this Vercel account.";
    case "DOMAIN_NOT_FOUND":
      return "Token connected. We couldn't check this account's project domains right now.";
    case "PROVIDER_ERROR":
      return "Token connected. Vercel was temporarily unavailable while we looked for a matching project -- try Refresh projects in a moment.";
    default:
      return null;
  }
}

interface WebsiteStatus {
  website: { url: string; source: "search_project" | "search_console" } | null;
  detectedPlatform: string | null;
  vercel: {
    state: "NOT_CONNECTED" | "AUTHORIZED" | "READY" | "PROVIDER_ERROR";
    accountName: string | null;
    scope: "ANALYSIS_ONLY" | "AUTONOMOUS_WRITE" | null;
    isHealthy: boolean | null;
    lastVerifiedAt: string | null;
    lastError: string | null;
    diagnosticState: string | null;
    projects: VercelProject[];
  };
}

/**
 * The customer-facing Website connector card (docs/discovery/
 * SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 18) -- surfaces the already
 * real, already-mature Vercel connector backend
 * (packages/search-discovery/src/vercel/) that previously had zero UI.
 * Real Personal Access Token paste flow (not OAuth -- Vercel's own real
 * integration model here, see vercel/types.ts's top comment for why),
 * validated and vaulted server-side; this component never sees the token
 * again after submitting it. Distinguishes analysis access (always
 * available once a website is known) from write access (only once Vercel
 * is actually connected) -- never implies automatic deployment capability
 * that doesn't exist yet.
 */
export function WebsiteConnectorCard({ tenantId }: { tenantId: string }) {
  const [status, setStatus] = useState<WebsiteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [showConnectForm, setShowConnectForm] = useState(false);

  // Update 24: the tenant's OWN real canonical website hostname (never a
  // hardcoded example domain) -- used only to phrase the DOMAIN_MISMATCH
  // diagnostic message with the actual site this connection was checked
  // against.
  let websiteHostname: string | null = null;
  if (status?.website?.url) {
    try {
      websiteHostname = new URL(status.website.url).hostname;
    } catch {
      websiteHostname = null;
    }
  }

  function reload() {
    fetch(`/api/platform/search/website/status?tenantId=${encodeURIComponent(tenantId)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "Could not load website status.");
          return;
        }
        setError(null);
        setStatus(body as WebsiteStatus);
      })
      .catch(() => setError("Could not load website status."));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleConnectVercel() {
    if (!tokenInput.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/platform/search/vercel/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, token: tokenInput.trim(), scope: "AUTONOMOUS_WRITE" }),
      });
      const body = await res.json();
      if (!res.ok) {
        setConnectError(friendlyVercelConnectError(body.reason || body.error));
        return;
      }
      setTokenInput("");
      setShowConnectForm(false);
      reload();
      // Real project/domain discovery immediately after a fresh connect,
      // so the customer sees real projects on first load instead of an
      // empty list until they separately trigger it.
      void fetch("/api/platform/search/vercel/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      }).then(() => reload());
    } catch {
      setConnectError("Network error connecting to Vercel.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    try {
      const res = await fetch("/api/platform/search/vercel/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) reload();
    } finally {
      setDiscovering(false);
    }
  }

  async function handleDisconnect() {
    const confirmed = window.confirm("Disconnect Vercel? Automatic website changes will no longer be available until you reconnect.");
    if (!confirmed) return;
    const res = await fetch("/api/platform/search/vercel/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (res.ok) reload();
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent-muted">
          <PlatformIcon name="website" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-sx-text">Website</p>
          <p className="truncate text-xs text-sx-text-subtle">Your website, detected platform, and automatic-change capability.</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-sx-success/10 px-2.5 py-1">
          <span className="h-[5px] w-[5px] rounded-full bg-sx-success" />
          <span className="text-[11px] font-semibold text-sx-success">
            {status?.website ? "Connected" : "Checking"}
          </span>
        </span>
      </div>

      {error && <p className="mt-3 text-xs text-sx-danger">{error}</p>}

      {status && (
        <div className="mt-3 border-t border-sx-border pt-3 space-y-3">
          {status.website ? (
            <div className="rounded-sx-sm bg-sx-surface-2 p-3">
              <div className="flex items-center gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full bg-sx-success" />
                <span className="text-[11px] font-semibold text-sx-success">
                  {status.website.source === "search_project" ? "Analyzed" : "Detected"}
                </span>
              </div>
              <a href={status.website.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm font-semibold text-sx-accent hover:underline">
                {status.website.url}
              </a>
              <p className="mt-1 text-xs text-sx-text-subtle">
                Detected platform: {status.detectedPlatform ?? "Unknown"}
              </p>
            </div>
          ) : (
            <p className="text-xs text-sx-text-subtle">No website detected yet — connect Search Console or run a Search Growth analysis to detect one.</p>
          )}

          {/* Analysis vs. write-access distinction -- never implies automatic deployment capability that doesn't exist. */}
          <div className="flex items-center justify-between rounded-sx-sm bg-sx-surface-2 px-3 py-2">
            <span className="text-xs text-sx-text-subtle">Website analysis</span>
            <span className="text-[11px] font-semibold text-sx-success">{status.website ? "Ready" : "Not yet"}</span>
          </div>
          <div className="flex items-center justify-between rounded-sx-sm bg-sx-surface-2 px-3 py-2">
            <span className="text-xs text-sx-text-subtle">Automatic website changes</span>
            {status.vercel.state === "READY" ? (
              <span className="text-[11px] font-semibold text-sx-success">Enabled</span>
            ) : status.vercel.state === "AUTHORIZED" ? (
              <span className="text-[11px] font-semibold text-sx-warning">Connected · read-only</span>
            ) : status.vercel.state === "PROVIDER_ERROR" ? (
              <span className="text-[11px] font-semibold text-sx-danger">Connection issue</span>
            ) : (
              <span className="text-[11px] font-semibold text-sx-text-subtle">Connect Vercel</span>
            )}
          </div>

          {/* Vercel connection */}
          <div className="border-t border-sx-border pt-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-sx-text">Vercel</p>
              {status.vercel.state !== "NOT_CONNECTED" ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-sx-success flex items-center gap-1">
                    ✓ Connected
                  </span>
                  {status.vercel.accountName && (
                    <span className="text-[11px] text-sx-text-subtle">({status.vercel.accountName})</span>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-sx-text-subtle">Not connected</span>
              )}
            </div>

            {status.vercel.lastError && (
              <p className="mt-1 text-xs text-sx-danger">{status.vercel.lastError}</p>
            )}

            {/* Update 24: the connection itself succeeded (a genuinely
               valid token) -- this is separate, non-blocking detail about
               whether a matching project/domain was found yet, never
               shown as if the connection had failed. */}
            {status.vercel.state !== "NOT_CONNECTED" && friendlyDiagnosticState(status.vercel.diagnosticState, websiteHostname) && (
              <p className="mt-1 text-xs text-sx-text-subtle">{friendlyDiagnosticState(status.vercel.diagnosticState, websiteHostname)}</p>
            )}

            {status.vercel.projects.length > 0 && (
              <div className="mt-2 space-y-1.5 rounded-sx-sm bg-sx-surface-2 p-2.5">
                {status.vercel.projects.map((p) => {
                  const domainList = Array.isArray(p.domains)
                    ? (p.domains as Array<{ name?: unknown }>).map((d) => String(d.name || "")).filter(Boolean).join(", ")
                    : null;
                  return (
                    <div key={p.projectName} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sx-text">Project: {p.projectName}</span>
                        {p.framework && (
                          <span className="rounded bg-sx-surface-1 px-1.5 py-0.5 text-[10px] font-medium text-sx-text-subtle uppercase">
                            {p.framework}
                          </span>
                        )}
                      </div>
                      {domainList && (
                        <p className="mt-0.5 text-xs text-sx-text-subtle truncate">
                          Domain: {domainList}
                        </p>
                      )}
                      {p.lastDeploymentState && (
                        <p className="mt-0.5 text-[11px] text-sx-text-muted">
                          Deployment: {p.lastDeploymentState}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {showConnectForm ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-sx-text-subtle">
                  Paste a Vercel Personal Access Token (Vercel → Account Settings → Tokens). Any scope works — Full Account, a specific Team, or a specific Project with deployment permissions. We validate and store it securely — it&rsquo;s never shown again.
                </p>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Vercel token"
                  className="w-full rounded-sx-sm border border-sx-border bg-sx-surface-2 p-2.5 text-sm font-mono text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none"
                />
                {connectError && <p className="text-xs text-sx-danger">{connectError}</p>}
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setShowConnectForm(false); setConnectError(null); }}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleConnectVercel} disabled={connecting || !tokenInput.trim()}>
                    {connecting ? "Connecting…" : "Connect Vercel"}
                  </Button>
                </div>
              </div>
            ) : status.vercel.state === "NOT_CONNECTED" ? (
              <Button variant="primary" size="sm" className="mt-3 w-full" onClick={() => setShowConnectForm(true)}>
                Connect Vercel
              </Button>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleDiscover} disabled={discovering}>
                    {discovering ? "Discovering…" : "Refresh projects"}
                  </Button>
                  {status.vercel.state === "AUTHORIZED" && (
                    <Button variant="secondary" size="sm" onClick={() => setShowConnectForm(true)}>
                      Update Token
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="text-sx-danger hover:bg-sx-danger/10" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
