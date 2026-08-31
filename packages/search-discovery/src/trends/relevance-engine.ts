import type { TrendCandidate, TrendDecision, TrendRelevanceScores, TrendScoringContext, TrendSignal } from "./types.ts";
import { TREND_FRESHNESS_WINDOW_DAYS } from "./types.ts";

/**
 * Trend Relevance Engine. Pure, deterministic, no AI call -- every score is
 * computed from real fields on the candidate and the business context, so
 * the same input always produces the same decision (required for the
 * "Strategy Learning Test" pattern this codebase uses throughout:
 * different evidence must produce different, reproducible output).
 */

function daysSince(isoDate: string, now: Date): number {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - then) / (1000 * 60 * 60 * 24));
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
}

/**
 * Per-term (not per-word) overlap: a multi-word context term (e.g. "dental
 * implants") counts as a hit if ANY of its significant words appears in
 * the candidate text -- real trend text describing "implants" is still a
 * real match for the service "dental implants" even without the exact
 * two-word phrase, but this stays conservative: a term contributes at
 * most one hit regardless of how many of its words match, and unrelated
 * words never contribute on their own.
 */
function keywordOverlapScore(candidateText: string, contextTerms: string[]): number {
  if (contextTerms.length === 0) return 40; // no context terms to compare against -- neutral, not a fabricated high or low
  const candidateWords = tokenize(candidateText);
  const hits = contextTerms.filter((term) => {
    const termWords = [...tokenize(term)];
    return termWords.length > 0 && termWords.some((w) => candidateWords.has(w));
  }).length;
  return Math.round(Math.min(100, (hits / contextTerms.length) * 100));
}

function computeScores(candidate: TrendCandidate, context: TrendScoringContext, now: Date): TrendRelevanceScores {
  const candidateText = `${candidate.topic} ${candidate.reasonForTrend} ${candidate.hookPattern ?? ""}`;

  const businessFit = keywordOverlapScore(candidateText, [context.industry, ...context.services]);
  const audienceFit = candidate.audienceSignal
    ? keywordOverlapScore(`${candidate.audienceSignal} ${candidateText}`, context.targetAudience)
    : keywordOverlapScore(candidateText, context.targetAudience);

  // Brand fit: no positive signal to score against real brand values here
  // (that requires real fact/safety review, out of scope for this pure
  // scorer) -- start neutral-high and only penalize an explicit,
  // detectable conflict signal in the candidate's own text.
  const riskyPatterns = /\b(controversial|shock|prank|nsfw|clickbait outrage|misleading)\b/i;
  const brandFit = riskyPatterns.test(candidateText) ? 30 : 80;

  const channelFit = context.availableChannels.includes(candidate.platform) ? 90 : 20;

  const ageDays = daysSince(candidate.observedAt, now);
  const timeliness = ageDays > TREND_FRESHNESS_WINDOW_DAYS ? 0 : Math.round(100 * (1 - ageDays / TREND_FRESHNESS_WINDOW_DAYS));

  const strategicValue = Math.round(businessFit * 0.4 + audienceFit * 0.35 + channelFit * 0.25);

  // Risk: LOWER confidence evidence is inherently riskier to act on; an
  // explicit risky-pattern hit raises it further; risk tolerance from
  // context does NOT change the computed risk itself (that would hide the
  // real signal) -- it only changes how the decision threshold reacts to it, below.
  const confidenceRisk = candidate.confidence === "HIGH" ? 10 : candidate.confidence === "MEDIUM" ? 35 : 65;
  const risk = Math.min(100, confidenceRisk + (riskyPatterns.test(candidateText) ? 30 : 0));

  return { businessFit, audienceFit, brandFit, channelFit, timeliness, strategicValue, risk };
}

const RISK_TOLERANCE_CEILING: Record<TrendScoringContext["riskTolerance"], number> = {
  LOW: 30,
  MEDIUM: 55,
  HIGH: 75,
};

function decide(scores: TrendRelevanceScores, context: TrendScoringContext): { decision: TrendDecision; reason: string } {
  const riskCeiling = RISK_TOLERANCE_CEILING[context.riskTolerance];

  if (scores.timeliness === 0) {
    return { decision: "IGNORE", reason: `Trend evidence is older than the ${TREND_FRESHNESS_WINDOW_DAYS}-day freshness window -- no longer treated as current.` };
  }
  if (scores.channelFit < 50) {
    return { decision: "IGNORE", reason: "No available channel matches this trend's platform." };
  }
  if (scores.businessFit < 20) {
    return { decision: "IGNORE", reason: "No meaningful overlap between this trend and the business's real industry/services." };
  }
  if (scores.risk > riskCeiling) {
    return { decision: "MONITOR", reason: `Risk score (${scores.risk}) exceeds this business's configured risk tolerance (${context.riskTolerance}, ceiling ${riskCeiling}) -- watch, don't act yet.` };
  }
  if (scores.businessFit >= 70 && scores.audienceFit >= 50 && scores.timeliness >= 60 && scores.brandFit >= 60) {
    return { decision: "USE_NOW", reason: "Strong, current, on-brand, on-audience relevance across every scored dimension." };
  }
  if (scores.businessFit >= 40 && (scores.audienceFit >= 40 || scores.brandFit < 60)) {
    return { decision: "ADAPT", reason: "Genuinely relevant but needs adaptation before use -- format, brand fit, or audience alignment isn't strong enough to use as-is." };
  }
  return { decision: "MONITOR", reason: "Relevant enough to track, not yet strong enough evidence to act on." };
}

function adaptationGuidance(decision: TrendDecision, candidate: TrendCandidate): string | null {
  if (decision === "IGNORE" || decision === "MONITOR") return null;
  const parts: string[] = [];
  if (candidate.hookPattern) parts.push(`Adapt the underlying hook pattern ("${candidate.hookPattern}") to this business's real services -- never copy the original creator's specific content.`);
  if (candidate.visualPattern) parts.push(`Reuse the visual pattern ("${candidate.visualPattern}") with this business's real brand assets, not the original's.`);
  if (parts.length === 0) parts.push(`Adapt the underlying topic ("${candidate.topic}") using this business's own verified facts -- never restate another creator's claims as this business's own.`);
  return parts.join(" ");
}

/**
 * Scores one candidate against real business context and produces a full
 * TrendSignal, including the USE_NOW/ADAPT/MONITOR/IGNORE decision and why.
 */
export function evaluateTrendRelevance(
  candidate: TrendCandidate,
  context: TrendScoringContext,
  input: { id: string; tenantId: string; now?: Date },
): TrendSignal {
  const now = input.now ?? new Date();
  const scores = computeScores(candidate, context, now);
  const { decision, reason } = decide(scores, context);

  return {
    id: input.id,
    tenantId: input.tenantId,
    platform: candidate.platform,
    topic: candidate.topic,
    format: candidate.format,
    hookPattern: candidate.hookPattern ?? null,
    visualPattern: candidate.visualPattern ?? null,
    audienceSignal: candidate.audienceSignal ?? null,
    reasonForTrend: candidate.reasonForTrend,
    velocity: candidate.velocity ?? null,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl ?? null,
    observedAt: candidate.observedAt,
    confidence: candidate.confidence,
    scores,
    decision,
    decisionReason: reason,
    adaptationGuidance: adaptationGuidance(decision, candidate),
  };
}
