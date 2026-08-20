import type { EntityGraphNode, EntityType } from "./types.ts";

export function buildEntityCitationGraph(input: {
  businessName: string;
  domain: string;
  services: string[];
  locations: string[];
  hasGbp: boolean;
  hasSchema: boolean;
  externalSourcesCount: number;
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
    nodes.push({
      entityType: "LOCATION",
      canonicalName: loc,
      attributes: { gbpLinked: input.hasGbp },
      relationships: [
        {
          targetType: "BRAND",
          targetName: input.businessName,
          relationshipType: "LOCATED_IN",
        },
      ],
      consistencyStatus: input.hasGbp ? "CONSISTENT" : "WEAK_COVERAGE",
      evidence: [
        `Operational location: ${loc}`,
        input.hasGbp ? "Google Business Profile active" : "GBP connection pending verification",
      ],
    });
  }

  return nodes;
}
