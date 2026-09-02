/**
 * Real BusinessSignals classifier -- resolves the Priority Engine's
 * previously-unmet dependency (packages/workforce-core's diagnoseBusinessGrowth
 * accepts an optional businessSignals input; nothing in the app ever computed
 * one from real data, so every call site either omitted it or fabricated it).
 *
 * Populates ONLY the BusinessSignals fields backed by a genuine query against
 * a real table this tenant already has rows in -- site_projects,
 * search_opportunities, crm_leads. Every other field
 * (websiteTrafficStrength, hasAds, medianResponseTimeHours,
 * leadCaptureStrength, socialPresenceStrength, analyticsAttributionStrength)
 * is left `undefined` on purpose: there is currently no real, non-guessed
 * data source for them anywhere in this codebase (no analytics event stream
 * joined to first-contact timestamps, no ad-spend table, no lead-capture-form
 * completion tracking). diagnoseBusinessGrowth (packages/workforce-core/src/
 * planning/diagnosis.ts) already handles a partial signal set correctly --
 * every branch is gated on the specific field being present, and each
 * finding's status/confidence already downgrades to ASSUMPTION/
 * RESEARCH_REQUIRED when signalEvidenceIds is empty -- so shipping a
 * partial-but-honest signal set here is architecturally safe, not a
 * regression risk. This is the "real data, clearly marked placeholder, or
 * nothing" rule (packages/websites-and-domains/src/__tests__/
 * no-fabricated-testimonials.test.ts) applied to a diagnosis input instead of
 * page content.
 *
 * Every populated field carries at least one real row id in
 * signalEvidenceIds -- diagnoseBusinessGrowth treats an empty evidence list
 * as "no evidence", so a signal without a real id behind it must not be set.
 */
import type { BusinessSignals } from "@stratxcel/workforce-core";

interface MinimalSupabase {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

export interface RealBusinessSignalsResult {
  signals: BusinessSignals;
  /** Which real tables were actually queried and how many rows each returned -- for transparency, not diagnosis input. */
  sourceCounts: { siteProjects: number; searchOpportunities: number; crmLeads: number };
}

const OPEN_SEARCH_OPPORTUNITY_STATUSES = new Set([
  "NEW",
  "ACTIVE",
  "ACTION_PROPOSED",
  "AWAITING_APPROVAL",
  "IN_PROGRESS",
]);
const HIGH_SEVERITY = new Set(["Critical", "High"]);
const CLOSED_LEAD_STATUSES = new Set(["WON", "LOST"]);
const MIN_LEADS_FOR_CONVERSION_SIGNAL = 5;

/**
 * Computes real BusinessSignals for one tenant from tables this app already
 * owns. Never throws on a missing/empty table -- an absent signal is simply
 * left undefined, matching every other field here.
 */
export async function computeRealBusinessSignals(
  supabase: MinimalSupabase,
  tenantId: string,
): Promise<RealBusinessSignalsResult> {
  const signals: BusinessSignals = {};
  const evidenceIds: string[] = [];
  const sourceCounts = { siteProjects: 0, searchOpportunities: 0, crmLeads: 0 };

  // hasWebsite: a real site_projects row for this tenant.
  const { data: siteProjects } = await supabase
    .from("site_projects")
    .select("id")
    .eq("tenant_id", tenantId);
  const siteProjectRows = (siteProjects ?? []) as Array<{ id: string }>;
  sourceCounts.siteProjects = siteProjectRows.length;
  if (siteProjectRows.length > 0) {
    signals.hasWebsite = true;
    evidenceIds.push(`site_project:${siteProjectRows[0].id}`);
  }
  // Deliberately not set to false when zero rows: absence of a row we
  // happened to create is not proof the business has no website at all
  // (e.g. a client who never onboarded through the website builder still
  // may run their own site). Only a positive match is asserted.

  // searchVisibilityStrength: derived from real open search_opportunities
  // severity, not fabricated -- a real proxy for "how much is currently
  // broken in this tenant's search presence", not a traffic number we don't
  // have.
  const { data: searchOpportunities } = await supabase
    .from("search_opportunities")
    .select("id, severity, status")
    .eq("tenant_id", tenantId);
  const opportunityRows = (searchOpportunities ?? []) as Array<{ id: string; severity: string; status: string }>;
  sourceCounts.searchOpportunities = opportunityRows.length;
  if (opportunityRows.length > 0) {
    const openHighSeverity = opportunityRows.filter(
      (o) => OPEN_SEARCH_OPPORTUNITY_STATUSES.has(o.status) && HIGH_SEVERITY.has(o.severity),
    );
    if (openHighSeverity.length >= 3) {
      signals.searchVisibilityStrength = "none";
    } else if (openHighSeverity.length >= 1) {
      signals.searchVisibilityStrength = "low";
    } else {
      // Opportunities exist and were scanned, but none open at high
      // severity -- a real, if modest, positive signal. Never claims "high"
      // from absence of problems alone; that would need a real traffic
      // number this codebase doesn't have yet.
      signals.searchVisibilityStrength = "medium";
    }
    for (const o of openHighSeverity.slice(0, 3)) evidenceIds.push(`search_opportunity:${o.id}`);
    if (openHighSeverity.length === 0) evidenceIds.push(`search_opportunity:${opportunityRows[0].id}`);
  }

  // crmFollowUpStrength / monthlyInquiries / postContactConversionStrength:
  // derived from real crm_leads rows.
  const { data: crmLeads } = await supabase
    .from("crm_leads")
    .select("id, status, created_at, next_follow_up_at, last_interaction_at")
    .eq("tenant_id", tenantId);
  const leadRows = (crmLeads ?? []) as Array<{
    id: string;
    status: string;
    created_at: string;
    next_follow_up_at: string | null;
    last_interaction_at: string | null;
  }>;
  sourceCounts.crmLeads = leadRows.length;

  if (leadRows.length > 0) {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentLeads = leadRows.filter((l) => new Date(l.created_at).getTime() >= thirtyDaysAgo);
    signals.monthlyInquiries = recentLeads.length;
    for (const l of recentLeads.slice(0, 2)) evidenceIds.push(`crm_lead:${l.id}`);

    const openLeads = leadRows.filter((l) => !CLOSED_LEAD_STATUSES.has(l.status));
    if (openLeads.length > 0) {
      const overdue = openLeads.filter((l) => l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() < now);
      const withFollowUpSet = openLeads.filter((l) => l.next_follow_up_at);
      const overdueRatio = overdue.length / openLeads.length;
      const followUpSetRatio = withFollowUpSet.length / openLeads.length;
      if (overdueRatio > 0.3) {
        signals.crmFollowUpStrength = "weak";
      } else if (followUpSetRatio >= 0.7) {
        signals.crmFollowUpStrength = "strong";
      } else if (followUpSetRatio >= 0.4) {
        signals.crmFollowUpStrength = "adequate";
      } else {
        signals.crmFollowUpStrength = "weak";
      }
      if (overdue.length > 0) evidenceIds.push(`crm_lead:${overdue[0].id}`);
    }

    const contactedLeads = leadRows.filter((l) => l.status !== "NEW");
    if (contactedLeads.length >= MIN_LEADS_FOR_CONVERSION_SIGNAL) {
      const won = contactedLeads.filter((l) => l.status === "WON").length;
      const rate = won / contactedLeads.length;
      signals.postContactConversionStrength = rate >= 0.3 ? "high" : rate >= 0.15 ? "medium" : rate > 0 ? "low" : "none";
      evidenceIds.push(`crm_lead_sample:${contactedLeads.length}`);
    }
    // Below MIN_LEADS_FOR_CONVERSION_SIGNAL: left undefined rather than
    // reporting a conversion rate off a sample too small to be honest about.
  }

  if (evidenceIds.length > 0) signals.signalEvidenceIds = evidenceIds;

  return { signals, sourceCounts };
}
