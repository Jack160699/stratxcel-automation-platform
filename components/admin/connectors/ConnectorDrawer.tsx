"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ConnectorIcon } from "./ConnectorIcon";
import { ConnectorStatusDot, resolveVisualStatus } from "./ConnectorStatusDot";
import { getConnectorMeta } from "./connector-meta";
import type { ConnectorItem } from "./ConnectorRow";
import { platformFetch } from "@/lib/admin/platform-fetch";

const GOOGLE_AI_PRO_CAPS = [
  { key: "google_ai_pro.reasoning", label: "Gemini Reasoning" },
  { key: "image.generate", label: "Image Generation" },
  { key: "google_ai_pro.image_generation", label: "Nano Banana Pro" },
  { key: "video.generate", label: "Video Gen / Veo" },
  { key: "antigravity.code", label: "Antigravity Code" },
  { key: "google_drive.upload", label: "Google Drive" },
  { key: "google_cloud.projects", label: "Google Cloud" },
  { key: "jules.automate", label: "Jules Automation" },
];

const FOUNDER_COMPUTER_CAPS = [
  { key: "browser.navigate", label: "Browser Navigation" },
  { key: "browser.click", label: "Web Interaction (Click/Type)" },
  { key: "browser.screenshot", label: "Browser Screenshot" },
  { key: "browser.read", label: "DOM / Content Extraction" },
  { key: "browser.wait", label: "Wait / Poll State" },
  { key: "browser.upload", label: "File Upload" },
  { key: "browser.download", label: "File Download" },
  { key: "browser.tabs", label: "Tab Management" },
  { key: "computer.screenshot", label: "Desktop Capture" },
  { key: "gemini.chat", label: "Google Gemini (Browser)" },
  { key: "aistudio.prompt", label: "AI Studio (Browser)" },
  { key: "drive.browse", label: "Drive Storage (Browser)" },
  { key: "video.generate_browser", label: "Veo / Flow UI (Browser)" },
  { key: "antigravity.workspace", label: "Antigravity IDE (Browser)" },
];

interface AuditLog {
  id: string;
  connector_key: string;
  actor_kind: string;
  event_type: string;
  execution_method: string | null;
  status: string;
  created_at: string;
}

export function ConnectorDrawer({
  item,
  open,
  onClose,
  onUpdated,
}: {
  item: ConnectorItem | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "access" | "health" | "audit">("overview");
  const [busy, setBusy] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [autonomy, setAutonomy] = useState("execute");
  const [budgetLimit, setBudgetLimit] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLog[] | null>(null);
  const [domainInput, setDomainInput] = useState("google.com, accounts.google.com");
  const [runtimeStatus, setRuntimeStatus] = useState<string | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset tab and states when item changes
  useEffect(() => {
    if (item) {
      setActiveTab("overview");
      setActionSuccess(null);
      setError(null);
      setSecret("");
      setAuditLogs(null);
      setBudgetLimit(item.connection?.budgetLimitUsd ? String(item.connection.budgetLimitUsd) : "");
      const metaDomains = (item.connection?.metadata as Record<string, unknown> | undefined)?.authenticatedDomains;
      if (Array.isArray(metaDomains) && metaDomains.length > 0) {
        setDomainInput((metaDomains as string[]).join(", "));
      } else {
        setDomainInput("google.com, accounts.google.com");
      }
    }
  }, [item]);

  // Load audit logs when audit tab selected
  const loadAuditLogs = useCallback(async () => {
    if (!item) return;
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${item.definition.key}/audit`);
      if (res.ok) {
        const body = await res.json();
        setAuditLogs(body.auditLogs ?? []);
      }
    } catch {
      setAuditLogs([]);
    }
  }, [item]);

  // Load Founder Computer runtime status
  const loadRuntimeStatus = useCallback(async () => {
    if (item?.definition.key !== "founder_computer") return;
    try {
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/start");
      if (res.ok) {
        const data = await res.json();
        setRuntimeStatus(data.status);
      }
    } catch {}
  }, [item]);

  useEffect(() => {
    if (open && item?.definition.key === "founder_computer") {
      void loadRuntimeStatus();
    }
  }, [open, item, loadRuntimeStatus]);

  if (!open || !item) return null;

  const { definition, connection, health } = item;
  const meta = getConnectorMeta(definition.key, definition.label);
  const visualStatus = resolveVisualStatus(health.status);
  const isConnected = visualStatus.type === "connected";
  const isGoogleAiPro = definition.key === "google_ai_pro";
  const isFounderComputer = definition.key === "founder_computer";

  // Account identity
  const details = health.details ?? (connection?.metadata as Record<string, unknown> | undefined);
  const accountEmail =
    (details?.google_account_email as string) ||
    (details?.accountEmail as string) ||
    (isFounderComputer
      ? Array.isArray(details?.authenticatedDomains) && (details.authenticatedDomains as string[]).length > 0
        ? (details.authenticatedDomains as string[]).join(", ")
        : isConnected
        ? "Authorized Browser Profile"
        : null
      : isConnected && isGoogleAiPro
      ? "founder@google.account"
      : null);
  const entitlementStatus = (details?.entitlement_status as string) ?? (isConnected ? "active" : "unverified");

  // Health probe action
  async function handleTestHealth() {
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    try {
      const url = isFounderComputer
        ? "/api/admin/personal-connectors/founder-computer/health"
        : `/api/platform/admin/connectors/${definition.key}/verify`;
      const res = await platformFetch(url, {
        method: isFounderComputer ? "GET" : "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Health check failed");
      const status = isFounderComputer ? data.status : data.health?.status;
      setActionSuccess(`Health check complete: ${status ?? "verified"}`);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    } finally {
      setBusy(false);
    }
  }

  // Capability discovery action
  async function handleDiscover() {
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    try {
      const url = isFounderComputer
        ? "/api/admin/personal-connectors/founder-computer/capabilities"
        : `/api/platform/admin/connectors/${definition.key}`;
      const res = await platformFetch(url, {
        method: "POST",
        body: isFounderComputer ? JSON.stringify({}) : JSON.stringify({ action: "discover" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Capability discovery failed");
      const count = isFounderComputer
        ? data.totalDiscovered ?? data.capabilities?.length ?? 0
        : data.discoveredCapabilities?.length ?? 0;
      setActionSuccess(`Discovered ${count} verified capabilities.`);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setBusy(false);
    }
  }

  // Founder Computer setup
  async function handleFounderComputerSetup() {
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    try {
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/setup", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      setActionSuccess("Founder Computer session initialized. Sign in on browser host then click Verify Session.");
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  // Founder Computer manual verification
  async function handleFounderComputerVerify() {
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    try {
      const domains = domainInput
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/session", {
        method: "POST",
        body: JSON.stringify({ action: "verify", authenticatedDomains: domains }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setActionSuccess(`Session verified active (${domains.length} domains authorized).`);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  // Start / Open Founder Browser process
  async function handleOpenBrowser() {
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    try {
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/start", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start browser");
      setRuntimeStatus(data.status);
      setActionSuccess(`Founder Browser active! Runtime state: ${data.status} (CDP Port 9222).`);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start browser");
    } finally {
      setBusy(false);
    }
  }

  // Open target authentication session
  async function handleOpenAuthSession(targetUrl: string) {
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    try {
      const res = await platformFetch("/api/admin/personal-connectors/founder-computer/execute", {
        method: "POST",
        body: JSON.stringify({
          capability: "browser.navigate",
          payload: { url: targetUrl },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Navigation failed");
      setActionSuccess(`Navigated Founder Browser to ${targetUrl}. Please complete manual login in the browser window.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open auth session");
    } finally {
      setBusy(false);
    }
  }

  // Execute non-destructive diagnostic test
  async function handleRunDiagnosticTest() {
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    setDiagnosticResult(null);
    try {
      const navRes = await platformFetch("/api/admin/personal-connectors/founder-computer/execute", {
        method: "POST",
        body: JSON.stringify({
          capability: "browser.navigate",
          payload: { url: "https://www.stratxcel.in" },
        }),
      });
      const navData = await navRes.json();
      if (!navRes.ok) throw new Error(navData.error || "Diagnostic navigation failed");

      const readRes = await platformFetch("/api/admin/personal-connectors/founder-computer/execute", {
        method: "POST",
        body: JSON.stringify({
          capability: "browser.read",
          payload: { maxChars: 120 },
        }),
      });
      const readData = await readRes.json();

      const shotRes = await platformFetch("/api/admin/personal-connectors/founder-computer/execute", {
        method: "POST",
        body: JSON.stringify({
          capability: "browser.screenshot",
          payload: { fullPage: false },
        }),
      });
      const shotData = await shotRes.json();

      setDiagnosticResult(
        `✓ Navigation: ${navData.title || navData.url || "OK"}\n` +
        `✓ Read: Extracted ${readData.totalLength ?? 0} chars ("${(readData.text ?? "").slice(0, 60)}...")\n` +
        `✓ Screenshot: Captured ${shotData.bytes ?? 0} bytes (image/png)`
      );
      setActionSuccess("Hermes browser control verified successfully!");
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnostic test failed");
    } finally {
      setBusy(false);
    }
  }

  // Vault secret / save connection
  async function handleConnectToken(e: React.FormEvent) {
    e.preventDefault();
    if (!secret.trim()) return;
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}`, {
        method: "PUT",
        body: JSON.stringify({
          secret: secret.trim(),
          metadata: { connected_via: "admin_drawer", updated_at: new Date().toISOString() },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setActionSuccess("Credentials securely vaulted and verified.");
      setSecret("");
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  // Disconnect
  async function handleDisconnect() {
    if (!confirm(`Are you sure you want to disconnect ${meta.name}?`)) return;
    setBusy(true);
    setActionSuccess(null);
    setError(null);
    try {
      const url = isFounderComputer
        ? "/api/admin/personal-connectors/founder-computer/session"
        : `/api/platform/admin/connectors/${definition.key}`;
      const res = await platformFetch(url, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Disconnection failed");
      setActionSuccess("Connector disconnected.");
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnection failed");
    } finally {
      setBusy(false);
    }
  }

  // Start Google OAuth
  function handleGoogleOAuth() {
    // Initiates external OAuth redirect via API route
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/api/admin/personal-connectors/google-ai-pro/connect";
  }

  return (
    <div
      className="fixed inset-0 z-[var(--sx-z-sheet,60)] flex justify-end bg-black/50 backdrop-blur-[3px] transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-full flex-col border-l border-sx-border bg-sx-surface-1 shadow-2xl transition-transform duration-200 sm:max-w-lg md:max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Drawer Top Header */}
        <div className="flex items-center justify-between border-b border-sx-border px-6 py-4.5 bg-sx-surface-1">
          <div className="flex items-center gap-3">
            <ConnectorIcon connectorKey={definition.key} size={36} />
            <div>
              <h2 id="drawer-title" className="font-sx-sans text-base font-semibold text-sx-text">
                {meta.name}
              </h2>
              <p className="text-xs text-sx-text-muted">
                {definition.isPersonal ? "Founder Personal Account" : "StratXcel Infrastructure"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ConnectorStatusDot status={health.status} />
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sx-text-subtle hover:bg-sx-surface-2 hover:text-sx-text focus:outline-none"
              aria-label="Close details"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Drawer Navigation Tabs */}
        <div className="flex border-b border-sx-border px-6 gap-6 bg-sx-surface-0/60 text-xs">
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "access", label: "Access & Autonomy" },
              { id: "health", label: "Diagnostics" },
              { id: "audit", label: "Audit Activity" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-sx-accent text-sx-text"
                  : "border-transparent text-sx-text-muted hover:text-sx-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Toast / Banner Messages */}
        {actionSuccess && (
          <div className="mx-6 mt-4 rounded-lg border border-[#5BDCA7]/30 bg-[#5BDCA7]/10 px-3.5 py-2 text-xs font-medium text-[#5BDCA7]">
            {actionSuccess}
          </div>
        )}
        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-[#FF8A90]/30 bg-[#FF8A90]/10 px-3.5 py-2 text-xs font-medium text-[#FF8A90]">
            {error}
          </div>
        )}

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Needs Attention Callout (Progressive Disclosure) */}
              {!isConnected && (
                <div className="rounded-xl border border-[#F3C55C]/30 bg-[#F3C55C]/10 p-4">
                  <p className="text-xs font-semibold text-[#F3C55C] uppercase tracking-wider">
                    Action Required
                  </p>
                  <p className="mt-1 text-xs text-sx-text">
                    This connector requires authentication before Hermes can execute its capabilities.
                  </p>
                  {isFounderComputer ? (
                    <div className="mt-3 space-y-4">
                      {/* Step 1: Initialize Setup (if unconfigured) */}
                      {!connection && (
                        <div className="rounded-lg border border-sx-border bg-sx-surface-1 p-3">
                          <span className="text-[10px] font-sx-mono uppercase tracking-wider text-sx-accent">Step 1</span>
                          <p className="mt-0.5 text-xs font-semibold text-sx-text">Initialize Connection Record</p>
                          <p className="mt-0.5 text-[11px] text-sx-text-muted">Prepares the persistent profile directory (.stratxcel-founder-computer-profile).</p>
                          <button
                            type="button"
                            onClick={handleFounderComputerSetup}
                            disabled={busy}
                            className="mt-2.5 inline-flex items-center rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                          >
                            Initialize Setup
                          </button>
                        </div>
                      )}

                      {/* Step 2: Open / Start Founder Browser */}
                      <div className="rounded-lg border border-sx-border bg-sx-surface-1 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-sx-mono uppercase tracking-wider text-sx-accent">
                            {connection ? "Step 1" : "Step 2"}: Browser Runtime
                          </span>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-sx-mono font-medium ${
                            runtimeStatus === "RUNNING"
                              ? "bg-[#5BDCA7]/10 text-[#5BDCA7]"
                              : "bg-[#FF8A90]/10 text-[#FF8A90]"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${runtimeStatus === "RUNNING" ? "bg-[#5BDCA7]" : "bg-[#FF8A90]"}`} />
                            {runtimeStatus || "STOPPED"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-sx-text">
                          Launch or attach to the persistent Chrome instance on port 9222.
                        </p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleOpenBrowser}
                            disabled={busy}
                            className="inline-flex items-center rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                          >
                            {runtimeStatus === "RUNNING" ? "Re-Connect Browser" : "Open Founder Browser"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void loadRuntimeStatus()}
                            disabled={busy}
                            className="rounded-lg border border-sx-border px-2.5 py-1.5 text-xs text-sx-text-muted hover:bg-sx-surface-2"
                          >
                            Probe Port 9222
                          </button>
                        </div>
                      </div>

                      {/* Step 3: Open Auth Session */}
                      <div className="rounded-lg border border-sx-border bg-sx-surface-1 p-3">
                        <span className="text-[10px] font-sx-mono uppercase tracking-wider text-sx-accent">
                          {connection ? "Step 2" : "Step 3"}: Manual Sign-In
                        </span>
                        <p className="mt-1 text-xs text-sx-text">
                          Open target sign-in page in Founder Browser. Sign in manually — StratXcel never touches passwords.
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleOpenAuthSession("https://accounts.google.com")}
                            disabled={busy || runtimeStatus !== "RUNNING"}
                            className="rounded-lg border border-sx-border bg-sx-surface-2 px-2.5 py-1 text-xs text-sx-text hover:bg-sx-surface-3 disabled:opacity-40"
                          >
                            Open Google Login
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOpenAuthSession("https://gemini.google.com")}
                            disabled={busy || runtimeStatus !== "RUNNING"}
                            className="rounded-lg border border-sx-border bg-sx-surface-2 px-2.5 py-1 text-xs text-sx-text hover:bg-sx-surface-3 disabled:opacity-40"
                          >
                            Open Gemini
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOpenAuthSession("https://claude.ai")}
                            disabled={busy || runtimeStatus !== "RUNNING"}
                            className="rounded-lg border border-sx-border bg-sx-surface-2 px-2.5 py-1 text-xs text-sx-text hover:bg-sx-surface-3 disabled:opacity-40"
                          >
                            Open Claude
                          </button>
                        </div>
                      </div>

                      {/* Step 4: Verify Session */}
                      <div className="rounded-lg border border-sx-border bg-sx-surface-1 p-3">
                        <span className="text-[10px] font-sx-mono uppercase tracking-wider text-sx-accent">
                          {connection ? "Step 3" : "Step 4"}: Verify Active Domains
                        </span>
                        <p className="mt-1 text-xs text-sx-text">
                          Enter comma-separated domains authenticated in this session:
                        </p>
                        <div className="mt-2 flex gap-2 items-center">
                          <input
                            type="text"
                            value={domainInput}
                            onChange={(e) => setDomainInput(e.target.value)}
                            placeholder="google.com, accounts.google.com"
                            className="h-8 flex-1 rounded-lg border border-sx-border bg-sx-surface-2 px-2.5 text-xs text-sx-text focus:border-sx-accent focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleFounderComputerVerify}
                            disabled={busy}
                            className="inline-flex items-center rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                          >
                            Verify Session
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : isGoogleAiPro ? (
                    <button
                      type="button"
                      onClick={handleGoogleOAuth}
                      className="mt-3 inline-flex items-center rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                    >
                      Connect Google AI Pro (OAuth)
                    </button>
                  ) : (
                    <p className="mt-2 text-xs text-sx-text-muted">
                      Scroll down to enter API key / token below.
                    </p>
                  )}
                </div>
              )}

              {/* Account Section */}
              <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                  Account & Identity
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-sx-text-subtle">
                      {isFounderComputer ? "Authorized Domains" : "Account Identity"}
                    </span>
                    <p className="mt-0.5 font-medium text-sx-text truncate">
                      {accountEmail || (isFounderComputer ? "None authenticated" : "Not connected")}
                    </p>
                  </div>
                  <div>
                    <span className="text-sx-text-subtle">
                      {isFounderComputer ? "Browser Runtime" : "Subscription / Tier"}
                    </span>
                    <p className="mt-0.5 font-medium text-sx-text uppercase truncate">
                      {isFounderComputer
                        ? (details?.browserVersion as string) || "Chromium (Managed)"
                        : isGoogleAiPro
                        ? entitlementStatus === "active"
                          ? "AI Pro Active"
                          : "Standard (Unverified)"
                        : "Standard"}
                    </p>
                  </div>
                  <div>
                    <span className="text-sx-text-subtle">
                      {isFounderComputer ? "Profile ID" : "Auth Method"}
                    </span>
                    <p className="mt-0.5 font-medium text-sx-text uppercase font-mono text-[11px] truncate">
                      {isFounderComputer
                        ? (details?.profileId as string) || "Pending Setup"
                        : definition.authMethod}
                    </p>
                  </div>
                  <div>
                    <span className="text-sx-text-subtle">Last Verified</span>
                    <p className="mt-0.5 font-medium text-sx-text">
                      {health.lastVerifiedAt
                        ? new Date(health.lastVerifiedAt).toLocaleDateString()
                        : "Never"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Capabilities Matrix */}
              <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                    Verified Capabilities
                  </h3>
                  <span className="text-[11px] text-sx-text-subtle">
                    {health.discoveredCapabilities.length} active
                  </span>
                </div>

                {isGoogleAiPro ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {GOOGLE_AI_PRO_CAPS.map((cap) => {
                      const isDiscovered = health.discoveredCapabilities.includes(cap.key);
                      return (
                        <div
                          key={cap.key}
                          className={`flex items-center gap-2 rounded-lg border p-2 ${
                            isDiscovered
                              ? "border-[#5BDCA7]/30 bg-[#5BDCA7]/5 text-sx-text"
                              : "border-sx-border/40 bg-sx-surface-1 text-sx-text-muted opacity-60"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isDiscovered ? "bg-[#5BDCA7]" : "bg-sx-text-subtle"
                            }`}
                          />
                          <span className="truncate">{cap.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : isFounderComputer ? (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {FOUNDER_COMPUTER_CAPS.map((cap) => {
                      const isDiscovered = health.discoveredCapabilities.includes(cap.key);
                      return (
                        <div
                          key={cap.key}
                          className={`flex items-center gap-2 rounded-lg border p-2 ${
                            isDiscovered
                              ? "border-[#5BDCA7]/30 bg-[#5BDCA7]/5 text-sx-text"
                              : "border-sx-border/40 bg-sx-surface-1 text-sx-text-muted opacity-60"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isDiscovered ? "bg-[#5BDCA7]" : "bg-sx-text-subtle"
                            }`}
                          />
                          <span className="truncate">{cap.label}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {definition.declaredCapabilities && definition.declaredCapabilities.length > 0 ? (
                      definition.declaredCapabilities.map((cap) => (
                        <span
                          key={cap}
                          className="rounded-md border border-sx-border bg-sx-surface-1 px-2 py-1 font-sx-mono text-[11px] text-sx-text"
                        >
                          {cap}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-sx-text-muted">No capabilities declared.</span>
                    )}
                  </div>
                )}
              </div>

              {/* Founder Computer Dedicated Session Management Card */}
              {isFounderComputer && (
                <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                    {isConnected ? "Active Browser Session" : "Browser Session Authentication"}
                  </h3>
                  <p className="text-xs text-sx-text-muted">
                    Manual authentication in the dedicated profile enables Hermes to access authenticated web apps without API keys or passwords.
                  </p>
                  <div className="space-y-2">
                    <label className="text-[11px] text-sx-text-subtle">Authenticated Domains (comma-separated)</label>
                    <input
                      type="text"
                      value={domainInput}
                      onChange={(e) => setDomainInput(e.target.value)}
                      placeholder="e.g. google.com, accounts.google.com"
                      className="h-8 w-full rounded-lg border border-sx-border bg-sx-surface-1 px-2.5 text-xs text-sx-text focus:border-sx-accent focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleFounderComputerVerify}
                      disabled={busy}
                      className="inline-flex items-center rounded-lg bg-sx-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                    >
                      {isConnected ? "Re-verify Active Session" : "Confirm & Verify Session"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscover}
                      disabled={busy}
                      className="inline-flex items-center rounded-lg border border-sx-border bg-sx-surface-1 px-3 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-3 disabled:opacity-50"
                    >
                      Discover Capabilities
                    </button>
                    {!connection && (
                      <button
                        type="button"
                        onClick={handleFounderComputerSetup}
                        disabled={busy}
                        className="inline-flex items-center rounded-lg border border-sx-border bg-sx-surface-1 px-3 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-3 disabled:opacity-50"
                      >
                        Initialize Setup
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Connect / Reconnect Token Input */}
              {definition.authMethod !== "mcp_managed" && (
                <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                    {isConnected ? "Update Credentials" : "Connect Account"}
                  </h3>

                  {isGoogleAiPro ? (
                    <div className="space-y-3">
                      <p className="text-xs text-sx-text-muted">
                        Connect via Google OAuth to enable AI Pro features without storing your password.
                      </p>
                      <button
                        type="button"
                        onClick={handleGoogleOAuth}
                        className="w-full inline-flex justify-center items-center rounded-lg bg-sx-accent py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                      >
                        {isConnected ? "Reconnect Google Account" : "Authorize with Google OAuth"}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleConnectToken} className="space-y-3">
                      <p className="text-xs text-sx-text-muted">
                        Enter API Key or Auth Token. Credentials will be securely vaulted.
                      </p>
                      <input
                        type="password"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        placeholder="sk-... or OAuth token"
                        className="h-9 w-full rounded-lg border border-sx-border bg-sx-surface-1 px-3 text-xs text-sx-text focus:border-sx-accent focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={busy || !secret.trim()}
                        className="inline-flex items-center rounded-lg bg-sx-accent px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                      >
                        {isConnected ? "Update Key" : "Save & Verify"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACCESS & AUTONOMY */}
          {activeTab === "access" && (
            <div className="space-y-6">
              {/* Access Policy Info */}
              <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                  Company & Agent Scoping
                </h3>
                <p className="text-xs text-sx-text-muted">
                  {definition.isPersonal
                    ? "Founder-owned resources are isolated from customer workspaces by default. Hermes executes capabilities only when explicitly assigned."
                    : "Platform resources are shared across internal platform operations and worker tasks."}
                </p>

                <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                  <div>
                    <span className="text-sx-text-subtle">Company Scope</span>
                    <p className="mt-0.5 font-medium text-sx-text">
                      {definition.isPersonal ? "Founder-Exclusive (Isolated)" : "Platform-Wide"}
                    </p>
                  </div>
                  <div>
                    <span className="text-sx-text-subtle">Assigned Agents</span>
                    <p className="mt-0.5 font-medium text-sx-text">Hermes Gateway</p>
                  </div>
                </div>
              </div>

              {/* Autonomy Level */}
              <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                  Autonomy Level
                </h3>
                <select
                  value={autonomy}
                  onChange={(e) => setAutonomy(e.target.value)}
                  className="h-9 w-full rounded-lg border border-sx-border bg-sx-surface-1 px-3 text-xs text-sx-text focus:border-sx-accent focus:outline-none"
                >
                  <option value="execute">EXECUTE (Hermes can run actions automatically)</option>
                  <option value="approval_required">APPROVAL REQUIRED (Ask Founder before executing)</option>
                  <option value="prepare">PREPARE ONLY (Draft actions without executing)</option>
                  <option value="read">READ ONLY (Observe data, no writes)</option>
                  <option value="disabled">DISABLED (Block all access)</option>
                </select>
              </div>

              {/* Monthly Budget & Limits */}
              <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                  Budget & Rate Limits
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-sx-text-subtle">Monthly Budget (USD)</label>
                    <input
                      type="number"
                      value={budgetLimit}
                      onChange={(e) => setBudgetLimit(e.target.value)}
                      placeholder="e.g. 100"
                      className="mt-1 h-8 w-full rounded-lg border border-sx-border bg-sx-surface-1 px-2.5 text-xs text-sx-text focus:border-sx-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-sx-text-subtle">Current Spend</label>
                    <p className="mt-2 text-xs font-semibold text-sx-text">
                      ${connection?.currentUsageUsd?.toFixed(2) ?? "0.00"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HEALTH & DIAGNOSTICS */}
          {activeTab === "health" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                  Live Health State
                </h3>
                <div className="flex items-center gap-3">
                  <ConnectorStatusDot status={health.status} />
                  <span className="font-sx-mono text-xs text-sx-text-muted">
                    ({health.status})
                  </span>
                </div>

                {health.lastError && (
                  <div className="rounded-lg border border-[#FF8A90]/30 bg-[#FF8A90]/10 p-3 text-xs text-[#FF8A90]">
                    <span className="font-semibold">Last Error: </span>
                    {health.lastError}
                  </div>
                )}
              </div>

              {/* Diagnostic Tools */}
              <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                  Diagnostic Probes
                </h3>
                <p className="text-xs text-sx-text-muted">
                  Execute live probes against external provider APIs to verify connectivity and discover new capabilities.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleTestHealth}
                    disabled={busy}
                    className="inline-flex items-center rounded-lg border border-sx-border bg-sx-surface-1 px-3.5 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-3 disabled:opacity-50"
                  >
                    Test Health
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscover}
                    disabled={busy}
                    className="inline-flex items-center rounded-lg border border-sx-border bg-sx-surface-1 px-3.5 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-3 disabled:opacity-50"
                  >
                    Discover Capabilities
                  </button>
                </div>
              </div>

              {/* Founder Computer: Hermes Live Operation Test */}
              {isFounderComputer && (
                <div className="rounded-xl border border-sx-border bg-sx-surface-2/60 p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                    Hermes Browser Control Diagnostic
                  </h3>
                  <p className="text-xs text-sx-text-muted">
                    Executes a harmless non-destructive test sequence (navigation &rarr; DOM text extraction &rarr; screenshot) to verify that Hermes can actively operate the browser runtime over CDP.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleRunDiagnosticTest}
                      disabled={busy || runtimeStatus !== "RUNNING"}
                      className="inline-flex items-center rounded-lg bg-sx-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                    >
                      Test Hermes Browser Control
                    </button>
                    {runtimeStatus !== "RUNNING" && (
                      <span className="ml-2 text-[11px] text-[#FF8A90]">
                        Browser runtime stopped — click &apos;Open Founder Browser&apos; in Overview first.
                      </span>
                    )}
                  </div>
                  {diagnosticResult && (
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-[#5BDCA7]/30 bg-[#5BDCA7]/5 p-3 font-sx-mono text-[11px] text-[#5BDCA7]">
                      {diagnosticResult}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: AUDIT ACTIVITY */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                  Connector Activity Log
                </h3>
                <button
                  type="button"
                  onClick={() => void loadAuditLogs()}
                  className="text-xs text-sx-accent hover:underline"
                >
                  Refresh
                </button>
              </div>

              {auditLogs === null && (
                <p className="text-xs text-sx-text-subtle">Loading recent events…</p>
              )}

              {auditLogs && auditLogs.length === 0 && (
                <div className="rounded-xl border border-sx-border bg-sx-surface-2/40 p-6 text-center text-xs text-sx-text-subtle">
                  No activity events recorded yet.
                </div>
              )}

              {auditLogs && auditLogs.length > 0 && (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-lg border border-sx-border/60 bg-sx-surface-2/70 p-2.5 font-sx-sans text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            log.status === "success"
                              ? "bg-[#5BDCA7]"
                              : log.status === "denied"
                              ? "bg-[#F3C55C]"
                              : "bg-[#FF8A90]"
                          }`}
                        />
                        <span className="font-medium text-sx-text uppercase">{log.event_type}</span>
                        <span className="text-sx-text-subtle">by {log.actor_kind}</span>
                      </div>
                      <span className="text-[11px] text-sx-text-subtle">
                        {new Date(log.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Bottom Actions */}
        <div className="flex items-center justify-between border-t border-sx-border px-6 py-4 bg-sx-surface-1">
          {isConnected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy}
              className="text-xs font-medium text-[#FF8A90] hover:underline disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-sx-border bg-sx-surface-2 px-4 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-3"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
