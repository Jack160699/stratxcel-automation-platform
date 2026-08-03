"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";

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

  async function load() {
    if (!tenantId) return;
    setError(null);
    const [bindingsRes, messagesRes] = await Promise.all([
      fetch(`/api/platform/whatsapp/bindings?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/whatsapp/shadow-messages?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    const bindingsBody = await bindingsRes.json();
    const messagesBody = await messagesRes.json();
    if (!bindingsRes.ok) {
      setError(bindingsBody.error ?? "Failed to load phone bindings");
      return;
    }
    setBindings(bindingsBody.bindings);
    setMessages(messagesRes.ok ? messagesBody.messages : []);
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
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">WhatsApp{active ? ` — ${active.name}` : ""}</h1>
      </header>
      {error && <ErrorState message={error} />}

      {tenantId && (
        <Card>
          <CardHeading>Add a phone binding (pending, shadow mode)</CardHeading>
          <p className="text-xs text-sx-text-subtle">
            Created as pending/shadow with inbound and outbound disabled — activating it with the real, verified
            phone_number_id is a separate manual action, not something this form does.
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
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Phone bindings</h2>
        {!tenantId && <NoClientSelected what="phone bindings" />}
        {tenantId && bindings?.length === 0 && <p className="text-sm text-sx-text-subtle">No phone bindings yet.</p>}
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
