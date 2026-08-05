"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { EmptyModuleState } from "../components/EmptyModuleState";
import { StaffScopedNotice } from "../content/StaffScopedNotice";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState } from "@/components/ui/Feedback";
import type { LeadSummary } from "../crm/page";

interface ShadowMessage {
  id: string;
  lead_id: string | null;
  direction: "inbound" | "outbound_shadow";
  body: string;
  would_send: boolean;
  created_at: string;
}

interface HandoffRow {
  id: string;
  mission_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}

/**
 * Top-level cross-channel conversations view — distinct from
 * /app/content/inbox (content/social-specific). Today the only real,
 * tenant-scoped conversation source is WhatsApp shadow messages, read via
 * the existing app/api/platform/whatsapp/shadow-messages route (not a new
 * one — that route already existed, gated on integration:configure).
 * Social's DM/comment inbox stays owner-scoped and is surfaced honestly via
 * StaffScopedNotice rather than being fetched here.
 */
export default function ConversationsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [messages, setMessages] = useState<ShadowMessage[] | null | "forbidden">(null);
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId) return;
    setError(null);
    const [messagesRes, leadsRes, handoffsRes] = await Promise.all([
      fetch(`/api/platform/whatsapp/shadow-messages?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/leads?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/handoffs?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    if (messagesRes.status === 403) {
      setMessages("forbidden");
    } else {
      const messagesBody = await messagesRes.json();
      if (!messagesRes.ok) {
        setError(messagesBody.error ?? `Failed to load conversations (HTTP ${messagesRes.status})`);
        return;
      }
      setMessages(messagesBody.messages);
    }

    const leadsBody = await leadsRes.json();
    if (leadsRes.ok) setLeads(leadsBody.leads);

    const handoffsBody = await handoffsRes.json();
    if (handoffsRes.ok) setHandoffs(handoffsBody.handoffs);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const leadById = useMemo(() => {
    const map = new Map<string, LeadSummary>();
    for (const l of leads ?? []) map.set(l.id, l);
    return map;
  }, [leads]);

  const byLead = useMemo(() => {
    const groups = new Map<string, ShadowMessage[]>();
    for (const m of Array.isArray(messages) ? messages : []) {
      const key = m.lead_id ?? "unlinked";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return Array.from(groups.entries()).sort((a, b) => (b[1][0]?.created_at ?? "").localeCompare(a[1][0]?.created_at ?? ""));
  }, [messages]);

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader title="Conversations" tenantName={active?.name} description="WhatsApp inquiries and follow-up drafts, grouped by lead." />

      {error && <ErrorState message={error} onRetry={load} />}

      <StaffScopedNotice what="Social DM and comment conversations" />

      {handoffs && handoffs.length > 0 && (
        <Card variant="alert">
          <CardHeading>Open human handoffs</CardHeading>
          {handoffs.map((h) => (
            <CardRow key={h.id}>
              <span className="min-w-0 flex-1 truncate text-sx-text-muted">{h.reason}</span>
              <StatusChip state="warning">{h.status}</StatusChip>
            </CardRow>
          ))}
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">WhatsApp conversations</h2>
        <p className="text-xs text-sx-text-subtle">Read state isn&apos;t tracked yet — every conversation below is shown, not filtered by unread.</p>

        {tenantId && messages === null && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {messages === "forbidden" && <p className="text-sm text-sx-text-subtle">No access for your role.</p>}
        {Array.isArray(messages) && byLead.length === 0 && <EmptyModuleState resource="conversations" subtitle="Inbound WhatsApp messages will appear here." />}

        {byLead.length > 0 && (
          <div className="flex flex-col gap-2">
            {byLead.map(([leadId, msgs]) => {
              const lead = leadId !== "unlinked" ? leadById.get(leadId) : undefined;
              const latest = msgs[0];
              return (
                <Card key={leadId} variant="nested">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-sx-text">
                        {lead ? lead.contact_name || lead.contact_phone || lead.contact_email || "Unknown contact" : "Unlinked message"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-sx-text-subtle" title={latest.body}>
                        {latest.direction === "outbound_shadow" ? "Draft reply: " : ""}
                        {latest.body}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-sx-text-subtle">Assigned staff: Not available · {new Date(latest.created_at).toLocaleString()}</p>
                    </div>
                    {lead && (
                      <Link href={`/app/crm/${lead.id}`} className="shrink-0 text-xs text-sx-accent hover:underline">
                        Open lead →
                      </Link>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
