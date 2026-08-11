/**
 * Attribution confidence — never claim causality without evidence.
 */

import type { AttributionConfidence, AttributionLink } from "./types.ts";

export class AttributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttributionError";
  }
}

export interface CreateAttributionInput {
  id: string;
  tenantId: string;
  causeRef: string;
  effectObservationId: string;
  confidence: AttributionConfidence;
  evidenceIds: readonly string[];
  rationale: string;
  createdAtIso: string;
}

export function createAttributionLink(input: CreateAttributionInput): AttributionLink {
  if (!input.tenantId) throw new AttributionError("tenant_required");
  if (!input.causeRef || !input.effectObservationId) {
    throw new AttributionError("cause_and_effect_required");
  }
  if (input.confidence === "DIRECT" && input.evidenceIds.length === 0) {
    throw new AttributionError("direct_attribution_requires_evidence");
  }
  if (input.confidence === "LIKELY" && input.evidenceIds.length === 0) {
    throw new AttributionError("likely_attribution_requires_evidence");
  }
  if (input.confidence === "ASSISTED" && input.evidenceIds.length === 0) {
    throw new AttributionError("assisted_attribution_requires_evidence");
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    causeRef: input.causeRef,
    effectObservationId: input.effectObservationId,
    confidence: input.confidence,
    evidenceIds: input.evidenceIds,
    rationale: input.rationale,
    createdAtIso: input.createdAtIso,
  };
}

export function resolveAttributionConfidence(args: {
  requested: AttributionConfidence;
  evidenceIds: readonly string[];
  hasDirectProvenance: boolean;
}): AttributionConfidence {
  if (args.requested === "DIRECT" && (!args.hasDirectProvenance || args.evidenceIds.length === 0)) {
    return "UNKNOWN";
  }
  if ((args.requested === "LIKELY" || args.requested === "ASSISTED") && args.evidenceIds.length === 0) {
    return "UNKNOWN";
  }
  return args.requested;
}

export function assertAttributionUncertaintyPreserved(link: AttributionLink): void {
  if (link.confidence === "DIRECT" && link.evidenceIds.length === 0) {
    throw new AttributionError("attribution_uncertainty_lost");
  }
}
