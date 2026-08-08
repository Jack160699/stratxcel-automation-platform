"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { StatusChip } from "@/components/ui/StatusChip";
import { LEAD_STATUS_LABEL, PIPELINE_STAGES, type Appointment, type CrmLead, type FollowUp, type LeadStatus } from "./types";

/**
 * Compact right rail — replaces the previous five-stacked-cards lead page.
 * One thing at a time, everything reachable without leaving the
 * conversation (docs/product-design/SHARED_SHELL_SPECIFICATION.md §4's
 * "right context panel" pattern, applied to a selected lead instead of a
 * selected record elsewhere in the product). Shows only the NEXT follow-up
 * and appointment, not full history — deliberately, per the design brief.
 */
export function LeadDetailsPanel({
  lead,
  followUps,
  appointments,
  canManage,
  onClose,
  onUpdateStatus,
  onSaveNotes,
  onAssignToMe,
  onScheduleFollowUp,
  onScheduleAppointment,
}: {
  lead: CrmLead;
  followUps: FollowUp[];
  appointments: Appointment[];
  canManage: boolean;
  onClose: () => void;
  onUpdateStatus: (status: LeadStatus) => Promise<void>;
  onSaveNotes: (notes: string) => Promise<void>;
  onAssignToMe: () => Promise<void>;
  onScheduleFollowUp: (nextAction: string, dueAt: string) => Promise<void>;
  onScheduleAppointment: (requestedFor: string) => Promise<void>;
}) {
  const [notesDraft, setNotesDraft] = useState(lead.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpAction, setFollowUpAction] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [appointmentTime, setAppointmentTime] = useState("");
  const [savingAppointment, setSavingAppointment] = useState(false);

  useEffect(() => {
    setNotesDraft(lead.notes ?? "");
  }, [lead.id, lead.notes]);

  const nextFollowUp = followUps.find((f) => f.status !== "completed" && f.status !== "cancelled") ?? followUps[0] ?? null;
  const nextAppointment = appointments.find((a) => a.status !== "cancelled") ?? appointments[0] ?? null;

  return (
    <div className="flex h-full flex-col border-l border-sx-border bg-sx-surface-1">
      <div className="flex shrink-0 items-center justify-between border-b border-sx-border px-4 py-3">
        <h2 className="font-sx-sans text-[13px] font-semibold uppercase tracking-[0.06em] text-sx-text-muted">Details</h2>
        <button onClick={onClose} aria-label="Hide details panel" className="text-sx-text-subtle hover:text-sx-text">
          ✕
        </button>
      </div>

      <div className="sx-thin-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
        <Section title="Contact">
          <Row label="Name" value={lead.contact_name ?? "—"} />
          <Row label="Phone" value={lead.contact_phone ?? "—"} />
          <Row label="Email" value={lead.contact_email ?? "—"} />
        </Section>

        <Section title="Pipeline">
          <div className="flex flex-wrap gap-1.5">
            {PIPELINE_STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                disabled={!canManage || statusSaving || lead.status === stage}
                onClick={async () => {
                  setStatusSaving(true);
                  try {
                    await onUpdateStatus(stage);
                  } finally {
                    setStatusSaving(false);
                  }
                }}
                className={`rounded-sx-pill px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed ${
                  lead.status === stage ? "bg-sx-accent-muted text-sx-accent" : "border border-sx-border-strong bg-sx-surface-2 text-sx-text-muted hover:bg-sx-elevated hover:text-sx-text"
                }`}
              >
                {LEAD_STATUS_LABEL[stage]}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[12px]">
            <span className="text-sx-text-muted">Owner</span>
            {lead.assigned_to ? (
              <StatusChip state="neutral" dot={false} className="h-5 px-2 text-[10px]">
                Assigned
              </StatusChip>
            ) : canManage ? (
              <button onClick={onAssignToMe} className="text-sx-accent hover:underline">
                Assign to me
              </button>
            ) : (
              <span className="text-sx-text-subtle">Unassigned</span>
            )}
          </div>
        </Section>

        {lead.tags.length > 0 && (
          <Section title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {lead.tags.map((tag) => (
                <span key={tag} className="rounded-sx-pill bg-sx-surface-2 px-2 py-0.5 text-[10.5px] text-sx-text-muted">
                  {tag}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Notes">
          <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} disabled={!canManage} rows={3} placeholder="Internal notes about this lead…" className="text-[12.5px]" />
          {canManage && notesDraft !== (lead.notes ?? "") && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-1.5"
              disabled={savingNotes}
              onClick={async () => {
                setSavingNotes(true);
                try {
                  await onSaveNotes(notesDraft);
                } finally {
                  setSavingNotes(false);
                }
              }}
            >
              {savingNotes ? "Saving…" : "Save notes"}
            </Button>
          )}
        </Section>

        <Section title="Follow-up">
          {nextFollowUp ? (
            <div className="rounded-sx-sm bg-sx-surface-2 px-2.5 py-2 text-[12px]">
              <p className="text-sx-text">{nextFollowUp.next_action}</p>
              <p className="mt-0.5 text-[10.5px] text-sx-text-subtle">
                {new Date(nextFollowUp.due_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {nextFollowUp.status}
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-sx-text-subtle">None scheduled.</p>
          )}
          {canManage &&
            (showFollowUpForm ? (
              <div className="mt-2 flex flex-col gap-1.5">
                <Input value={followUpAction} onChange={(e) => setFollowUpAction(e.target.value)} placeholder="Next action" className="h-8 text-[12px]" />
                <input
                  type="datetime-local"
                  value={followUpDue}
                  onChange={(e) => setFollowUpDue(e.target.value)}
                  className="h-8 rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-2.5 text-[12px] text-sx-text"
                />
                <Button
                  size="sm"
                  disabled={savingFollowUp || !followUpAction.trim() || !followUpDue}
                  onClick={async () => {
                    setSavingFollowUp(true);
                    try {
                      await onScheduleFollowUp(followUpAction, new Date(followUpDue).toISOString());
                      setFollowUpAction("");
                      setFollowUpDue("");
                      setShowFollowUpForm(false);
                    } finally {
                      setSavingFollowUp(false);
                    }
                  }}
                >
                  {savingFollowUp ? "Scheduling…" : "Schedule"}
                </Button>
              </div>
            ) : (
              <button onClick={() => setShowFollowUpForm(true)} className="mt-1.5 text-[11.5px] text-sx-accent hover:underline">
                + Add follow-up
              </button>
            ))}
        </Section>

        <Section title="Appointment">
          {nextAppointment ? (
            <div className="flex items-center justify-between rounded-sx-sm bg-sx-surface-2 px-2.5 py-2 text-[12px]">
              <span className="text-sx-text">{nextAppointment.scheduled_for ? new Date(nextAppointment.scheduled_for).toLocaleString() : "Time not yet set"}</span>
              <StatusChip state={nextAppointment.status === "confirmed" ? "success" : nextAppointment.status === "cancelled" ? "neutral" : "warning"} dot={false} className="h-5 px-2 text-[10px]">
                {nextAppointment.status}
              </StatusChip>
            </div>
          ) : (
            <p className="text-[12px] text-sx-text-subtle">None scheduled.</p>
          )}
          {canManage &&
            (showAppointmentForm ? (
              <div className="mt-2 flex flex-col gap-1.5">
                <input
                  type="datetime-local"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className="h-8 rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-2.5 text-[12px] text-sx-text"
                />
                <Button
                  size="sm"
                  disabled={savingAppointment}
                  onClick={async () => {
                    setSavingAppointment(true);
                    try {
                      await onScheduleAppointment(appointmentTime ? new Date(appointmentTime).toISOString() : "");
                      setAppointmentTime("");
                      setShowAppointmentForm(false);
                    } finally {
                      setSavingAppointment(false);
                    }
                  }}
                >
                  {savingAppointment ? "Requesting…" : "Request"}
                </Button>
              </div>
            ) : (
              <button onClick={() => setShowAppointmentForm(true)} className="mt-1.5 text-[11.5px] text-sx-accent hover:underline">
                + Schedule
              </button>
            ))}
        </Section>

        <Section title="Activity">
          <Row label="Source" value={lead.source} />
          <Row label="Received" value={new Date(lead.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} />
          <Row label="Last interaction" value={lead.last_interaction_at ? new Date(lead.last_interaction_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-1.5 font-sx-mono text-[9.5px] uppercase tracking-[0.12em] text-sx-text-subtle">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
      <span className="text-sx-text-muted">{label}</span>
      <span className="truncate text-sx-text">{value}</span>
    </div>
  );
}
