/**
 * Audit → package recommendation engine (brief §9–§13).
 *
 * Turns audit signals into "what does this business actually need?" and
 * picks the SMALLEST plan capable of addressing the detected opportunities —
 * never a default upsell to Growth or Business. The shape (signal flags →
 * smallest-covering-tier) is inspired by the unwired
 * packages/workforce-core/src/intelligence/recommendations/commercial-fit.ts
 * bottleneck→domain engine, rewired here against the locked v2 catalog
 * (Starter/Growth/Business) and real audit report fields.
 *
 * This is a best-effort, evidence-based scoring model, not a black box: every
 * input is a concrete, inspectable audit signal, and the four worked examples
 * in brief §22 are covered by unit tests in __tests__/plan-recommendation.test.ts.
 */

export type RecommendedPlanTier = "starter" | "growth" | "business";

export interface PlanRecommendationSignals {
  /** Is a Google Business Profile connected/found for this tenant? */
  googleBusinessConnected: boolean;
  /** 0-100 discoverability/SEO category score, null when the audit couldn't score it. */
  discoverabilitySeoScore: number | null;
  /** Count of named competitors surfaced during research. */
  competitorCount: number;
  /** 0-100 social/content category score, null when unscored. */
  socialContentScore: number | null;
  /** Count of visual/content-shaped opportunities surfaced (carousels, seasonal campaigns, etc). */
  visualContentOpportunityCount: number;
  /** Does the business have a usable website today? */
  hasWebsite: boolean;
  /** 0-100 trust/reputation category score, null when unscored. */
  trustReputationScore: number | null;
  /** Count of HIGH-impact findings/opportunities across the whole report. */
  highImpactFindingCount: number;
}

export interface PlanRecommendation {
  tier: RecommendedPlanTier;
  biggestOpportunity: { title: string; body: string };
  whatStratxcelCanDo: string[];
  why: string;
}

function googleGapScore(signals: PlanRecommendationSignals): number {
  if (!signals.googleBusinessConnected) return 3;
  const seo = signals.discoverabilitySeoScore;
  if (seo == null) return 1;
  if (seo < 40) return 3;
  if (seo < 60) return 2;
  if (seo < 80) return 1;
  return 0;
}

function competitorIntensityScore(count: number): number {
  if (count >= 11) return 3;
  if (count >= 6) return 2;
  if (count >= 3) return 1;
  return 0;
}

function contentOpportunityScore(signals: PlanRecommendationSignals): number {
  const social = signals.socialContentScore;
  let score = 0;
  if (social == null) score = 1;
  else if (social < 35) score = 3;
  else if (social < 55) score = 2;
  else if (social < 75) score = 1;
  if (signals.visualContentOpportunityCount >= 4) score = Math.max(score, 2);
  if (signals.visualContentOpportunityCount >= 8) score = 3;
  return score;
}

function websiteGapScore(signals: PlanRecommendationSignals): number {
  return signals.hasWebsite ? 0 : 2;
}

function reputationGapScore(signals: PlanRecommendationSignals): number {
  const trust = signals.trustReputationScore;
  if (trust == null) return 0;
  if (trust < 40) return 2;
  if (trust < 60) return 1;
  return 0;
}

function automationSignalScore(signals: PlanRecommendationSignals): number {
  if (signals.highImpactFindingCount >= 6) return 2;
  if (signals.highImpactFindingCount >= 3) return 1;
  return 0;
}

/** Total opportunity intensity, 0–15 — used only to rank the "biggest opportunity" headline, not to size the plan (see decideTier). Higher = more evidence of an unaddressed problem. */
export function opportunityIntensityScore(signals: PlanRecommendationSignals): number {
  return (
    googleGapScore(signals) +
    competitorIntensityScore(signals.competitorCount) +
    contentOpportunityScore(signals) +
    websiteGapScore(signals) +
    reputationGapScore(signals) +
    automationSignalScore(signals)
  );
}

/**
 * Plan sizing (brief §9–§10): every plan does Google Growth, so Google-gap
 * severity alone never escalates the tier — a pure Google-visibility problem
 * is exactly what Starter is for (§11's worked example). Growth is triggered
 * by real execution load beyond Google alone: real competitive pressure,
 * meaningfully weak content/social presence, or reputation risk. Business
 * requires several severe problems compounding at once (brief §10 Example C
 * lists 5-6 simultaneous issues) — a single severe signal, even a missing
 * website, is not enough on its own.
 */
function decideTier(signals: PlanRecommendationSignals): RecommendedPlanTier {
  const severeGoogleGap = googleGapScore(signals) >= 3;
  const severeCompetition = signals.competitorCount >= 8;
  const severeContent = contentOpportunityScore(signals) >= 3;
  const noWebsite = !signals.hasWebsite;
  const highAutomationDesire = signals.highImpactFindingCount >= 5;
  const businessFlagCount = [severeGoogleGap, severeCompetition, severeContent, noWebsite, highAutomationDesire].filter(Boolean).length;
  if (businessFlagCount >= 3) return "business";

  const growthTrigger = competitorIntensityScore(signals.competitorCount) >= 1
    || contentOpportunityScore(signals) >= 2
    || reputationGapScore(signals) >= 1;
  return growthTrigger ? "growth" : "starter";
}

const WHAT_STRATXCEL_CAN_DO: Record<RecommendedPlanTier, string[]> = {
  starter: [
    "Optimize your Google Business Profile",
    "Identify local search opportunities",
    "Keep your business active with regular Google posts and content",
    "Monitor and reply to reviews",
  ],
  growth: [
    "Run deeper Google Growth: local SEO, keyword research, competitor monitoring",
    "Research, create, schedule and publish content on Social Autopilot",
    "Generate and deploy a high-quality landing page",
    "Keep website content SEO-driven with Google-focused blogs",
  ],
  business: [
    "Run maximum-depth Google Growth and competitor monitoring",
    "Produce premium researched content and campaigns across channels",
    "Run full Social Autopilot with approval workflows where required",
    "Build and deploy a professional website, SEO-ready from day one",
  ],
};

function biggestOpportunityFor(signals: PlanRecommendationSignals): { title: string; body: string } {
  const google = googleGapScore(signals);
  const competitor = competitorIntensityScore(signals.competitorCount);
  const content = contentOpportunityScore(signals);
  const website = websiteGapScore(signals);

  const candidates: Array<{ title: string; body: string; weight: number }> = [
    {
      title: "Google visibility",
      body: signals.googleBusinessConnected
        ? "Your Google Business Profile is incomplete and competitors are appearing for searches you're currently missing."
        : "Google account connected, but no Google Business Profile was found — this is costing you local search visibility.",
      weight: google,
    },
    {
      title: "Competitive pressure",
      body: `${signals.competitorCount} competitors were found actively competing for your customers' searches.`,
      weight: competitor,
    },
    {
      title: "Content consistency",
      body: "Your content and social presence are inconsistent, which weakens both discovery and trust with customers.",
      weight: content,
    },
    {
      title: "Web presence",
      body: "You don't have a website working for you yet — this limits where customers can find and trust your business.",
      weight: website,
    },
  ];

  candidates.sort((a, b) => b.weight - a.weight);
  return { title: candidates[0].title, body: candidates[0].body };
}

function whyForTier(tier: RecommendedPlanTier, signals: PlanRecommendationSignals): string {
  if (tier === "starter") {
    return "Your primary opportunity is Google visibility. You don't currently need advanced social automation or a website — Starter focuses spend where it matters most.";
  }
  if (tier === "growth") {
    const reasons: string[] = [];
    if (competitorIntensityScore(signals.competitorCount) >= 1) reasons.push("deeper competitor research");
    if (googleGapScore(signals) >= 1) reasons.push("more Google SEO work");
    if (contentOpportunityScore(signals) >= 1) reasons.push("more consistent, researched content");
    if (!signals.hasWebsite) reasons.push("a landing page and SEO-driven website updates");
    reasons.push("Social Autopilot");
    return `Your audit found that you need: ${reasons.join(", ")}. So Growth is recommended.`;
  }
  const reasons: string[] = ["deeper ongoing SEO", "premium content", "greater automation"];
  if (!signals.hasWebsite) reasons.push("a professional website");
  reasons.push("larger execution capacity");
  return `Your audit found that you need: ${reasons.join(", ")}. So Business is recommended.`;
}

export function recommendPlan(signals: PlanRecommendationSignals): PlanRecommendation {
  const tier = decideTier(signals);
  return {
    tier,
    biggestOpportunity: biggestOpportunityFor(signals),
    whatStratxcelCanDo: WHAT_STRATXCEL_CAN_DO[tier],
    why: whyForTier(tier, signals),
  };
}

/**
 * Adapter from the loose audit report shape actually produced by the audit
 * pipeline (AuditDeliveryReport plus the extra fields VisualAuditReport.tsx
 * renders — categoryScores, connectorAvailability, competitorSignals,
 * priorityOpportunities, contentCoverage, websiteUrl) into the signal
 * contract above. Deliberately permissive/optional-everything: a report
 * missing a section degrades to a neutral default rather than throwing.
 */
export function deriveSignalsFromReport(report: {
  websiteUrl?: string;
  categoryScores?: {
    discoverabilitySeo?: { score: number | null };
    socialContent?: { score: number | null };
    trustReputation?: { score: number | null };
  };
  connectorAvailability?: Array<{ provider: string; state: string }>;
  competitorSignals?: { knownCompetitors?: string[] };
  whyTheyWin?: unknown[];
  priorityOpportunities?: Array<{ confidence?: string; priority?: number }>;
  opportunities?: unknown[];
  findings?: Array<{ impact?: string }>;
  contentCoverage?: { missingServices?: string[]; missingLocations?: string[]; weakPages?: string[] };
}): PlanRecommendationSignals {
  const googleAvailability = (report.connectorAvailability ?? []).find((c) => c.provider === "google_business");
  const googleBusinessConnected = googleAvailability
    ? googleAvailability.state === "available" || googleAvailability.state === "connected" || googleAvailability.state === "connected_only"
    : Boolean(report.categoryScores?.discoverabilitySeo?.score != null && report.categoryScores.discoverabilitySeo.score > 0);

  const competitorCount = Math.max(
    report.competitorSignals?.knownCompetitors?.length ?? 0,
    Array.isArray(report.whyTheyWin) ? report.whyTheyWin.length : 0,
  );

  const contentGapCount =
    (report.contentCoverage?.missingServices?.length ?? 0) +
    (report.contentCoverage?.missingLocations?.length ?? 0) +
    (report.contentCoverage?.weakPages?.length ?? 0);

  const highImpactFindingCount =
    (report.findings ?? []).filter((f) => f.impact === "HIGH").length +
    (report.priorityOpportunities ?? []).filter((o) => (o.priority ?? 0) >= 4 || o.confidence === "HIGH").length;

  return {
    googleBusinessConnected,
    discoverabilitySeoScore: report.categoryScores?.discoverabilitySeo?.score ?? null,
    competitorCount,
    socialContentScore: report.categoryScores?.socialContent?.score ?? null,
    visualContentOpportunityCount: contentGapCount + (Array.isArray(report.opportunities) ? report.opportunities.length : 0),
    hasWebsite: Boolean(report.websiteUrl),
    trustReputationScore: report.categoryScores?.trustReputation?.score ?? null,
    highImpactFindingCount,
  };
}
