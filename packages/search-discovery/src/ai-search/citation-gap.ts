import { createHash } from "node:crypto";
import type { AIVisibilityResult, AICitationGap } from "./types.ts";

function stableFingerprint(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

export function analyzeAICitationGaps(input: {
  clientDomain: string;
  clientBusinessName: string;
  results: AIVisibilityResult[];
}): AICitationGap[] {
  const gaps: AICitationGap[] = [];

  for (const res of input.results) {
    if (res.providerStatus !== "available") continue;

    // Identify competitor citations
    const citedCompetitors = res.competitorCitations.filter((c) => c.cited || c.mentioned);

    // If competitor is cited but client is not cited
    if (citedCompetitors.length > 0 && !res.clientCited) {
      for (const comp of citedCompetitors) {
        const topCitedSource = comp.citedUrls[0] || (res.citedDomains.length > 0 ? res.citedDomains[0] : "third-party index");
        const evidence = [
          `AI Search Engine (${res.platform}) cited competitor "${comp.domain}" for query: "${res.query}".`,
          `Client domain "${input.clientDomain}" was omitted from source citations in this response.`,
          `Referenced citation URL: ${topCitedSource}`,
        ];

        const likelyGap = !res.brandMentioned
          ? "Brand entity citation and schema presence are insufficiently recognized in search model index."
          : "Brand was mentioned in text but lacks high-authority landing page URL citation.";

        const proposedAction = `Create dedicated AEO FAQ and verified entity schema addressing: "${res.query}".`;

        gaps.push({
          fingerprint: stableFingerprint(["ai_gap", res.platform, comp.domain, res.query]),
          query: res.query,
          platform: res.platform,
          competitorCited: comp.domain,
          sourceCited: topCitedSource,
          clientMissing: true,
          evidence,
          likelyGap,
          proposedAction,
          confidence: res.confidence,
          priority: 88,
        });
      }
    }
  }

  return gaps;
}
