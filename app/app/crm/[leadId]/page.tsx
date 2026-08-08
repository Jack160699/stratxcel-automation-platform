"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { LEAD_STATUS_CHIP, type LeadSummary } from "../page";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";

interface ShadowMessage {
  id: string;
  lead_id: string | null;
  direction: "inbound" | "outbound_shadow";
  body: string;
  would_send: boolean;
  created_at: string;
}

interface FollowUp {
  id: string;
  lead_id: string;
  next_action: string;
  due_at: string;
  status: string;
  attempts: number;
  max_attempts: number;
}

interface Appointment {
  id: string;
  lead_id: string;
  requested_at: string;
  scheduled_for: string | null;
  status: string;
  notes: string | null;
}

/** No dedicated single-lead GET route exists — reuses the tenant-scoped leads list and filters client-side, same convention as /app/missions/[missionId]. */
export default function LeadDetailPage() {
  const params = useParams<{ leadId: string }>();
  const leadId = params.leadId;
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [lead, setLead] = useState<LeadSummary | null | undefined>(undefined);
  const [messages, setMessages] = useState<ShadowMessage[] | null | "forbidden">(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [followUpAction, setFollowUpAction] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [appointmentTime, setAppointmentTime] = useState("");
  const [savingAppointment, setSavingAppointment] = useState(false);

  async function load() {
    if (!tenantId) return;
    setError(null);
    setLead(undefined);

    const [leadsRes, messagesRes, followUpsRes, appointmentsRes] = await Promise.all([
      fetch(`/api/platform/leads?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/whatsapp/shadow-messages?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/crm/follow-ups?tenantId=${encodeURIComponent(tenantId)}`),
      fetch(`/api/platform/crm/appointments?tenantId=${encodeURIComponent(tenantId)}`),
    ]);
    const leadsBody = await leadsRes.json();
    if (!leadsRes.ok) {
      setError(leadsBody.error ?? `Failed to load lead (HTTP ${leadsRes.status})`);
      return;
    }
    const found = (leadsBody.leads as LeadSummary[]).find((l) => l.id === leadId) ?? null;
    setLead(found);
    setNotesDraft(found?.notes ?? "");

    if (messagesRes.status === 403) {
      setMessages("forbidden");
    } else {
      const messagesBody = await messagesRes.json();
      if (messagesRes.ok) setMessages((messagesBody.messages as ShadowMessage[]).filter((m) => m.lead_id === leadId));
    }

    if (followUpsRes.ok) setFollowUps(((await followUpsRes.json()).followUps as FollowUp[]).filter((f) => f.lead_id === leadId));
    if (appointmentsRes.ok) setAppointments(((await appointmentsRes.json()).appointments as Appointment[]).filter((a) => a.lead_id === leadId));
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

  async function saveNotes() {
    if (!tenantId || !lead) return;
    setSavingNotes(true);
    try {
      await fetch(`/api/platform/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, notes: notesDraft }),
      });
      await load();
    } finally {
      setSavingNotes(false);
    }
  }

  async function assignToMe() {
    if (!tenantId || !lead) return;
    await fetch(`/api/platform/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId, assignedTo: "self" }),
    });
    await load();
  }

  async function addFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !lead || !followUpAction.trim() || !followUpDue) return;
    setSavingFollowUp(true);
    try {
      await fetch("/api/platform/crm/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, leadId: lead.id, nextAction: followUpAction, dueAt: new Date(followUpDue).toISOString() }),
      });
      setFollowUpAction("");
      setFollowUpDue("");
      await load();
    } finally {
      setSavingFollowUp(false);
    }
  }

  async function requestAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !lead) return;
    setSavingAppointment(true);
    try {
      await fetch("/api/platform/crm/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, leadId: lead.id, requestedFor: appointmentTime ? new Date(appointmentTime).toISOString() : undefined }),
      });
      setAppointmentTime("");
      await load();
    } finally {
      setSavingAppointment(false);
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
              <span>{lead.assigned_to ? "Assigned" : <button onClick={assignToMe} className="text-sx-accent hover:underline">Assign to me</button>}</span>
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Last interaction</span>
              <span>{lead.last_interaction_at ? new Date(lead.last_interaction_at).toLocaleString() : "—"}</span>
            </CardRow>
            <CardRow>
              <span className="text-sx-text-muted">Received</span>
              <span>{new Date(lead.created_at).toLocaleString()}</span>
            </CardRow>
          </Card>

          <Card>
            <CardHeading>Notes</CardHeading>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs text-sx-text"
              placeholder="Internal notes about this lead…"
            />
            <Button className="mt-2" size="sm" variant="secondary" onClick={saveNotes} disabled={savingNotes}>
              {savingNotes ? "Saving…" : "Save notes"}
            </Button>
          </Card>

          <div>
            <Button variant="primary" size="sm" onClick={startFollowUpMission} disabled={starting}>
              {starting ? "Starting…" : "Start follow-up / proposal mission"}
            </Button>
          </div>

          <Card>
            <CardHeading>Follow-ups</CardHeading>
            {followUps.length === 0 ? (
              <p className="mt-2 text-xs text-sx-text-subtle">No follow-ups scheduled.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {followUps.map((f) => (
                  <CardRow key={f.id}>
                    <span className="min-w-0 flex-1 truncate text-sx-text-muted">{f.next_action}</span>
                    <span className="shrink-0 text-[10.5px] text-sx-text-subtle">
                      {new Date(f.due_at).toLocaleString()} · {f.status} ({f.attempts}/{f.max_attempts})
                    </span>
                  </CardRow>
                ))}
              </div>
            )}
            <form onSubmit={addFollowUp} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input value={followUpAction} onChange={(e) => setFollowUpAction(e.target.value)} placeholder="Next action (e.g. call to confirm)" className="flex-1" />
              <input
                type="datetime-local"
                value={followUpDue}
                onChange={(e) => setFollowUpDue(e.target.value)}
                className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs text-sx-text"
              />
              <Button type="submit" size="sm" disabled={savingFollowUp || !followUpAction.trim() || !followUpDue}>
                {savingFollowUp ? "Adding…" : "Schedule"}
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeading>Appointments</CardHeading>
            <p className="text-[11px] text-sx-text-subtle">Stratxcel-internal scheduling only — not synced to an external calendar.</p>
            {appointments.length === 0 ? (
              <p className="mt-2 text-xs text-sx-text-subtle">No appointments yet.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                {appointments.map((a) => (
                  <CardRow key={a.id}>
                    <span className="text-sx-text-muted">{a.scheduled_for ? new Date(a.scheduled_for).toLocaleString() : "Time not yet set"}</span>
                    <StatusChip state={a.status === "confirmed" ? "success" : a.status === "cancelled" ? "neutral" : "warning"}>{a.status}</StatusChip>
                  </CardRow>
                ))}
              </div>
            )}
            <form onSubmit={requestAppointment} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="datetime-local"
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs text-sx-text"
              />
              <Button type="submit" size="sm" disabled={savingAppointment}>
                {savingAppointment ? "Requesting…" : "Request appointment"}
              </Button>
            </form>
          </Card>

          <section className="flex flex-col gap-3">
            <h2 className="font-sx-sans text-base font-medium text-sx-text">Conversation (proposed replies — shadow mode)</h2>
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
