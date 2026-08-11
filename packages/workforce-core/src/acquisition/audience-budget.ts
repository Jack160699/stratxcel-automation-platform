import type { MissionBudgetEnvelope } from "../budgets/hierarchy.ts";
import { remainingBudget } from "../budgets/hierarchy.ts";
import type { AudienceHypothesis, BudgetProposal, PaidAcquisitionSignals } from "./types.ts";

const SENSITIVE_INTEREST_PATTERNS =
  /\b(health|medical|disease|religion|political|sexual|dating|financial status|credit score|race|ethnicity)\b/i;

/** Audience hypotheses only when platform/account could support them. No sensitive targeting. */
export function buildAudienceHypotheses(input: {
  signals: PaidAcquisitionSignals;
  targetAudience?: string;
  hasFirstPartyList?: boolean;
  hasSitePixelOrEvents?: boolean;
  evidenceIds?: readonly string[];
}): AudienceHypothesis[] {
  const platforms = input.signals.adPlatforms ?? [];
  const connected = input.signals.adAccountConnected === true;
  const evidenceIds = input.evidenceIds ?? input.signals.evidenceIds ?? [];
  const sensitive = !!input.targetAudience && SENSITIVE_INTEREST_PATTERNS.test(input.targetAudience);

  return [
    {
      kind: "first_party",
      label: "First-party customer/lead list",
      eligible: input.hasFirstPartyList === true,
      platformSupported: connected && platforms.length > 0,
      reason: input.hasFirstPartyList
        ? "First-party audience available for planning"
        : "No first-party list evidenced — do not invent one",
      sensitiveTargetingRisk: false,
      evidenceIds,
    },
    {
      kind: "retargeting",
      label: "Site/app retargeting",
      eligible: input.hasSitePixelOrEvents === true,
      platformSupported: connected && (platforms.includes("meta") || platforms.includes("google")),
      reason: input.hasSitePixelOrEvents
        ? "Tracking events may support retargeting once account is connected"
        : "Retargeting requires evidenced pixel/events and connected account",
      sensitiveTargetingRisk: false,
      evidenceIds,
    },
    {
      kind: "lookalike",
      label: "Lookalike / similar audiences",
      eligible: input.hasFirstPartyList === true && connected,
      platformSupported: connected && platforms.includes("meta"),
      reason:
        input.hasFirstPartyList && connected
          ? "Lookalike eligibility depends on provider seed quality after connection"
          : "Lookalike requires connected Meta-class account and seed audience",
      sensitiveTargetingRisk: false,
      evidenceIds,
    },
    {
      kind: "interest_contextual",
      label: sensitive ? "Interest/contextual (blocked — sensitive)" : "Interest / contextual",
      eligible: !sensitive && connected,
      platformSupported: connected && platforms.length > 0,
      reason: sensitive
        ? "Interest targeting rejected — potential sensitive-category violation"
        : connected
          ? "Interest/contextual may be planned within platform policy"
          : "Requires connected ad account; no sensitive categories",
      sensitiveTargetingRisk: sensitive,
      evidenceIds,
    },
    {
      kind: "search_intent",
      label: "Search intent keywords",
      eligible: platforms.includes("google") || platforms.length === 0,
      platformSupported: platforms.includes("google") || !connected,
      reason: platforms.includes("google")
        ? "Search intent targeting is eligible for Google Ads planning"
        : "Search intent can be planned; execution requires Google Ads account",
      sensitiveTargetingRisk: false,
      evidenceIds,
    },
  ];
}

/** Budget proposal from supported inputs only. No fabricated CPC/CPA. Never exceeds envelope. */
export function proposeCampaignBudget(input: {
  missionBudget: MissionBudgetEnvelope;
  policyMaxCents?: number | null;
  requestedMaxCents?: number | null;
  evidenceIds?: readonly string[];
  hasPerformanceEvidence?: boolean;
}): BudgetProposal {
  const envelope = remainingBudget(input.missionBudget);
  const policyCap =
    typeof input.policyMaxCents === "number" && input.policyMaxCents >= 0 ? input.policyMaxCents : null;
  const envelopeCap = policyCap == null ? envelope : Math.min(envelope, policyCap);
  const assumptions: string[] = [];
  if (!input.hasPerformanceEvidence) {
    assumptions.push(
      "No historical CPC/CPA evidence — ranges are envelope-bounded planning placeholders, not predictions",
    );
  }
  assumptions.push("Proposal does not authorize spend, publish, or billing mutation");

  let proposedMax: number | null = null;
  let proposedMin: number | null = null;
  if (envelopeCap <= 0) {
    assumptions.push("Mission/commercial envelope has no remaining budget capacity");
    proposedMax = 0;
    proposedMin = 0;
  } else if (typeof input.requestedMaxCents === "number") {
    proposedMax = Math.min(input.requestedMaxCents, envelopeCap);
    proposedMin = Math.min(Math.floor(proposedMax * 0.25), proposedMax);
    if (input.requestedMaxCents > envelopeCap) {
      assumptions.push(`Requested max ${input.requestedMaxCents} capped to envelope ${envelopeCap}`);
    }
  } else {
    assumptions.push("No requested budget — suggesting a conservative fraction of remaining envelope");
    proposedMax = Math.floor(envelopeCap * 0.2);
    proposedMin = Math.floor(proposedMax * 0.25);
  }

  return {
    currency: "INR",
    proposedMinCents: proposedMin,
    proposedMaxCents: proposedMax,
    envelopeCapCents: envelopeCap,
    withinCommercialEnvelope: proposedMax != null && proposedMax <= envelopeCap && proposedMax >= 0,
    authorizesSpend: false,
    assumptions,
    evidenceIds: input.evidenceIds ?? [],
    predictedCpcCents: null,
    predictedCpaCents: null,
    notes: "Budget proposal is planning-only and must pass finance clearance before any future spend path",
  };
}

export function assertBudgetWithinEnvelope(proposal: BudgetProposal, envelopeCapCents: number): void {
  if (proposal.proposedMaxCents != null && proposal.proposedMaxCents > envelopeCapCents) {
    throw new Error("budget_proposal_exceeds_commercial_envelope");
  }
}
