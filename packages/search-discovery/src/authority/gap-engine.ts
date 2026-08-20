import { createHash } from "node:crypto";
import type { ExternalSourceProfile, AuthorityGap } from "./types.ts";

function stableFingerprint(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

export function analyzeAuthorityGaps(input: {
  clientDomain: string;
  clientBusinessName: string;
  sources: ExternalSourceProfile[];
}): AuthorityGap[] {
  const gaps: AuthorityGap[] = [];

  for (const src of input.sources) {
    // 1. Competitor is present, Client is missing
    if (src.competitorPresent && !src.clientPresent) {
      const isIndustry = src.sourceType === "industry_publication" || src.sourceType === "trade_association";
      const isLocalDir = src.sourceType === "local_directory" || src.sourceType === "business_directory";
      const isReview = src.sourceType === "review_platform";

      const gapType = isIndustry
        ? "missing_industry_citation"
        : isLocalDir
        ? "missing_local_directory"
        : isReview
        ? "missing_review_presence"
        : "competitor_mentioned_source";

      const whyItMatters = `Competitor (${src.competitorDomains.join(", ")}) is cited on "${src.title || src.domain}" (${src.sourceType.replace("_", " ")}), which signals topical and geographic authority to search engines and AI models.`;

      const recommendedAction = isLocalDir
        ? `Claim and verify official business profile on ${src.domain}.`
        : isReview
        ? `Establish verified presence on ${src.domain} and invite genuine customer reviews.`
        : `Submit company profile or editorial pitch to ${src.domain} covering primary services.`;

      gaps.push({
        id: stableFingerprint(["auth_gap", src.domain, gapType]),
        gapType,
        sourceDomain: src.domain,
        sourceType: src.sourceType,
        competitorsPresent: src.competitorDomains,
        clientPresent: false,
        evidence: [
          `Competitor present: ${src.competitorDomains.join(", ")}`,
          `Client domain (${input.clientDomain}) is absent from ${src.domain}.`,
          `Topic relevance score: ${src.topicRelevance}/100`,
        ],
        whyItMatters,
        recommendedAction,
        actionType: src.publicationCapability === "API_WRITE_AVAILABLE" ? "AUTHORIZATION_REQUIRED" : "RECOMMENDATION_ONLY",
        opportunityScore: src.opportunityScore,
        confidence: src.confidence,
      });
    }

    // 2. High relevance directory/publication where neither client nor competitor is present (First Mover Opportunity)
    if (!src.clientPresent && !src.competitorPresent && src.topicRelevance >= 80) {
      gaps.push({
        id: stableFingerprint(["first_mover_gap", src.domain]),
        gapType: "missing_business_profile",
        sourceDomain: src.domain,
        sourceType: src.sourceType,
        competitorsPresent: [],
        clientPresent: false,
        evidence: [
          `High authority niche source: ${src.domain} (Relevance: ${src.topicRelevance}/100).`,
          `Neither client nor direct competitors are currently listed.`,
        ],
        whyItMatters: `First-mover opportunity: Establishing presence on ${src.domain} creates an uncontested topical authority citation.`,
        recommendedAction: `Register business profile on ${src.domain}.`,
        actionType: "RECOMMENDATION_ONLY",
        opportunityScore: 75,
        confidence: "MEDIUM",
      });
    }
  }

  return gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);
}
