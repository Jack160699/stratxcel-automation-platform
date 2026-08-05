"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { LEAD_STATUS_CHIP, type LeadSummary } from "../page";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";

interface ShadowMessage {
  id: string;
  lead_id: string | null;
  direction: "inbound" | "outbound_shadow";
  body: string;
  would_send: boolean;
  created_at: string;
}

/** No dedicated single-lead GET route exists — reuses the tenant-scoped leads list and filters client-side, same convention as /app/missions/[missionId]. */
export default function LeadDetailPage() {
  const params = useParams<{ leadId: string }>();
  const leadId = params.leadId;
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [lead, setLead] = useState<LeadSummary | null | undefined>(undefined);
  const [messages, setMessages] = useState<ShadowMessage[] | null | "forbidden">(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function load() {
    if (!tenantId) return;
    setError(null);
    setLead(undefined);

    const [leadsRes, messagesRes] = await Promise.all([
      fetch(`/api/platform/leads?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/whatsapp/shadow-messages?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    const leadsBody = await leadsRes.json();
    if (!leadsRes.ok) {
      setError(leadsBody.error ?? `Failed to load lead (HTTP ${leadsRes.status})`);
      return;
    }
    setLead((leadsBody.leads as LeadSummary[]).find((l) => l.id === leadId) ?? null);

    if (messagesRes.status === 403) {
      setMessages("forbidden");
    } else {
      const messagesBody = await messagesRes.json();
      if (messagesRes.ok) setMessages((messagesBody.messages as ShadowMessage[]).filter((m) => m.lead_id === leadId));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leadId]);

  async function startFollowUpMission() {
    if (!tenantId || !lead) return;
    setStarting(true);
    try {
      const contact = lead.contact_name || lead.contact_phone || lead.contact_email || "this lead";
      const res = await fetch("/api/platform/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, goalText: `Prepare a follow-up proposal for ${contact}` }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to start mission");
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/app/crm" className="text-xs text-sx-text-muted hover:text-sx-text">
          ← CRM & Leads
        </Link>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Lead</h1>
      </header>

      {error && <ErrorState message={error} />}
      {lead === undefined && !error && <p className="text-sm text-sx-text-subtle">Loading…</p>}
      {lead === null && !error && <EmptyState title="Lead not found." subtitle="It may belong to a different workspace or no longer exist." />}

      {lead && (
        <>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <CardHeading>{lead.contact_name || lead.contact_phone || lead.contact_email || "Unknown contact"}</CardHeading>
              <StatusChip state={LEAD_STATUS_CHIP[lead.status]?.state ?? "neutral"}>{LEAD_STATUS_CHIP[lead.status]?.label ?? lead.status}</StatusChip>
            </div>
            <CardRow>
              <span className="text-sx-text-muted">Phone</span>
              <span>{lead.contact_phone ?? "—"}</span>
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Email</span>
              <span>{lead.contact_email ?? "—"}</span>
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Source</span>
              <span>{lead.source}</span>
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Assigned owner</span>
              <span>Not available</span>
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Received</span>
              <span>{new Date(lead.created_at).toLocaleString()}</span>
            </CardRow>
          </Card>

          <div>
            <Button variant="primary" size="sm" onClick={startFollowUpMission} disabled={starting}>
              {starting ? "Starting…" : "Start follow-up / proposal mission"}
            </Button>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="font-sx-sans text-base font-medium text-sx-text">Conversation</h2>
            {messages === null && <p className="text-sm text-sx-text-subtle">Loading…</p>}
            {messages === "forbidden" && <p className="text-sm text-sx-text-subtle">No access for your role.</p>}
            {messages && messages !== "forbidden" && messages.length === 0 && <EmptyState title="No conversation yet for this lead." />}
            {messages && messages !== "forbidden" && messages.length > 0 && (
              <Card>
                {messages.map((m) => (
                  <CardRow key={m.id} className="items-start">
                    <span className="w-16 shrink-0 font-sx-mono text-[10.5px] uppercase tracking-[0.06em] text-sx-text-subtle">
                      {m.direction === "inbound" ? "In" : "Draft"}
                    </span>
                    <span className="min-w-0 flex-1 text-sx-text-muted">{m.body}</span>
                    <span className="w-32 shrink-0 text-right font-sx-mono text-[10.5px] text-sx-text-subtle">{new Date(m.created_at).toLocaleString()}</span>
                  </CardRow>
                ))}
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
