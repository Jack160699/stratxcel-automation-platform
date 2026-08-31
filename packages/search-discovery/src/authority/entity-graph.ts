import type { EntityGraphNode, EntityType } from "./types.ts";

/** Digit-only comparison, matching lib/growth/search-growth-director.ts's phone-normalization convention -- avoids false mismatches from formatting differences (spaces, dashes, a leading 0/country code) while still catching a genuinely different number. */
function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "").replace(/^0+/, "");
}

export function buildEntityCitationGraph(input: {
  businessName: string;
  domain: string;
  services: string[];
  locations: string[];
  hasGbp: boolean;
  hasSchema: boolean;
  externalSourcesCount: number;
  /**
   * Real, comparable NAP (Name/Address/Phone) data for genuine mismatch
   * detection. Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
   * without this, every LOCATION node's consistencyStatus could only ever
   * be CONSISTENT or WEAK_COVERAGE (hasGbp alone was the only signal) --
   * the schema supports INCONSISTENT, but nothing could ever produce it.
   * Optional and additive: omitting it preserves the original
   * presence/absence-only behavior for callers that don't have real
   * comparable data yet.
   */
  nap?: {
    websitePhone?: string | null;
    gbpPhone?: string | null;
    websiteAddress?: string | null;
    gbpAddress?: string | null;
  };
}): EntityGraphNode[] {
  const nodes: EntityGraphNode[] = [];

  // 1. Core Brand Node
  const brandNode: EntityGraphNode = {
    entityType: "BRAND",
    canonicalName: input.businessName,
    attributes: { domain: input.domain, schemaPresent: input.hasSchema },
    relationships: [
      ...input.services.map((s) => ({
        targetType: "SERVICE" as EntityType,
        targetName: s,
        relationshipType: "OFFERS_SERVICE" as const,
      })),
      ...input.locations.map((loc) => ({
        targetType: "LOCATION" as EntityType,
        targetName: loc,
        relationshipType: "LOCATED_IN" as const,
      })),
    ],
    consistencyStatus: input.hasSchema ? "CONSISTENT" : "WEAK_COVERAGE",
    evidence: [
      `Official domain: ${input.domain}`,
      input.hasSchema ? "Schema Organization markup verified" : "Missing structured schema graph on homepage",
    ],
  };
  nodes.push(brandNode);

  // 2. Service Nodes
  for (const service of input.services) {
    nodes.push({
      entityType: "SERVICE",
      canonicalName: service,
      attributes: { primaryService: true },
      relationships: [
        {
          targetType: "BRAND",
          targetName: input.businessName,
          relationshipType: "MENTIONED_BY",
        },
      ],
      consistencyStatus: "CONSISTENT",
      evidence: [`Declared business service: ${service}`],
    });
  }

  // 3. Location Nodes
  for (const loc of input.locations) {
    let consistencyStatus: EntityGraphNode["consistencyStatus"] = input.hasGbp ? "CONSISTENT" : "WEAK_COVERAGE";
    const evidence = [
      `Operational location: ${loc}`,
      input.hasGbp ? "Google Business Profile active" : "GBP connection pending verification",
    ];
    const attributes: Record<string, unknown> = { gbpLinked: input.hasGbp };

    if (input.nap) {
      const { websitePhone, gbpPhone, websiteAddress, gbpAddress } = input.nap;
      const mismatches: string[] = [];

      if (websitePhone && gbpPhone) {
        const match = normalizePhone(websitePhone) === normalizePhone(gbpPhone);
        attributes.phoneConsistent = match;
        if (!match) {
          mismatches.push(`Phone mismatch: website "${websitePhone}" vs Google Business Profile "${gbpPhone}"`);
        }
      }

      if (websiteAddress && gbpAddress) {
        const match = websiteAddress.trim().toLowerCase() === gbpAddress.trim().toLowerCase();
        attributes.addressConsistent = match;
        if (!match) {
          mismatches.push(`Address mismatch: website "${websiteAddress}" vs Google Business Profile "${gbpAddress}"`);
        }
      }

      if (mismatches.length > 0) {
        consistencyStatus = "INCONSISTENT";
        evidence.push(...mismatches);
      } else if ((websitePhone && gbpPhone) || (websiteAddress && gbpAddress)) {
        // Real comparable data existed on both sides and matched -- a
        // stronger, evidenced CONSISTENT than the presence-only default.
        consistencyStatus = "CONSISTENT";
        evidence.push("NAP data compared directly between website and Google Business Profile: no mismatch found.");
      }
    }

    nodes.push({
      entityType: "LOCATION",
      canonicalName: loc,
      attributes,
      relationships: [
        {
          targetType: "BRAND",
          targetName: input.businessName,
          relationshipType: "LOCATED_IN",
        },
      ],
      consistencyStatus,
      evidence,
    });
  }

  return nodes;
}
