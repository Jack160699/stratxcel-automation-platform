"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
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
  scopeLevel: "platform" | "company" | "both";
  declaredCapabilities: string[];
  description: string;
  realStatusSource: string;
  requiredEnvVars: string[];
}

interface ConnectorHealth {
  status: string;
  discoveredCapabilities: string[];
  lastError: string | null;
}

interface ConnectorRow {
  definition: ConnectorDefinition;
  connection: { id: string; status: string; connectedAt: string | null; lastHealthCheckAt: string | null } | null;
  health: ConnectorHealth;
}

interface Assignment {
  id: string;
  capability_key: string;
  department: string | null;
  agent_definition_id: string | null;
  autonomy: string;
}

const STATUS_CHIP: Record<string, { label: string; state: ChipState }> = {
  pending: { label: "Pending", state: "neutral" },
  connected: { label: "Connected", state: "accent" },
  healthy: { label: "Healthy", state: "success" },
  auth_expired: { label: "Auth expired", state: "warning" },
  rate_limited: { label: "Rate limited", state: "warning" },
  quota_exhausted: { label: "Quota exhausted", state: "warning" },
  error: { label: "Error", state: "danger" },
  disabled: { label: "Disabled", state: "neutral" },
  requires_reauth: { label: "Requires reauth", state: "warning" },
};

const AUTONOMY_OPTIONS = ["read", "prepare", "execute", "approval_required", "disabled"] as const;

function ConnectorCard({ row, tenantId, onChanged }: { row: ConnectorRow; tenantId: string | null; onChanged: () => void }) {
  const { definition, connection, health } = row;
  const chip = STATUS_CHIP[health.status] ?? { label: health.status, state: "neutral" as ChipState };
  const [expanded, setExpanded] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [newCapability, setNewCapability] = useState(definition.declaredCapabilities[0] ?? "");
  const [newDepartment, setNewDepartment] = useState("");
  const [newAutonomy, setNewAutonomy] = useState<(typeof AUTONOMY_OPTIONS)[number]>("read");

  const isReadOnlyAdapter = ["whatsapp", "meta", "google_workspace"].includes(definition.key) || (definition.key === "vercel" && Boolean(tenantId));
  const isMcpManaged = definition.authMethod === "mcp_managed";
  const canStoreSecret = !isReadOnlyAdapter && !isMcpManaged;

  const scopeQuery = definition.scopeLevel === "platform" ? "" : tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";

  const loadAssignments = useCallback(async () => {
    const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}/assignments${scopeQuery}`);
    const body = await res.json().catch(() => ({ assignments: [] }));
    setAssignments(body.assignments ?? []);
  }, [definition.key, scopeQuery]);

  useEffect(() => {
    if (expanded && assignments === null) void loadAssignments();
  }, [expanded, assignments, loadAssignments]);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenantId ?? undefined, rawSecret: secret || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Connect failed (HTTP ${res.status})`);
        return;
      }
      setSecret("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await platformFetch(`/api/platform/admin/connectors/${definition.key}${scopeQuery}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Disconnect failed (HTTP ${res.status})`);
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleRecheckHealth() {
    setBusy(true);
    setError(null);
    try {
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
          tenantId: tenantId ?? undefined,
          capabilityKey: newCapability,
          department: newDepartment || undefined,
          autonomy: newAutonomy,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Assignment failed (HTTP ${res.status})`);
        return;
      }
      setNewDepartment("");
      await loadAssignments();
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
      await platformFetch(`/api/platform/admin/connectors/assignments/${assignmentId}`, { method: "DELETE" });
      await loadAssignments();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sx-text">
            {definition.label} <span className="text-xs text-sx-text-subtle">({definition.category} · {definition.scopeLevel})</span>
          </p>
          <p className="mt-1 text-xs text-sx-text-subtle max-w-xl">{definition.description}</p>
        </div>
        <StatusChip state={chip.state}>{chip.label}</StatusChip>
      </div>

      {health.lastError && <p className="mt-2 text-xs text-[#FF8A90]">Last error: {health.lastError}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {health.discoveredCapabilities.length > 0 ? (
          health.discoveredCapabilities.map((c) => (
            <span key={c} className="rounded-full bg-sx-surface-2 border border-sx-border px-2 py-0.5 text-[10px] text-sx-text-muted">
              {c}
            </span>
          ))
        ) : (
          <span className="text-xs text-sx-text-subtle">No capabilities discovered yet.</span>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-[#FF8A90]">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canStoreSecret && (
          <>
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={definition.authMethod === "api_key" ? "API key / token" : "Credential"}
              className="max-w-xs"
            />
            <Button variant="primary" size="sm" onClick={handleConnect} disabled={busy || !secret}>
              CONNECT
            </Button>
          </>
        )}
        {isReadOnlyAdapter && (
          <span className="text-xs text-sx-text-subtle">
            Connected via its own real flow ({definition.realStatusSource.split(",")[0]}) -- this control plane only assigns and governs it, never re-stores its credential.
          </span>
        )}
        {isMcpManaged && <span className="text-xs text-sx-text-subtle">Operated via this engineering environment&apos;s own access -- no product-stored credential.</span>}
        {connection && connection.status !== "disabled" && canStoreSecret && (
          <Button variant="secondary" size="sm" onClick={handleDisconnect} disabled={busy}>
            DISCONNECT
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleRecheckHealth} disabled={busy}>
          VIEW HEALTH
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "HIDE ASSIGNMENTS" : "ASSIGN"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-sx-border pt-3">
          <p className="text-xs font-medium text-sx-text">Capability assignments</p>
          {assignments === null && <p className="mt-1 text-xs text-sx-text-subtle">Loading…</p>}
          {assignments && assignments.length === 0 && <p className="mt-1 text-xs text-sx-text-subtle">No assignments yet -- Hermes cannot use this connector for anything until one exists.</p>}
          {assignments && assignments.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {assignments.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sx-md border border-sx-border bg-sx-surface-1 p-2 text-xs">
                  <span className="text-sx-text">
                    {a.capability_key} {a.department ? `→ ${a.department}` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <Select value={a.autonomy} onChange={(e) => void handleAutonomyChange(a.id, e.target.value)} className="!h-7 w-auto py-0 text-xs">
                      {AUTONOMY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt.toUpperCase()}
                        </option>
                      ))}
                    </Select>
                    <button onClick={() => void handleDeleteAssignment(a.id)} className="text-sx-text-subtle hover:text-[#FF8A90]">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {definition.declaredCapabilities.length > 0 && (
            <form onSubmit={handleAddAssignment} className="mt-3 flex flex-wrap items-center gap-2">
              <Select value={newCapability} onChange={(e) => setNewCapability(e.target.value)} className="!h-8 w-auto max-w-[220px] py-0 text-xs">
                {definition.declaredCapabilities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Input value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} placeholder="Department (optional)" className="max-w-[160px]" />
              <Select value={newAutonomy} onChange={(e) => setNewAutonomy(e.target.value as (typeof AUTONOMY_OPTIONS)[number])} className="!h-8 w-auto py-0 text-xs">
                {AUTONOMY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.toUpperCase()}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="primary" size="sm" disabled={busy}>
                Add assignment
              </Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ConnectorsAdminPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId ?? null;
  const [rows, setRows] = useState<ConnectorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = tenantId ? `/api/platform/admin/connectors?tenantId=${encodeURIComponent(tenantId)}` : "/api/platform/admin/connectors";
      const res = await platformFetch(url);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to load connectors (HTTP ${res.status})`);
        return;
      }
      setRows(body.connectors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connectors");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const platformRows = rows?.filter((r) => r.definition.scopeLevel === "platform") ?? [];
  const companyRows = rows?.filter((r) => r.definition.scopeLevel !== "platform") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Connectors{active ? ` — ${active.name}` : ""}</h1>
        <p className="mt-1 text-sm text-sx-text-muted">
          The Connector/Capability Control Plane -- where external capabilities (AWS, GitHub, Supabase, Vercel, WhatsApp, Meta, Google Workspace, Gemini, OpenRouter, browser) are connected,
          health-checked for real, and assigned to companies/departments/agents with an explicit autonomy level. Hermes can only use a capability that has a real assignment here.
        </p>
      </header>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading && !rows && <p className="text-sm text-sx-text-subtle">Loading connectors…</p>}

      {rows && (
        <>
          <section className="flex flex-col gap-3">
            <CardHeading>Platform connectors — StratXcel&apos;s own infrastructure &amp; AI resources</CardHeading>
            <div className="flex flex-col gap-2">
              {platformRows.map((row) => (
                <ConnectorCard key={row.definition.key} row={row} tenantId={null} onChanged={() => void load()} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <CardHeading>Company connectors{active ? ` — ${active.name}` : " — select a company"}</CardHeading>
            {!tenantId && <p className="text-sm text-sx-text-subtle">Select a client from the switcher above to view/manage their company-scoped connectors.</p>}
            {tenantId && (
              <div className="flex flex-col gap-2">
                {companyRows.map((row) => (
                  <ConnectorCard key={row.definition.key} row={row} tenantId={tenantId} onChanged={() => void load()} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
