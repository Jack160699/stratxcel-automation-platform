import type {
  ExternalSourceProfile,
  ExternalAuthorityReport,
  LocalMapsProfile,
} from "./types.ts";
import { analyzeAuthorityGaps } from "./gap-engine.ts";
import { discoverCommunityOpportunities } from "./community.ts";
import { analyzeReviewReputation } from "./reviews.ts";
import { buildEntityCitationGraph } from "./entity-graph.ts";

export interface AuthorityAnalysisInput {
  businessName: string;
  domain: string;
  services: string[];
  locations: string[];
  competitors?: string[];
  discoveredSources?: ExternalSourceProfile[];
  hasGbp?: boolean;
  hasSchema?: boolean;
}

export function runExternalAuthorityAnalysis(
  input: AuthorityAnalysisInput
): ExternalAuthorityReport {
  const sources = input.discoveredSources || [];

  // 1. Analyze Authority Gaps
  const authorityGaps = analyzeAuthorityGaps({
    clientDomain: input.domain,
    clientBusinessName: input.businessName,
    sources,
  });

  // 2. Discover Community Opportunities (Reddit & Quora)
  const { reddit, quora } = discoverCommunityOpportunities({
    businessName: input.businessName,
    services: input.services,
    locations: input.locations,
    competitors: input.competitors,
  });

  // 3. Review Reputation Intelligence
  const reputationSummary = analyzeReviewReputation({
    businessName: input.businessName,
  });

  // 4. Local Profile Intelligence
  const localProfile: LocalMapsProfile = {
    businessName: input.businessName,
    primaryLocation: input.locations[0] || "India",
    napConsistent: Boolean(input.hasGbp),
    gbpClaimed: Boolean(input.hasGbp),
    categories: input.services.slice(0, 3),
    serviceAreas: input.locations,
    localGaps: input.hasGbp
      ? []
      : ["Google Business Profile is not connected or requires NAP verification."],
  };

  // 5. Build Entity Graph
  const entityNodes = buildEntityCitationGraph({
    businessName: input.businessName,
    domain: input.domain,
    services: input.services,
    locations: input.locations,
    hasGbp: Boolean(input.hasGbp),
    hasSchema: Boolean(input.hasSchema),
    externalSourcesCount: sources.length,
  });

  // 6. Compute Transparent Authority Score
  const clientCitationsCount = sources.filter((s) => s.clientPresent).length;
  const totalSourcesCount = sources.length;
  const citationCoverage = totalSourcesCount > 0 ? (clientCitationsCount / totalSourcesCount) * 100 : 50;

  const entityScore = entityNodes.filter((n) => n.consistencyStatus === "CONSISTENT").length / (entityNodes.length || 1) * 100;
  const overallAuthorityScore = Math.round(citationCoverage * 0.5 + entityScore * 0.5);

  return {
    overallAuthorityScore,
    sourcesDiscovered: sources,
    authorityGaps,
    redditRadar: reddit,
    quoraRadar: quora,
    reputationSummary,
    localProfile,
    entityNodes,
  };
}
