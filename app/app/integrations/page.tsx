"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";

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

const BINDING_CHIP: Record<string, { label: string; state: ChipState }> = {
  pending: { label: "Pending", state: "warning" },
  active: { label: "Active", state: "success" },
  disabled: { label: "Disabled", state: "neutral" },
  revoked: { label: "Revoked", state: "danger" },
};

/**
 * Client-facing counterpart to app/admin/(shell)/platform/whatsapp/page.tsx
 * — same tenant-scoped /api/platform/whatsapp/bindings API (already gated
 * on the owner/admin-only integration:configure permission), client chrome.
 * Other integration kinds (Meta, Google, YouTube) live under Social
 * Autopilot today; folding them in here is part of the still-pending
 * content-migration decision (CURRENT_TO_FINAL_MIGRATION_PLAN.md §3), not
 * done in this pass.
 */
export default function IntegrationsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [bindings, setBindings] = useState<PhoneBinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    if (!tenantId) return;
    setError(null);
    const res = await fetch(`/api/platform/whatsapp/bindings?tenantId=${encodeURIComponent(tenantId)}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? `Failed to load integrations (HTTP ${res.status})`);
      return;
    }
    setBindings(body.bindings);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

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
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Integrations{active ? ` — ${active.name}` : ""}</h1>
      </header>
      {error && <ErrorState message={error} />}

      {tenantId && (
        <Card>
          <CardHeading>Add a WhatsApp phone binding (pending, shadow mode)</CardHeading>
          <p className="text-xs text-sx-text-subtle">
            Created as pending/shadow with inbound and outbound disabled — activating it with the real, verified
            phone number ID is a separate manual action, not something this form does.
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
        <h2 className="font-sx-sans text-base font-medium text-sx-text">WhatsApp phone bindings</h2>
        {tenantId && bindings?.length === 0 && <EmptyState title="No phone bindings yet." />}
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
    </div>
  );
}
