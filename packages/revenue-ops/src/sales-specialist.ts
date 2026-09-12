/**
 * Sales Specialist Employee
 *
 * Responsible for qualifying leads, drafting outreach, preparing proposals,
 * scheduling follow-ups, and updating CRM stage.
 *
 * POLICY:
 * - Does NOT autonomously send outreach to external parties.
 * - All external communication drafts are artifacts awaiting Founder confirmation.
 * - High-consequence actions (binding commitments, large contracts) are blocked.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface QualificationResult {
  ok: boolean;
  leadId: string;
  qualified: boolean;
  score: number;
  reasoning: string;
  missingCriteria: string[];
}

export interface OutreachDraft {
  channel: "whatsapp" | "email" | "in_person";
  subject?: string;
  body: string;
  followUpDays: number;
  warnings: string[];
}

export interface ProposalDraft {
  leadId: string;
  offerId: string;
  title: string;
  summary: string;
  pricing: Record<string, unknown>;
  terms: string;
  validUntilDays: number;
  amountCents: number;
}

export class SalesSpecialist {
  private sb: SupabaseClient;
  private agentId = "sales_specialist";

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.sb = createClient(supabaseUrl, serviceRoleKey);
  }

  /**
   * Qualify a lead against the offer's ICP criteria.
   * Returns a score and reasoning. Never invents data.
   */
  async qualifyLead(
    leadId: string,
    tenantId: string,
    offerId: string
  ): Promise<QualificationResult> {
    // Read lead
    const { data: lead, error: leadErr } = await this.sb
      .from("crm_leads")
      .select("*")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .single();
    if (leadErr || !lead) {
      return { ok: false, leadId, qualified: false, score: 0, reasoning: leadErr?.message ?? "Lead not found", missingCriteria: [] };
    }

    // Read offer ICP criteria
    const { data: offer, error: offerErr } = await this.sb
      .from("company_offers")
      .select("lead_qualification_criteria, target_customer, geography")
      .eq("id", offerId)
      .single();
    if (offerErr || !offer) {
      return { ok: false, leadId, qualified: false, score: 0, reasoning: "Offer not found", missingCriteria: [] };
    }

    // Score based on available data (no fabrication — only real fields)
    let score = 0;
    const missingCriteria: string[] = [];
    const reasoning: string[] = [];

    if (lead.contact_name) { score += 20; reasoning.push("Has contact name"); }
    else missingCriteria.push("contact_name");

    if (lead.contact_phone || lead.contact_email) { score += 20; reasoning.push("Has contact info"); }
    else missingCriteria.push("contact_phone or contact_email");

    if (lead.icp_match_score != null) {
      score += Math.round(lead.icp_match_score * 0.4);
      reasoning.push(`ICP match score: ${lead.icp_match_score}/100`);
    } else {
      missingCriteria.push("icp_match_score not assessed");
    }

    if (lead.market_segment) { score += 10; reasoning.push(`Market: ${lead.market_segment}`); }
    if (lead.company_name) { score += 10; reasoning.push(`Company: ${lead.company_name}`); }

    const qualified = score >= 50;

    return {
      ok: true,
      leadId,
      qualified,
      score,
      reasoning: reasoning.join(". "),
      missingCriteria,
    };
  }

  /**
   * Draft a personalized outreach message from offer pitch + approved claims.
   * Returns a DRAFT — does NOT send. Requires Founder confirmation to send.
   */
  async draftOutreach(
    leadId: string,
    tenantId: string,
    offerId: string,
    channel: "whatsapp" | "email" = "whatsapp"
  ): Promise<{ ok: boolean; draft?: OutreachDraft; error?: string }> {
    const { data: lead } = await this.sb
      .from("crm_leads")
      .select("contact_name, company_name, market_segment, notes")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .single();

    const { data: offer } = await this.sb
      .from("company_offers")
      .select("name, sales_pitch, approved_claims, objections_json")
      .eq("id", offerId)
      .single();

    if (!lead || !offer) {
      return { ok: false, error: "Lead or offer not found" };
    }

    const name = lead.contact_name ?? "there";
    const pitch = offer.sales_pitch ?? `We offer ${offer.name}.`;
    const claims = (offer.approved_claims ?? []).slice(0, 2).join(" ");

    const body = channel === "whatsapp"
      ? `Hi ${name},\n\n${pitch}\n\n${claims}\n\nWould you be open to a quick call to discuss?\n\n[DRAFT — requires Founder review before sending]`
      : `Subject: ${offer.name} — Could this help ${lead.company_name ?? "your business"}?\n\nHi ${name},\n\n${pitch}\n\n${claims}\n\nI would love to connect.\n\n[DRAFT — requires Founder review before sending]`;

    // Write as mission artifact — NOT sent
    await this.sb.from("mission_artifacts").insert({
      mission_id: null,
      kind: "outreach_draft",
      metadata: {
        lead_id: leadId,
        offer_id: offerId,
        channel,
        status: "DRAFT_AWAITING_APPROVAL",
        body,
      },
    });

    return {
      ok: true,
      draft: {
        channel,
        body,
        followUpDays: 3,
        warnings: ["DRAFT ONLY — external send requires Founder confirmation"],
      },
    };
  }

  /**
   * Prepare a proposal and record it in mission_artifacts.
   * Does NOT commit any binding terms.
   */
  async prepareProposal(
    leadId: string,
    tenantId: string,
    offerId: string
  ): Promise<{ ok: boolean; proposal?: ProposalDraft; artifactId?: string; error?: string }> {
    const { data: offer } = await this.sb
      .from("company_offers")
      .select("name, description, pricing_json, fulfillment_process, sales_cycle_days")
      .eq("id", offerId)
      .single();
    if (!offer) return { ok: false, error: "Offer not found" };

    const pricing = offer.pricing_json as { amount?: number; currency?: string; type?: string } ?? {};
    const amountCents = typeof pricing.amount === "number" ? pricing.amount * 100 : 0;

    const proposal: ProposalDraft = {
      leadId,
      offerId,
      title: `Proposal: ${offer.name}`,
      summary: offer.description ?? "",
      pricing: pricing,
      terms: offer.fulfillment_process ?? "As per standard terms.",
      validUntilDays: offer.sales_cycle_days ?? 30,
      amountCents,
    };

    const { data: artifact, error } = await this.sb
      .from("mission_artifacts")
      .insert({
        mission_id: null,
        kind: "proposal_draft",
        metadata: { ...proposal, status: "DRAFT", lead_id: leadId, offer_id: offerId },
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, proposal, artifactId: artifact.id };
  }

  /** Schedule a follow-up on a lead. */
  async scheduleFollowUp(
    leadId: string,
    tenantId: string,
    daysFromNow: number
  ): Promise<{ ok: boolean; scheduledAt?: string; error?: string }> {
    const followUpAt = new Date(Date.now() + daysFromNow * 86400000).toISOString();
    const { error } = await this.sb
      .from("crm_leads")
      .update({ next_follow_up_at: followUpAt, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("tenant_id", tenantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, scheduledAt: followUpAt };
  }
}
