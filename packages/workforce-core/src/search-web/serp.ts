import { resolveSerpCapabilityGate } from "./capability-gate.ts";
import type { SerpAnalysis, SerpResultRow } from "./types.ts";

export class SerpProviderUnavailableError extends Error {
  readonly code = "serp_provider_unavailable";
  constructor(message: string) {
    super(message);
    this.name = "SerpProviderUnavailableError";
  }
}

export type ObservedSerpHit = {
  query: string;
  evidenceId: string;
  /** Only include when provider returned a real position. */
  position?: number;
  url?: string;
  title?: string;
};

/**
 * Build SERP analysis from observed provider rows only.
 * Never invent rankings. Blocks when research.serp is unavailable/planned.
 */
export function buildSerpAnalysis(input: {
  tenantId: string;
  observedHits?: readonly ObservedSerpHit[];
  /** When false, treat provider as unavailable even if capability later becomes AVAILABLE. */
  providerAvailable?: boolean;
}): SerpAnalysis {
  const gate = resolveSerpCapabilityGate();
  const providerAvailable = input.providerAvailable ?? gate.executable;

  if (!providerAvailable || !gate.executable) {
    return {
      kind: "serp_analysis",
      id: `serp_analysis_${crypto.randomUUID()}`,
      tenantId: input.tenantId,
      providerAvailable: false,
      status: "WAITING_CAPABILITY",
      results: [],
      evidenceIds: [],
      fabricatedRankings: false,
      blockedReason: gate.reason.includes("RESEARCH_REQUIRED")
        ? "RESEARCH_REQUIRED"
        : gate.reason,
    };
  }

  const results: SerpResultRow[] = (input.observedHits ?? []).map((hit) => {
    const row: SerpResultRow = {
      query: hit.query,
      evidenceId: hit.evidenceId,
    };
    if (typeof hit.position === "number") row.position = hit.position;
    if (hit.url) row.url = hit.url;
    if (hit.title) row.title = hit.title;
    return row;
  });

  return {
    kind: "serp_analysis",
    id: `serp_analysis_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    providerAvailable: true,
    status: "READY",
    results,
    evidenceIds: results.map((r) => r.evidenceId),
    fabricatedRankings: false,
  };
}

/** Hard block helper for callers that must throw when SERP is unavailable. */
export function assertSerpProviderAvailable(providerAvailable: boolean): void {
  const gate = resolveSerpCapabilityGate();
  if (!providerAvailable || !gate.executable) {
    throw new SerpProviderUnavailableError(
      gate.reason.includes("RESEARCH_REQUIRED") ? "RESEARCH_REQUIRED" : gate.reason,
    );
  }
}
