import type { AuditCategoryScoreKey, AuditCategoryScore } from "./customer-state.ts";

/**
 * Final Customer Experience Repair mission, Section 4 (Audit Service
 * Auto-Preselection). Maps the audit engine's own real 8 categories
 * (packages/audit-engine/src/live.ts's structured-output schema) to the
 * EXISTING "what do you want help with" vocabulary this codebase already
 * has (app/app/onboarding/steps/StepGoals.tsx's BUSINESS_GOALS) rather
 * than inventing a second, parallel services taxonomy. Deliberately not
 * 1:1 for every category: brandPositioning and customerJourney have no
 * honest match among the 6 real goal keys, so a weak score there simply
 * recommends nothing here rather than forcing a bad-fit suggestion.
 */
export const CATEGORY_TO_GOAL_KEY: Partial<Record<AuditCategoryScoreKey, string>> = {
  discoverabilitySeo: "google_visibility",
  websiteConversion: "website_conversion",
  socialContent: "social_presence",
  leadGeneration: "lead_followup",
  trustReputation: "local_customers",
  automationOperations: "whatsapp_leads",
};

/** Matches ScoreFirstReport.tsx's own scoreBand threshold, so "recommended here" and "shown as weak/needs work there" always agree. */
export const WEAK_SCORE_THRESHOLD = 70;

/**
 * Real, evidence-based recommendation: a goal key is preselected only when
 * its mapped category has a real score below the threshold. A missing
 * score (null -- not enough evidence) never recommends anything, matching
 * "never recommend something unsupported by the audit."
 */
export function recommendGoalKeysFromCategoryScores(
  categoryScores: Partial<Record<AuditCategoryScoreKey, AuditCategoryScore>> | null | undefined,
): string[] {
  if (!categoryScores) return [];
  const recommended: string[] = [];
  for (const [category, goalKey] of Object.entries(CATEGORY_TO_GOAL_KEY) as [AuditCategoryScoreKey, string][]) {
    const score = categoryScores[category]?.score;
    if (typeof score === "number" && score < WEAK_SCORE_THRESHOLD) recommended.push(goalKey);
  }
  return recommended;
}
