"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import { WhatsAppAgentPairingCard } from "@/components/agent-core/WhatsAppAgentPairingCard";
import { TeamWhatsAppAccess } from "@/components/agent-core/TeamWhatsAppAccess";

interface PhoneBinding {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  environment: string;
  status: string;
  shadow_mode: boolean;
  inbound_enabled: boolean;
  outbound_enabled: boolean;
}

interface ShadowMessage {
  id: string;
  direction: string;
  body: string;
  would_send: boolean;
  metadata: { confidence?: string; rulePath?: string; executionTrace?: string[] };
  created_at: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  synced_at: string | null;
}

interface MigrationStatus {
  legacyBot:
    | { configured: false }
    | {
        configured: true;
        wabaId: string;
        phoneNumberId: string;
        displayPhoneNumber: string | null;
        legacyHost: string | null;
        status: string;
        migrationStatus: string;
        health: "healthy" | "unhealthy" | "unknown";
      };
  migrationMode: "off" | "shadow" | "cutover";
  mirroredEventsCount: number;
  lastMirroredEventAt: string | null;
  comparableTurns: number;
  matchCount: number;
  mismatchCount: number;
  shadowErrors: number;
  recentMismatches: Array<{ legacyEventId: string; mismatchReason: string | null; comparedAt: string | null }>;
  cutoverReadiness: "NOT_READY" | "SHADOWING" | "READY_FOR_REVIEW";
}

const BINDING_CHIP: Record<string, { label: string; state: ChipState }> = {
  pending: { label: "Pending", state: "warning" },
  active: { label: "Active", state: "success" },
  disabled: { label: "Disabled", state: "neutral" },
  revoked: { label: "Revoked", state: "danger" },
};

export default function WhatsAppAdminPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [bindings, setBindings] = useState<PhoneBinding[] | null>(null);
  const [messages, setMessages] = useState<ShadowMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [creating, setCreating] = useState(false);
  
  // Platform templates state (tenant-independent)
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templateMetaAvailable, setTemplateMetaAvailable] = useState(true);
  const [templateLastVerified, setTemplateLastVerified] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signupNotice, setSignupNotice] = useState<string | null>(null);
  const [migration, setMigration] = useState<MigrationStatus | null>(null);

  async function loadTemplates(force = false) {
    try {
      const url = force ? "/api/platform/whatsapp/templates?force=true" : "/api/platform/whatsapp/templates";
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        setTemplates(body.templates ?? []);
        setTemplateMetaAvailable(body.metaAvailable ?? true);
        setTemplateLastVerified(body.lastVerifiedAt ?? null);
      }
    } catch {
      // Non-blocking template load
    }
  }

  async function loadTenantData() {
    if (!tenantId) {
      setBindings(null);
      setMessages(null);
      setMigration(null);
      return;
    }
    setError(null);
    const [bindingsRes, messagesRes, migrationRes] = await Promise.all([
      platformFetch(`/api/platform/whatsapp/bindings?tenantId=${encodeURIComponent(tenantId)}`),
      platformFetch(`/api/platform/whatsapp/shadow-messages?tenantId=${encodeURIComponent(tenantId)}`),
      platformFetch(`/api/platform/whatsapp/migration/status?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    const bindingsBody = await bindingsRes.json();
    const messagesBody = await messagesRes.json();
    if (!bindingsRes.ok) {
      setBindings([]);
      setError(bindingsBody.error ?? "Failed to load phone bindings");
      return;
    }
    setBindings(bindingsBody.bindings);
    setMessages(messagesRes.ok ? messagesBody.messages : []);
    if (migrationRes.ok) setMigration(await migrationRes.json());
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    void loadTenantData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleEmbeddedSignup() {
    if (!tenantId) return;
    setConnecting(true);
    setSignupNotice(null);
    try {
      const res = await fetch("/api/platform/whatsapp/embedded-signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      const body = await res.json();
      if (!res.ok || !body.available) {
        setSignupNotice(body.error ?? "Embedded Signup is not yet available — use the manual form below.");
        return;
      }
      window.location.href = body.signupUrl;
    } finally {
      setConnecting(false);
    }
  }

  async function handleSyncTemplates() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Template sync failed");
        return;
      }
      setTemplates(body.templates ?? []);
      setTemplateMetaAvailable(body.metaAvailable ?? true);
      setTemplateLastVerified(body.lastVerifiedAt ?? null);
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateBinding(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/whatsapp/bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, wabaId, phoneNumberId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to create binding (HTTP ${res.status})`);
        return;
      }
      setWabaId("");
      setPhoneNumberId("");
      await loadTenantData();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Integrations{active ? ` — ${active.name}` : ""}</h1>
        <p className="mt-1 text-sm text-sx-text-muted">
          WhatsApp Cloud API configuration, platform delivery templates, and client messaging routing.
        </p>
      </header>
      {error && <ErrorState message={error} onRetry={() => { void loadTemplates(true); void loadTenantData(); }} />}

      <Card>
        <CardHeading>Integration layers</CardHeading>
        <p className="mt-2 text-xs text-sx-text-subtle">
          <strong className="text-sx-text">Platform Delivery Templates</strong> (below) are automatically resolved from Meta for core product deliveries like Audit reports.{" "}
          <strong className="text-sx-text">Owner WhatsApp Agent</strong> links your staff account for command and control.{" "}
          <strong className="text-sx-text">Tenant phone bindings</strong> route customer WhatsApp traffic for the selected workspace.
        </p>
      </Card>

      {/* Platform Templates Section (Tenant-Independent) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-sx-sans text-base font-medium text-sx-text">Platform Templates</h2>
            <p className="text-xs text-sx-text-subtle">Authoritative Meta approval status for core delivery templates.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleSyncTemplates} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync from Meta"}
          </Button>
        </div>

        {templates.length === 0 && (
          <Card variant="nested" className="p-4">
            <p className="text-sm text-sx-text-muted">Waiting for Meta verification…</p>
            <p className="mt-1 text-xs text-sx-text-subtle">Platform templates auto-resolve on load. Click &quot;Sync from Meta&quot; to force an immediate refresh.</p>
          </Card>
        )}

        {templates.length > 0 && (
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <Card key={t.id} variant="nested">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sx-text">
                      {t.name} <span className="text-xs text-sx-text-subtle">({t.language}{t.category ? ` · ${t.category}` : ""})</span>
                    </p>
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      Meta verified
                    </span>
                  </div>
                  <StatusChip state={t.status === "APPROVED" ? "success" : t.status === "REJECTED" ? "danger" : "warning"}>
                    {t.status}
                  </StatusChip>
                </div>
                <div className="mt-2 text-xs text-sx-text-subtle flex flex-wrap items-center justify-between gap-1">
                  <span>Synced: automatic</span>
                  {templateLastVerified && (
                    <span>
                      {templateMetaAvailable ? "Last verified: " : "Meta offline (cached): "}
                      {new Date(templateLastVerified).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Platform-staff scoped Owner Agent */}
      <WhatsAppAgentPairingCard
        pairingUrl="/api/admin/whatsapp-agent/pairing"
        statusUrl="/api/admin/whatsapp-agent/status"
        linkUrl="/api/admin/whatsapp-agent/link"
        linkCommandPrefix="LINK ADMIN"
        numberDisplay="+91 77778 12777"
        resetUrl="/api/admin/whatsapp-agent/reset"
      />

      <TeamWhatsAppAccess />

      {tenantId && (
        <Card>
          <CardHeading>Connect via WhatsApp Embedded Signup</CardHeading>
          <p className="text-xs text-sx-text-subtle">
            Meta&apos;s guided connect flow — requires a separate WhatsApp Embedded Signup app configuration.
          </p>
          {signupNotice && <p className="mt-2 text-xs text-[#FF8A90]">{signupNotice}</p>}
          <Button className="mt-2" variant="primary" size="sm" onClick={handleEmbeddedSignup} disabled={connecting}>
            {connecting ? "Starting…" : "Connect WhatsApp"}
          </Button>
        </Card>
      )}

      {tenantId && (
        <Card>
          <CardHeading>Add a phone binding (pending, shadow mode)</CardHeading>
          <p className="text-xs text-sx-text-subtle">
            Created as pending/shadow with inbound and outbound disabled.
          </p>
          <form onSubmit={handleCreateBinding} className="flex flex-col gap-3 sm:flex-row">
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} required placeholder="WABA ID" className="flex-1" />
            <Input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              required
              placeholder="Phone number ID"
              className="flex-1"
            />
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? "Adding…" : "Add binding"}
            </Button>
          </form>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Tenant Cloud API phone bindings</h2>
        <p className="text-xs text-sx-text-subtle">These numbers route inbound/outbound WhatsApp for the selected client.</p>
        {!tenantId && <NoClientSelected what="phone bindings" />}
        {tenantId && bindings === null && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {tenantId && bindings?.length === 0 && !error && <p className="text-sm text-sx-text-subtle">No phone bindings yet.</p>}
        {bindings && bindings.length > 0 && (
          <div className="flex flex-col gap-2">
            {bindings.map((b) => {
              const chip = BINDING_CHIP[b.status] ?? { label: b.status, state: "neutral" as ChipState };
              return (
                <Card key={b.id} variant="nested">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-sx-text">{b.display_phone_number ?? b.phone_number_id}</p>
                    <StatusChip state={chip.state}>{chip.label}</StatusChip>
                  </div>
                  <p className="mt-1 text-xs text-sx-text-subtle">
                    {b.environment} · shadow: {b.shadow_mode ? "on" : "off"} · inbound: {b.inbound_enabled ? "on" : "off"} · outbound:{" "}
                    {b.outbound_enabled ? "on" : "off"}
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {migration && (
        <section className="flex flex-col gap-3">
          <h2 className="font-sx-sans text-base font-medium text-sx-text">Verified-bot shadow / parity migration</h2>
          <Card variant="nested">
            {!migration.legacyBot.configured ? (
              <p className="text-sm text-sx-text-subtle">
                No legacy binding configured yet — set WHATSAPP_LEGACY_TENANT_ID / _WABA_ID / _PHONE_NUMBER_ID to activate.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-sx-text">
                    {migration.legacyBot.displayPhoneNumber ?? migration.legacyBot.phoneNumberId}{" "}
                    <span className="text-xs text-sx-text-subtle">(existing verified bot)</span>
                  </p>
                  <StatusChip
                    state={migration.legacyBot.health === "healthy" ? "success" : migration.legacyBot.health === "unhealthy" ? "danger" : "warning"}
                  >
                    {migration.legacyBot.health}
                  </StatusChip>
                </div>
                <p className="mt-1 text-xs text-sx-text-subtle">
                  host: {migration.legacyBot.legacyHost ?? "—"} · migration mode: {migration.migrationMode} · binding status:{" "}
                  {migration.legacyBot.status}
                </p>
              </>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-sx-text-subtle sm:grid-cols-4">
              <p>Mirrored events: {migration.mirroredEventsCount}</p>
              <p>Comparable turns: {migration.comparableTurns}</p>
              <p>
                Match / mismatch: {migration.matchCount} / {migration.mismatchCount}
              </p>
              <p>Shadow errors: {migration.shadowErrors}</p>
            </div>
            <p className="mt-2 text-xs text-sx-text-subtle">
              Last mirrored event: {migration.lastMirroredEventAt ? new Date(migration.lastMirroredEventAt).toLocaleString() : "never"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-sx-text-subtle">Cutover readiness:</span>
              <StatusChip state={migration.cutoverReadiness === "READY_FOR_REVIEW" ? "warning" : migration.cutoverReadiness === "SHADOWING" ? "neutral" : "danger"}>
                {migration.cutoverReadiness.replace(/_/g, " ")}
              </StatusChip>
            </div>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Shadow messages (proposed responses — never sent)</h2>
        {tenantId && messages?.length === 0 && <p className="text-sm text-sx-text-subtle">No shadow messages yet.</p>}
        {messages && messages.length > 0 && (
          <div className="flex flex-col gap-2">
            {messages.map((m) => (
              <Card key={m.id} variant="nested">
                <p className="text-sx-text">{m.body || <span className="italic text-sx-text-subtle">(no proposed reply)</span>}</p>
                <p className="mt-1 text-xs text-sx-text-subtle">
                  confidence: {m.metadata.confidence ?? "—"} · rule: {m.metadata.rulePath ?? "—"} · would send:{" "}
                  {m.would_send ? "yes (shadow only)" : "no"}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
