import type {
  CompetitorQuerySnapshot,
  CompetitorProfile,
  MeasurementQueryResult,
  TargetQuery,
} from "./types.ts";
import { canonicalizeDomain } from "./competitor-discovery.ts";

export interface SnapshotBuilderInput {
  targetQueries: TargetQuery[];
  clientDomain: string;
  competitors: CompetitorProfile[];
  serpResults?: MeasurementQueryResult[];
  providerState?: {
    isAvailable: boolean;
    reasonIfUnavailable?: string;
  };
}

/**
 * Builds comparable query-level snapshots for client vs competitors.
 * Truthfully preserves null when unmeasured, avoiding fabricated zeros or fake 100 ranks.
 */
export function buildCompetitorQuerySnapshots(input: SnapshotBuilderInput): CompetitorQuerySnapshot[] {
  const now = new Date().toISOString();
  const clientDomainNorm = canonicalizeDomain(input.clientDomain);
  const competitorMap = new Map<string, CompetitorProfile>();
  for (const c of input.competitors) {
    competitorMap.set(canonicalizeDomain(c.domain), c);
  }

  const serpMap = new Map<string, MeasurementQueryResult>();
  if (input.serpResults) {
    for (const r of input.serpResults) {
      serpMap.set(r.query.toLowerCase().trim(), r);
    }
  }

  const snapshots: CompetitorQuerySnapshot[] = [];

  for (const tq of input.targetQueries) {
    const qKey = tq.query.toLowerCase().trim();
    const serp = serpMap.get(qKey);

    if (!serp) {
      // Provider unconfigured or unmeasured for this query
      snapshots.push({
        query: tq.query,
        clientPresent: false,
        clientPosition: null,
        clientUrl: null,
        competitors: Array.from(competitorMap.values()).map((c) => ({
          domain: c.domain,
          businessName: c.businessName,
          position: null,
          url: null,
          resultType: "unmeasured",
          isAhead: false,
        })),
        source: "unconfigured_serp_provider",
        timestamp: now,
        availabilityState: input.providerState?.isAvailable ? "provider_unavailable" : "not_connected",
        reasonIfUnavailable:
          input.providerState?.reasonIfUnavailable ||
          "Live search measurement provider is not configured for this query.",
      });
      continue;
    }

    // Process real SERP items
    let clientPosition: number | null = null;
    let clientUrl: string | null = null;

    const competitorRanks = new Map<string, { position: number; url: string; resultType: string }>();

    for (const item of serp.items) {
      const itemDomain = canonicalizeDomain(item.domain || item.url);
      if (itemDomain === clientDomainNorm || itemDomain.endsWith(`.${clientDomainNorm}`)) {
        if (clientPosition === null) {
          clientPosition = item.position;
          clientUrl = item.url;
        }
      } else if (competitorMap.has(itemDomain)) {
        if (!competitorRanks.has(itemDomain)) {
          competitorRanks.set(itemDomain, {
            position: item.position,
            url: item.url,
            resultType: item.resultType || "organic",
          });
        }
      }
    }

    const competitorEntries = Array.from(competitorMap.values()).map((c) => {
      const rank = competitorRanks.get(canonicalizeDomain(c.domain));
      const pos = rank?.position ?? null;
      const isAhead = pos !== null && (clientPosition === null || pos < clientPosition);

      return {
        domain: c.domain,
        businessName: c.businessName,
        position: pos,
        url: rank?.url ?? null,
        resultType: rank?.resultType ?? "organic",
        isAhead,
      };
    });

    snapshots.push({
      query: tq.query,
      clientPresent: clientPosition !== null,
      clientPosition,
      clientUrl,
      competitors: competitorEntries,
      source: serp.sourceProvider,
      timestamp: serp.timestamp || now,
      availabilityState: "available",
    });
  }

  return snapshots;
}
