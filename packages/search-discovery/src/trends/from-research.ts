import type { ResearchResult, ResearchClaim, ResearchSource } from "../research/types.ts";
import type { TrendCandidate, TrendPlatform } from "./types.ts";

/**
 * Converts a real grounded ResearchResult (research/grounded-runtime.ts)
 * into trend candidates. Deliberately conservative: only claims with
 * real, resolvable source citations become candidates -- everything else
 * (structured fields the underlying research doesn't actually establish,
 * like format/hookPattern/visualPattern/audienceSignal) is left honestly
 * null rather than inferred from claim text, matching this codebase's
 * "no fake confidence percentages" / no-fabrication convention.
 *
 * This function does NOT call any AI or network -- it is a pure mapper
 * over an already-computed real result, so it's directly unit-testable
 * with fixture ResearchResults, no mocked AI executor needed.
 */
export function mapResearchToTrendCandidates(result: ResearchResult, input: { platform: TrendPlatform }): TrendCandidate[] {
  if (result.status !== "PASS") return []; // Honest empty: no fabricated candidates from insufficient/blocked/failed research.

  const sourceById = new Map<string, ResearchSource>(result.sources.map((s) => [s.id, s]));
  const candidates: TrendCandidate[] = [];

  for (const claim of result.claims) {
    if (claim.sourceSupportStatus !== "supported") continue; // unsupported/partial/conflicting/stale claims never become trend candidates
    if (claim.statementKind === "unknown") continue;

    const citedSources = claim.sourceIds.map((id) => sourceById.get(id)).filter((s): s is ResearchSource => Boolean(s));
    if (citedSources.length === 0) continue; // a claim citing no resolvable real source is never a candidate

    const primarySource = citedSources[0]!;
    const confidence = claimConfidenceBand(claim, result);

    candidates.push({
      platform: input.platform,
      topic: claim.text,
      format: "unknown", // Real research doesn't establish content format -- never guessed.
      hookPattern: null,
      visualPattern: null,
      audienceSignal: null,
      reasonForTrend: claim.text,
      velocity: null, // No real velocity signal in grounded research output -- never fabricated.
      source: primarySource.domain,
      sourceUrl: primarySource.url,
      observedAt: primarySource.retrievedAt || result.searchedAt,
      confidence,
    });
  }

  return candidates;
}

function claimConfidenceBand(claim: ResearchClaim, result: ResearchResult): "HIGH" | "MEDIUM" | "LOW" {
  if (typeof claim.confidence === "number") {
    return claim.confidence >= 0.75 ? "HIGH" : claim.confidence >= 0.4 ? "MEDIUM" : "LOW";
  }
  if (result.confidenceBand === "HIGH" || result.confidenceBand === "MEDIUM" || result.confidenceBand === "LOW") {
    return result.confidenceBand;
  }
  return "MEDIUM"; // Neither a per-claim nor a result-level confidence exists -- MEDIUM is the honest middle, never HIGH without real support.
}
