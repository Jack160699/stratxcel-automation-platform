"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";

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

const BINDING_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-400/15 text-amber-300",
  active: "bg-emerald-400/15 text-emerald-300",
  disabled: "bg-slate-600/20 text-slate-400",
  revoked: "bg-rose-400/15 text-rose-300",
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
        <h1 className="text-xl font-semibold text-slate-100">WhatsApp{active ? ` — ${active.name}` : ""}</h1>
      </header>
      {error && <p className="text-sm text-rose-300">{error}</p>}

      {tenantId && (
        <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-base font-medium text-slate-200">Add a phone binding (pending, shadow mode)</h2>
          <p className="text-xs text-slate-500">
            Created as pending/shadow with inbound and outbound disabled — activating it with the real, verified
            phone_number_id is tomorrow&apos;s manual action, not something this form does.
          </p>
          <form onSubmit={handleCreateBinding} className="flex flex-col gap-3 sm:flex-row">
            <input
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              required
              placeholder="WABA ID"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
            <input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              required
              placeholder="Phone number ID"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50"
            >
              {creating ? "Adding…" : "Add binding"}
            </button>
          </form>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-slate-200">Phone bindings</h2>
        {!tenantId && <NoClientSelected what="phone bindings" />}
        {tenantId && bindings?.length === 0 && <p className="text-sm text-slate-500">No phone bindings yet.</p>}
        {bindings && bindings.length > 0 && (
          <ul className="flex flex-col gap-2">
            {bindings.map((b) => (
              <li key={b.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-200">{b.display_phone_number ?? b.phone_number_id}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BINDING_STATUS_STYLES[b.status] ?? "bg-slate-600/20 text-slate-400"}`}>
                    {b.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {b.environment} · shadow: {b.shadow_mode ? "on" : "off"} · inbound: {b.inbound_enabled ? "on" : "off"} · outbound:{" "}
                  {b.outbound_enabled ? "on" : "off"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium text-slate-200">Shadow messages (proposed responses — never sent)</h2>
        {tenantId && messages?.length === 0 && <p className="text-sm text-slate-500">No shadow messages yet.</p>}
        {messages && messages.length > 0 && (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => (
              <li key={m.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-sm">
                <p className="text-slate-200">{m.body || <span className="italic text-slate-500">(no proposed reply)</span>}</p>
                <p className="mt-1 text-xs text-slate-500">
                  confidence: {m.metadata.confidence ?? "—"} · rule: {m.metadata.rulePath ?? "—"} · would send:{" "}
                  {m.would_send ? "yes (shadow only)" : "no"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
