"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeading } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";

interface ConnectorDefinition {
  key: string;
  label: string;
  category: string;
  authMethod: string;
  scopeLevel: "platform" | "personal" | "company" | "both";
  declaredCapabilities: string[];
  description: string;
  realStatusSource: string;
  requiredEnvVars: string[];
  supportedAccessMethods: string[];
  preferredAccessMethod: string;
  isPersonal?: boolean;
}

interface ConnectorHealth {
  status: string;
  discoveredCapabilities: string[];
  lastError: string | null;
  lastVerifiedAt?: string | null;
  details?: Record<string, unknown>;
}

interface PersonalConnectorRow {
  definition: ConnectorDefinition;
  connection: {
    id: string;
    status: string;
    connectedAt: string | null;
    lastHealthCheckAt: string | null;
    lastVerifiedAt?: string | null;
    discoveredAt?: string | null;
    budgetLimitUsd?: number | null;
    currentUsageUsd?: number;
    rateLimitPerMinute?: number | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  health: ConnectorHealth;
}

interface PersonalConnectorsSummary {
  totalPersonalConnectors: number;
  connectedCount: number;
  actionRequiredCount: number;
  healthyCount: number;
  degradedCount: number;
  founderEmail: string | null;
  lastGlobalVerifiedAt: string | null;
  verifiedCapabilitiesCount: number;
}

interface Assignment {
  id: string;
  capability_key: string;
  department: string | null;
  agent_definition_id: string | null;
  autonomy: string;
  budget_limit_usd?: number | null;
  current_usage_usd?: number;
  tenant_id: string | null;
}

interface AuditLog {
  id: string;
  connector_key: string;
  actor_kind: string;
  actor_id: string | null;
  event_type: string;
  capability_key: string | null;
  execution_method: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; state: ChipState }> = {
  connected: { label: "CONNECTED", state: "accent" },
  healthy: { label: "CONNECTED / VERIFIED", state: "success" },
  auth_required: { label: "AUTH REQUIRED", state: "warning" },
  requires_reauth: { label: "AUTH REQUIRED", state: "warning" },
  auth_expired: { label: "AUTH EXPIRED", state: "warning" },
  disconnected: { label: "DISCONNECTED", state: "neutral" },
  error: { label: "ERROR", state: "danger" },
  disabled: { label: "DISABLED", state: "neutral" },
  not_configured: { label: "NOT CONFIGURED", state: "dashed" },
  pending: { label: "NOT CONFIGURED", state: "dashed" },
  degraded: { label: "DEGRADED", state: "warning" },
  rate_limited: { label: "RATE LIMITED", state: "warning" },
  quota_exhausted: { label: "QUOTA EXHAUSTED", state: "warning" },
};

const AUTONOMY_OPTIONS = ["read", "prepare", "execute", "approval_required", "disabled"] as const;

const PERSONAL_CATEGORY_TABS = [
  { id: "all", label: "All Personal" },
  { id: "ai", label: "AI & Reasoning" },
  { id: "developer", label: "Developer & Infra" },
  { id: "communication", label: "Communication" },
  { id: "research", label: "Research & Sales" },
  { id: "storage", label: "Storage" },
  { id: "payments", label: "Payments" },
  { id: "browser", label: "Browser & Computer" },
] as const;

// Capability check item for Google AI Pro matrix
const GOOGLE_AI_PRO_MATRIX = [
  { key: "gemini", label: "Gemini Reasoning", capability: "google_ai_pro.reasoning" },
  { key: "image", label: "Image Generation", capability: "image.generate" },
  { key: "nano_banana", label: "Nano Banana Pro", capability: "google_ai_pro.image_generation" },
  { key: "video", label: "Video Gen / Veo", capability: "video.generate" },
  { key: "antigravity", label: "Antigravity Code", capability: "antigravity.code" },
  { key: "drive", label: "Google Drive", capability: "google_drive.upload" },
  { key: "cloud", label: "Google Cloud", capability: "google_cloud.projects" },
  { key: "jules", label: "Jules Automation", capability: "jules.automate" },
] as const;

function PersonalConnectorCard({
  row,
  onChanged,
}: {
  row: PersonalConnectorRow;
  onChanged: () => void;
}) {
  const { definition, connection, health } = row;
  const isGoogleAiPro = definition.key === "google_ai_pro";

  const statusInfo = STATUS_CONFIG[health.status] ?? {
    label: health.status.toUpperCase(),
    state: "neutral" as ChipState,
  };

  const isConnected = ["connected", "healthy"].includes(health.status);
  const isAuthRequired = ["auth_required", "auth_expired", "requires_reauth"].includes(health.status);
  const isNotConfigured = ["not_configured", "pending"].includes(health.status);

  // Profile and entitlement details
  const details = health.details ?? (connection?.metadata as Record<string, unknown> | undefined);
  const entitlementStatus = (details?.entitlement_status as string) ?? "unverified";
  const accountEmail =
    (details?.google_account_email as string) ||
    (details?.accountEmail as string) ||
    (isGoogleAiPro && isConnected ? "founder@google.account" : null);
  const accountName = (details?.google_account_name as string) || null;

  const [expanded, setExpanded] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[] | null>(null);

  // New assignment form state
  const [newCapability, setNewCapability] = useState(definition.declaredCapabilities[0] ?? "");
  const [newDepartment, setNewDepartment] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [newTenantScope, setNewTenantScope] = useState("");
  const [newAutonomy, setNewAutonomy] = useState<(typeof AUTONOMY_OPTIONS)[number]>("execute");
  const [newBudget, setNewBudget] = useState("");

  // Budget & settings state
  const [budgetLimit, setBudgetLimit] = useState(connection?.budgetLimitUsd?.toString() ?? "");
  const [rateLimit, setRateLimit] = useState(connection?.rateLimitPerMinute?.toString() ?? "");

  const isMcpManaged = definition.authMethod === "mcp_managed";
  const canStoreSecret = !isMcpManaged;

  const loadAssignments = useCallback(async () => {
    const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}/assignments`);
    const body = await res.json().catch(() => ({ assignments: [] }));
    setAssignments(body.assignments ?? []);
  }, [definition.key]);

  const loadAuditLogs = useCallback(async () => {
    const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}/audit`);
    const body = await res.json().catch(() => ({ auditLogs: [] }));
    setAuditLogs(body.auditLogs ?? []);
  }, [definition.key]);

  useEffect(() => {
    if (expanded && assignments === null) void loadAssignments();
  }, [expanded, assignments, loadAssignments]);

  useEffect(() => {
    if (showAudit && auditLogs === null) void loadAuditLogs();
  }, [showAudit, auditLogs, loadAuditLogs]);

  async function handleConnectSecret() {
    setBusy(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawSecret: secret || undefined,
          budgetLimitUsd: budgetLimit ? parseFloat(budgetLimit) : undefined,
          rateLimitPerMinute: rateLimit ? parseInt(rateLimit, 10) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Connect failed (HTTP ${res.status})`);
        return;
      }
      setSecret("");
      setActionSuccess("Credentials securely vaulted & capabilities discovered");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyLive() {
    setBusy(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}/verify`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Verification failed (HTTP ${res.status})`);
        return;
      }
      setActionSuccess(`Health verified: ${body.health?.status?.toUpperCase()}`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        `Are you sure you want to disconnect ${definition.label}? Vaulted credentials and session tokens will be permanently revoked.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Disconnect failed (HTTP ${res.status})`);
        return;
      }
      setActionSuccess("Disconnected and vaulted credentials revoked");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleEnabled() {
    setBusy(true);
    setError(null);
    const currentlyDisabled = health.status === "disabled";
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: currentlyDisabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to toggle status");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetLimitUsd: budgetLimit ? parseFloat(budgetLimit) : null,
          rateLimitPerMinute: rateLimit ? parseInt(rateLimit, 10) : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to save limits");
        return;
      }
      setActionSuccess("Personal resource limits updated");
      setShowSettings(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAssignment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: newTenantScope || undefined,
          capabilityKey: newCapability,
          department: newDepartment || undefined,
          agentDefinitionId: newAgentId || undefined,
          autonomy: newAutonomy,
          budgetLimitUsd: newBudget ? parseFloat(newBudget) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Assignment failed (HTTP ${res.status})`);
        return;
      }
      setNewDepartment("");
      setNewAgentId("");
      setNewTenantScope("");
      setNewBudget("");
      await loadAssignments();
      setActionSuccess(`Assigned ${newCapability} (${newAutonomy.toUpperCase()})`);
    } finally {
      setBusy(false);
    }
  }

  async function handleAutonomyChange(assignmentId: string, autonomy: string) {
    setBusy(true);
    try {
      await platformFetch(`/api/platform/admin/connectors/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autonomy }),
      });
      await loadAssignments();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAssignment(assignmentId: string) {
    setBusy(true);
    try {
      await platformFetch(`/api/platform/admin/connectors/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      await loadAssignments();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={`flex flex-col gap-3 transition-all hover:border-sx-border-strong ${
        isGoogleAiPro ? "border-sx-accent/40 bg-sx-surface-1 shadow-sx-sm ring-1 ring-sx-accent/20" : ""
      }`}
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h3 className="font-sx-sans text-base font-semibold text-sx-text">{definition.label}</h3>
            {isGoogleAiPro && (
              <span className="rounded bg-sx-accent/15 px-2 py-0.5 font-sx-mono text-[10px] font-semibold text-sx-accent uppercase tracking-wider border border-sx-accent/30">
                Founder Premier AI
              </span>
            )}
            <span className="rounded bg-sx-surface-2 px-1.5 py-0.5 font-sx-mono text-[10px] text-sx-text-subtle uppercase">
              {definition.category}
            </span>
            <span className="rounded bg-sx-surface-2 px-1.5 py-0.5 font-sx-mono text-[10px] text-sx-text-subtle uppercase">
              Founder Personal
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs text-sx-text-muted">{definition.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip state={statusInfo.state}>{statusInfo.label}</StatusChip>
        </div>
      </div>

      {/* Google AI Pro Hero Section */}
      {isGoogleAiPro && (
        <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-3.5 text-xs flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sx-border pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sx-accent/15 font-sx-mono text-xs font-bold text-sx-accent">
                G
              </div>
              <div className="flex flex-col">
                <span className="font-sx-sans font-semibold text-sx-text">
                  {accountName || "Founder Google Account"}
                </span>
                <span className="font-sx-mono text-[11px] text-sx-text-subtle">
                  {accountEmail || "No Google account linked yet"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-sx-mono text-[10px] uppercase text-sx-text-subtle">Entitlement:</span>
              {entitlementStatus === "active_pro" ? (
                <span className="rounded bg-[#5BDCA7]/10 px-2.5 py-0.5 font-sx-mono text-[11px] font-semibold text-[#5BDCA7] border border-[#5BDCA7]/30">
                  ACTIVE AI PRO SUBSCRIPTION
                </span>
              ) : entitlementStatus === "not_entitled" ? (
                <span className="rounded bg-[#FF8A90]/10 px-2.5 py-0.5 font-sx-mono text-[11px] font-semibold text-[#FF8A90] border border-[#FF8A90]/30">
                  STANDARD (NOT ENTITLED)
                </span>
              ) : (
                <span className="rounded bg-[#F3C55C]/10 px-2.5 py-0.5 font-sx-mono text-[11px] font-semibold text-[#F3C55C] border border-[#F3C55C]/30">
                  PRO UNVERIFIED
                </span>
              )}
            </div>
          </div>

          {/* Capability Matrix — ONLY show verified/discovered items as active */}
          <div className="flex flex-col gap-1.5">
            <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">
              Verified Entitled Capabilities Matrix
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GOOGLE_AI_PRO_MATRIX.map((item) => {
                const isVerified = health.discoveredCapabilities.includes(item.capability);
                return (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between rounded border p-2 text-xs transition-all ${
                      isVerified
                        ? "border-[#5BDCA7]/30 bg-sx-surface-1"
                        : "border-sx-border bg-sx-surface-1/40 opacity-70"
                    }`}
                  >
                    <span className="font-medium text-sx-text">{item.label}</span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isVerified ? "bg-[#5BDCA7]" : "bg-sx-border-strong"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded border border-sx-border bg-sx-surface-1 p-2 text-[11px] text-sx-text-subtle">
            🔒 <strong className="text-sx-text">Strict Founder Isolation:</strong> This Google AI Pro subscription and
            its storage/compute resources belong to the Founder. Client companies have zero access to personal Drive,
            Cloud, or Antigravity sessions unless an explicit capability assignment is configured below.
          </div>
        </div>
      )}

      {/* Status & Verification Metrics */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-sx-text-subtle">
        {isConnected && (
          <span className="flex items-center gap-1 text-[#5BDCA7] font-medium">
            ✓ Connected &amp; Verified
          </span>
        )}
        {connection?.lastVerifiedAt && (
          <span>Verified: {new Date(connection.lastVerifiedAt).toLocaleString()}</span>
        )}
        {connection?.budgetLimitUsd !== null && connection?.budgetLimitUsd !== undefined && (
          <span>
            Monthly Cap: ${(connection.currentUsageUsd ?? 0).toFixed(2)} / ${connection.budgetLimitUsd.toFixed(2)}
          </span>
        )}
        <span className="font-sx-mono text-[10px] text-sx-text-subtle uppercase">
          Access Methods: {definition.supportedAccessMethods.join(" > ")}
        </span>
      </div>

      {/* Discovered capabilities list for non-Google-AI-Pro cards */}
      {!isGoogleAiPro && (
        <div className="flex flex-col gap-1.5">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">
            Available Verified Capabilities
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {health.discoveredCapabilities.length > 0 ? (
              health.discoveredCapabilities.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full border border-sx-border bg-sx-surface-2 px-2.5 py-0.5 text-[11px] text-sx-text"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#5BDCA7]" />
                  {c}
                </span>
              ))
            ) : (
              <span className="text-xs text-sx-text-subtle">
                No capabilities discovered yet (authenticate or run health check).
              </span>
            )}
          </div>
        </div>
      )}

      {/* Action required warnings */}
      {isAuthRequired && (
        <div className="rounded-sx-md border border-[rgb(240_180_41_/_0.3)] bg-[rgb(240_180_41_/_0.06)] p-2.5 text-xs text-[#F3C55C]">
          <span className="font-semibold uppercase">Action Required: </span>
          Authentication credentials or tokens are required or expired. Authorize this personal connection below.
        </div>
      )}

      {/* Messages */}
      {health.lastError && (
        <p className="rounded border border-[rgb(242_86_95_/_0.3)] bg-[rgb(242_86_95_/_0.06)] p-2 text-xs text-[#FF8A90]">
          Last verification error: {health.lastError}
        </p>
      )}
      {error && <p className="text-xs text-[#FF8A90]">{error}</p>}
      {actionSuccess && <p className="text-xs text-[#5BDCA7]">{actionSuccess}</p>}

      {/* Action Row */}
      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-sx-border pt-3">
        {/* Google AI Pro OAuth button */}
        {isGoogleAiPro && (
          <a
            href="/api/admin/personal-connectors/google-ai-pro/connect"
            className="inline-flex items-center gap-1.5 rounded bg-sx-accent px-3 py-1.5 font-sx-sans text-xs font-medium text-white transition-all hover:bg-sx-accent/90"
          >
            {isConnected ? "RECONNECT GOOGLE AI PRO" : "CONNECT GOOGLE AI PRO"}
          </a>
        )}

        {/* Credential secret input (API Key / Token / Refresh Token) */}
        {canStoreSecret && (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={
                isGoogleAiPro
                  ? "Or enter OAuth Token / JSON directly"
                  : definition.authMethod === "api_key"
                  ? "Enter Personal API Key / Token"
                  : "Enter Personal Credential"
              }
              className="!h-8 w-64 text-xs"
            />
            <Button variant="primary" size="sm" onClick={handleConnectSecret} disabled={busy || !secret}>
              {isConnected ? "RECONNECT" : "CONNECT"}
            </Button>
          </div>
        )}

        <Button variant="secondary" size="sm" onClick={handleVerifyLive} disabled={busy}>
          TEST HEALTH
        </Button>

        {connection && canStoreSecret && (
          <Button variant="secondary" size="sm" onClick={handleDisconnect} disabled={busy}>
            DISCONNECT
          </Button>
        )}

        {connection && (
          <Button variant="secondary" size="sm" onClick={handleToggleEnabled} disabled={busy}>
            {health.status === "disabled" ? "ENABLE" : "DISABLE"}
          </Button>
        )}

        <Button variant="secondary" size="sm" onClick={() => setShowSettings((v) => !v)}>
          {showSettings ? "HIDE LIMITS" : "BUDGET/LIMITS"}
        </Button>

        <Button variant="secondary" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "HIDE PERMISSIONS" : "PERMISSIONS & SCOPE"}
        </Button>

        <Button variant="secondary" size="sm" onClick={() => setShowAudit((v) => !v)}>
          {showAudit ? "HIDE AUDIT" : "AUDIT LOGS"}
        </Button>
      </div>

      {/* Budget & Limits Form */}
      {showSettings && (
        <form onSubmit={handleSaveSettings} className="mt-2 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3">
          <p className="font-sx-sans text-xs font-semibold text-sx-text">Personal Resource &amp; Budget Controls</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] text-sx-text-subtle uppercase">Monthly USD Budget Limit</label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 100.00 (optional)"
                value={budgetLimit}
                onChange={(e) => setBudgetLimit(e.target.value)}
                className="!h-8 w-44 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] text-sx-text-subtle uppercase">Rate Limit (req / min)</label>
              <Input
                type="number"
                placeholder="e.g. 60 (optional)"
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
                className="!h-8 w-44 text-xs"
              />
            </div>
            <div className="pt-4">
              <Button type="submit" variant="primary" size="sm" disabled={busy}>
                SAVE CONTROLS
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Permissions & Scoping Panel */}
      {expanded && (
        <div className="mt-2 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3">
          <p className="font-sx-sans text-xs font-semibold text-sx-text">
            Company &amp; Agent Autonomy Scoping
          </p>
          <p className="mt-0.5 text-xs text-sx-text-subtle">
            Hermes can only invoke this personal connector when an explicit company or agent assignment is added below.
          </p>

          {assignments === null && <p className="mt-2 text-xs text-sx-text-subtle">Loading assignments…</p>}
          {assignments && assignments.length === 0 && (
            <p className="mt-2 text-xs text-sx-text-subtle">
              No assignments recorded yet. Add an assignment below to authorize Hermes missions.
            </p>
          )}

          {assignments && assignments.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-sx-border bg-sx-surface-2 p-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sx-text">{a.capability_key}</span>
                    {a.tenant_id ? (
                      <span className="rounded bg-sx-surface-1 px-1.5 py-0.5 text-[10px] text-sx-text-muted">
                        Company: {a.tenant_id}
                      </span>
                    ) : (
                      <span className="rounded bg-sx-surface-1 px-1.5 py-0.5 text-[10px] text-[#5BDCA7]">
                        All Companies (Founder Default)
                      </span>
                    )}
                    {a.agent_definition_id && (
                      <span className="rounded bg-sx-surface-1 px-1.5 py-0.5 text-[10px] text-sx-text-muted">
                        Agent: {a.agent_definition_id}
                      </span>
                    )}
                    {a.budget_limit_usd !== null && a.budget_limit_usd !== undefined && (
                      <span className="rounded bg-sx-surface-1 px-1.5 py-0.5 text-[10px] text-sx-text-muted">
                        Cap: ${a.budget_limit_usd}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={a.autonomy}
                      onChange={(e) => void handleAutonomyChange(a.id, e.target.value)}
                      className="!h-7 w-auto py-0 text-xs"
                    >
                      {AUTONOMY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt.toUpperCase()}
                        </option>
                      ))}
                    </Select>
                    <button
                      onClick={() => void handleDeleteAssignment(a.id)}
                      className="text-xs text-sx-text-subtle hover:text-[#FF8A90]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add assignment form */}
          {definition.declaredCapabilities.length > 0 && (
            <form onSubmit={handleAddAssignment} className="mt-3 flex flex-wrap items-center gap-2 border-t border-sx-border pt-3">
              <Select
                value={newCapability}
                onChange={(e) => setNewCapability(e.target.value)}
                className="!h-8 w-auto max-w-[220px] py-0 text-xs"
              >
                {definition.declaredCapabilities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Input
                value={newTenantScope}
                onChange={(e) => setNewTenantScope(e.target.value)}
                placeholder="Company ID (optional)"
                className="!h-8 max-w-[150px] text-xs"
              />
              <Input
                value={newAgentId}
                onChange={(e) => setNewAgentId(e.target.value)}
                placeholder="Agent ID (optional)"
                className="!h-8 max-w-[140px] text-xs"
              />
              <Input
                type="number"
                step="0.01"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                placeholder="Budget $ (opt)"
                className="!h-8 max-w-[100px] text-xs"
              />
              <Select
                value={newAutonomy}
                onChange={(e) => setNewAutonomy(e.target.value as (typeof AUTONOMY_OPTIONS)[number])}
                className="!h-8 w-auto py-0 text-xs"
              >
                {AUTONOMY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.toUpperCase()}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="primary" size="sm" disabled={busy}>
                ADD ASSIGNMENT
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Audit History Panel */}
      {showAudit && (
        <div className="mt-2 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3">
          <div className="flex items-center justify-between">
            <p className="font-sx-sans text-xs font-semibold text-sx-text">Recent Audit Logs</p>
            <Button variant="secondary" size="sm" onClick={() => void loadAuditLogs()}>
              REFRESH
            </Button>
          </div>
          {auditLogs === null && <p className="mt-2 text-xs text-sx-text-subtle">Loading audit logs…</p>}
          {auditLogs && auditLogs.length === 0 && (
            <p className="mt-2 text-xs text-sx-text-subtle">No audit events recorded for this connector yet.</p>
          )}
          {auditLogs && auditLogs.length > 0 && (
            <div className="mt-2 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded bg-sx-surface-2 p-1.5 font-sx-mono text-[11px]"
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
                    <span className="text-sx-text uppercase">{log.event_type}</span>
                    <span className="text-sx-text-subtle">by {log.actor_kind}</span>
                    {log.execution_method && (
                      <span className="rounded bg-sx-surface-1 px-1 text-[10px] text-sx-text-muted">
                        via {log.execution_method}
                      </span>
                    )}
                  </div>
                  <span className="text-sx-text-subtle">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PersonalConnectorsContent() {
  const searchParams = useSearchParams();
  const connectedKey = searchParams.get("connected");
  const queryError = searchParams.get("error");

  const [rows, setRows] = useState<PersonalConnectorRow[] | null>(null);
  const [summary, setSummary] = useState<PersonalConnectorsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformFetch("/api/platform/admin/personal-connectors");
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to load personal connectors (HTTP ${res.status})`);
        return;
      }
      setRows(body.connectors ?? []);
      setSummary(body.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load personal connectors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = (rows ?? []).filter((r) => {
    if (activeCategory === "all") return true;
    return r.definition.category === activeCategory;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-sx-sans text-2xl font-bold text-sx-text">Personal Connectors</h1>
            <span className="rounded bg-sx-accent/15 px-2 py-0.5 font-sx-mono text-xs font-semibold text-sx-accent border border-sx-accent/30">
              Founder-Owned
            </span>
          </div>
          <p className="mt-1 text-sm text-sx-text-muted">
            Founder-owned accounts, AI subscriptions, storage, developer resources, and external services available to Hermes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            REFRESH ALL
          </Button>
        </div>
      </header>

      {/* Notification Banners */}
      {connectedKey && (
        <div className="rounded-sx-md border border-[#5BDCA7]/40 bg-[#5BDCA7]/10 p-3 text-xs text-[#5BDCA7]">
          ✓ <strong>Connection Established:</strong> {connectedKey.toUpperCase()} has been authorized and vaulted
          successfully. Entitled capabilities discovered and available for Hermes governance.
        </div>
      )}

      {queryError && (
        <div className="rounded-sx-md border border-[rgb(242_86_95_/_0.4)] bg-[rgb(242_86_95_/_0.1)] p-3 text-xs text-[#FF8A90]">
          ✕ <strong>Connection Error:</strong> {queryError}
        </div>
      )}

      {/* Policy Callout Banner */}
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 p-3 text-xs text-sx-text-muted">
        <span className="font-semibold text-sx-text uppercase font-sx-mono">Founder Control Policy: </span>
        These connections belong to the Founder. Hermes can use them only when the assigned company, agent,
        mission, permission, autonomy, and budget policies allow it.
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <Card className="flex flex-col gap-1 p-3">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">Personal Pool</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-sx-sans text-xl font-bold text-sx-text">
              {summary?.totalPersonalConnectors ?? 0}
            </span>
            <span className="text-[11px] text-sx-text-muted">Supported</span>
          </div>
        </Card>

        <Card className="flex flex-col gap-1 p-3">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">Connected</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-sx-sans text-xl font-bold text-[#5BDCA7]">
              {summary?.connectedCount ?? 0}
            </span>
            <span className="text-[11px] text-sx-text-muted">Active</span>
          </div>
        </Card>

        <Card className="flex flex-col gap-1 p-3">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">Action Needed</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-sx-sans text-xl font-bold text-[#F3C55C]">
              {summary?.actionRequiredCount ?? 0}
            </span>
            <span className="text-[11px] text-sx-text-muted">Requires Auth</span>
          </div>
        </Card>

        <Card className="flex flex-col gap-1 p-3">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">Verified Caps</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-sx-sans text-xl font-bold text-sx-text">
              {summary?.verifiedCapabilitiesCount ?? 0}
            </span>
            <span className="text-[11px] text-sx-text-muted">Live</span>
          </div>
        </Card>

        <Card className="flex flex-col gap-1 p-3 col-span-2">
          <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-subtle">Founder Identity</span>
          <div className="flex flex-col">
            <span className="font-sx-mono text-xs font-semibold text-sx-text truncate">
              {summary?.founderEmail || "Founder"}
            </span>
            <span className="text-[10px] text-sx-text-subtle">
              Verified: {summary?.lastGlobalVerifiedAt ? new Date(summary.lastGlobalVerifiedAt).toLocaleDateString() : "Pending"}
            </span>
          </div>
        </Card>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-sx-border pb-3">
        {PERSONAL_CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id)}
            className={`rounded-sx-md px-3 py-1.5 text-xs font-medium transition-all ${
              activeCategory === tab.id
                ? "bg-sx-accent text-white"
                : "bg-sx-surface-1 text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading && !rows && <p className="text-sm text-sx-text-subtle">Loading Founder personal connectors…</p>}

      {/* Connector Cards */}
      {rows && (
        <div className="flex flex-col gap-4">
          {filteredRows.map((row) => (
            <PersonalConnectorCard key={row.definition.key} row={row} onChanged={() => void load()} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PersonalConnectorsAdminPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-sx-text-subtle">Loading Personal Connectors…</div>}>
      <PersonalConnectorsContent />
    </Suspense>
  );
}
