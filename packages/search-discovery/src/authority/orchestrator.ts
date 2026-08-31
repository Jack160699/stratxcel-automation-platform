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
  /** Real, comparable NAP data -- see entity-graph.ts's buildEntityCitationGraph for why this matters. Optional; presence-only behavior is preserved when omitted. */
  nap?: {
    websitePhone?: string | null;
    gbpPhone?: string | null;
    websiteAddress?: string | null;
    gbpAddress?: string | null;
  };
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

  // 5. Build Entity Graph
  // (moved above localProfile so its real, per-location consistency
  // findings can inform localProfile.napConsistent/localGaps below,
  // instead of localProfile guessing from hasGbp alone)
  const entityNodes = buildEntityCitationGraph({
    businessName: input.businessName,
    domain: input.domain,
    services: input.services,
    locations: input.locations,
    hasGbp: Boolean(input.hasGbp),
    hasSchema: Boolean(input.hasSchema),
    externalSourcesCount: sources.length,
    nap: input.nap,
  });

  // 4. Local Profile Intelligence
  //
  // Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
  // napConsistent was `Boolean(input.hasGbp)` -- "is a GBP connected",
  // never an actual NAP data comparison, so it could never be false while
  // a GBP existed even if the phone/address genuinely didn't match. Now
  // derived from the real entity-graph consistency findings above when
  // real NAP data was supplied; falls back to the original presence-only
  // signal when it wasn't (preserves existing behavior for callers that
  // don't have comparable data yet).
  const locationNodes = entityNodes.filter((n) => n.entityType === "LOCATION");
  const realNapChecked = Boolean(input.nap && (input.nap.websitePhone || input.nap.websiteAddress));
  const napConsistent = realNapChecked
    ? locationNodes.every((n) => n.consistencyStatus !== "INCONSISTENT")
    : Boolean(input.hasGbp);
  const napMismatchEvidence = locationNodes.flatMap((n) => (n.consistencyStatus === "INCONSISTENT" ? n.evidence : []));

  const localProfile: LocalMapsProfile = {
    businessName: input.businessName,
    primaryLocation: input.locations[0] || "India",
    napConsistent,
    gbpClaimed: Boolean(input.hasGbp),
    categories: input.services.slice(0, 3),
    serviceAreas: input.locations,
    localGaps: [
      ...(input.hasGbp ? [] : ["Google Business Profile is not connected or requires NAP verification."]),
      ...(realNapChecked && !napConsistent ? napMismatchEvidence : []),
    ],
  };

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
