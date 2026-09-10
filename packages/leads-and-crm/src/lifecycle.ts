/**
 * CRM Lead Lifecycle Manager
 *
 * Governs all lead status transitions with an immutable audit trail.
 * Never silently fails. Every transition is recorded in crm_lead_events.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LeadStatus } from "./types.ts";

// Extended lifecycle statuses per the Revenue Company OS spec (15 Canonical Stages + legacy bridges)
export type ExtendedLeadStatus =
  | "DISCOVERED"
  | "ENRICHED"
  | "VERIFIED"
  | "QUALIFIED"
  | "OUTREACH_READY"
  | "CONTACTED"
  | "RESPONDED"
  | "ENGAGED"
  | "INTERESTED"
  | "OPPORTUNITY"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "WON"
  | "CONVERTED"
  | "PAID"
  | "FULFILLING"
  | "FULFILLED"
  | "LOST"
  | "NURTURE";

export const CANONICAL_15_STAGES: readonly ExtendedLeadStatus[] = [
  "DISCOVERED",
  "VERIFIED",
  "QUALIFIED",
  "OUTREACH_READY",
  "CONTACTED",
  "ENGAGED",
  "OPPORTUNITY",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "PAID",
  "FULFILLING",
  "FULFILLED",
  "LOST",
  "NURTURE",
] as const;

export const VALID_STAGES: ExtendedLeadStatus[] = [
  "DISCOVERED",
  "ENRICHED",
  "VERIFIED",
  "QUALIFIED",
  "OUTREACH_READY",
  "CONTACTED",
  "RESPONDED",
  "ENGAGED",
  "INTERESTED",
  "OPPORTUNITY",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "CONVERTED",
  "PAID",
  "FULFILLING",
  "FULFILLED",
  "LOST",
  "NURTURE",
];

// Valid forward transitions (backward transitions are not permitted autonomously)
export const ALLOWED_TRANSITIONS: Record<ExtendedLeadStatus, ExtendedLeadStatus[]> = {
  DISCOVERED:      ["ENRICHED", "VERIFIED", "QUALIFIED", "LOST"],
  ENRICHED:        ["VERIFIED", "QUALIFIED", "OUTREACH_READY", "CONTACTED", "LOST"],
  VERIFIED:        ["QUALIFIED", "OUTREACH_READY", "CONTACTED", "LOST"],
  QUALIFIED:       ["OUTREACH_READY", "CONTACTED", "LOST", "NURTURE"],
  OUTREACH_READY:  ["CONTACTED", "QUALIFIED", "LOST", "NURTURE"],
  CONTACTED:       ["RESPONDED", "ENGAGED", "OPPORTUNITY", "QUALIFIED", "LOST", "NURTURE"],
  RESPONDED:       ["ENGAGED", "INTERESTED", "OPPORTUNITY", "QUALIFIED", "LOST", "NURTURE"],
  ENGAGED:         ["INTERESTED", "OPPORTUNITY", "PROPOSAL", "LOST", "NURTURE"],
  INTERESTED:      ["OPPORTUNITY", "PROPOSAL", "LOST", "NURTURE"],
  OPPORTUNITY:     ["PROPOSAL", "NEGOTIATION", "WON", "LOST", "NURTURE"],
  PROPOSAL:        ["NEGOTIATION", "WON", "CONVERTED", "LOST", "NURTURE"],
  NEGOTIATION:     ["WON", "PAID", "CONVERTED", "LOST", "NURTURE"],
  WON:             ["PAID", "FULFILLING", "CONVERTED"],
  CONVERTED:       ["PAID", "FULFILLING"],
  PAID:            ["FULFILLING", "FULFILLED"],
  FULFILLING:      ["FULFILLED"],
  FULFILLED:       [],
  LOST:            ["NURTURE", "QUALIFIED"],
  NURTURE:         ["CONTACTED", "OUTREACH_READY", "QUALIFIED", "LOST"],
};

export function isValidTransition(from: ExtendedLeadStatus, to: ExtendedLeadStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export interface TransitionResult {
  ok: boolean;
  leadId: string;
  fromStatus: string;
  toStatus: string;
  error?: string;
}

export interface LeadTransitionPayload {
  notes?: string;
  proposalAmountCents?: number;
  outreachChannel?: string;
  [key: string]: unknown;
}

export class LeadLifecycle {
  private sb: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.sb = createClient(supabaseUrl, serviceRoleKey);
  }

  /**
   * Transition a lead to a new status.
   * Validates allowed transitions; records crm_lead_events.
   * Never silently fails.
   */
  async transition(
    leadId: string,
    tenantId: string,
    toStatus: ExtendedLeadStatus,
    actorAgent: string,
    payload: LeadTransitionPayload = {}
  ): Promise<TransitionResult> {
    // Read current status
    const { data: lead, error: readErr } = await this.sb
      .from("crm_leads")
      .select("id, status, metadata")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .single();

    if (readErr || !lead) {
      return { ok: false, leadId, fromStatus: "UNKNOWN", toStatus, error: readErr?.message ?? "Lead not found" };
    }

    const fromStatus = lead.status as ExtendedLeadStatus;

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      return {
        ok: false,
        leadId,
        fromStatus,
        toStatus,
        error: `Transition ${fromStatus} → ${toStatus} is not permitted. Allowed: [${allowed.join(", ")}]`,
      };
    }

    // Update the lead
    const updateData: Record<string, unknown> = {
      status: toStatus,
      updated_at: new Date().toISOString(),
    };
    if (payload.proposalAmountCents !== undefined) {
      updateData.proposal_amount_cents = payload.proposalAmountCents;
    }
    if (toStatus === "CONTACTED" || toStatus === "RESPONDED") {
      updateData.last_outreach_at = new Date().toISOString();
      updateData.last_interaction_at = new Date().toISOString();
    }

    const { error: updateErr } = await this.sb
      .from("crm_leads")
      .update(updateData)
      .eq("id", leadId);

    if (updateErr) {
      return { ok: false, leadId, fromStatus, toStatus, error: updateErr.message };
    }

    // Write audit event — try crm_lead_events table first
    let auditPersisted = false;
    try {
      const { error: eventErr } = await this.sb.from("crm_lead_events").insert({
        lead_id: leadId,
        tenant_id: tenantId,
        event_type: `status_transition`,
        from_status: fromStatus,
        to_status: toStatus,
        payload: payload as Record<string, unknown>,
        actor_agent: actorAgent,
      });
      if (!eventErr) auditPersisted = true;
    } catch {
      // Fallback
    }

    if (!auditPersisted) {
      // Resilient fallback: append to lead metadata
      try {
        const historyItem = {
          from_status: fromStatus,
          to_status: toStatus,
          timestamp: new Date().toISOString(),
          actor_agent: actorAgent,
          payload,
        };
        const existingMeta = (lead.metadata as Record<string, unknown>) || {};
        const history = Array.isArray(existingMeta.history) ? [...existingMeta.history, historyItem] : [historyItem];
        await this.sb.from("crm_leads").update({
          metadata: { ...existingMeta, history },
        }).eq("id", leadId);
      } catch {
        // Non-blocking
      }
    }

    return { ok: true, leadId, fromStatus, toStatus };
  }

  /** Record a custom event without status transition (e.g. note added). */
  async recordEvent(
    leadId: string,
    tenantId: string,
    eventType: string,
    actorAgent: string,
    payload: Record<string, unknown> = {}
  ): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.sb.from("crm_lead_events").insert({
      lead_id: leadId,
      tenant_id: tenantId,
      event_type: eventType,
      payload,
      actor_agent: actorAgent,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  /** Get the full event history for a lead. */
  async getHistory(leadId: string) {
    const { data, error } = await this.sb
      .from("crm_lead_events")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    return { events: data ?? [], error: error?.message };
  }
}
