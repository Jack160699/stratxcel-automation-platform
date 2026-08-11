import type { InternalLinkPlan, InternalLinkSuggestion, KnownPage } from "./types.ts";

export class InventedUrlError extends Error {
  readonly code = "invented_url_rejected";
  constructor(url: string) {
    super(`InventedUrlError: unknown URL ${url}`);
    this.name = "InventedUrlError";
  }
}

export function buildInternalLinkPlan(input: {
  tenantId: string;
  knownPages: readonly KnownPage[];
  suggestions: readonly {
    sourceUrl: string;
    targetUrl: string;
    anchorHint: string;
    rationale: string;
  }[];
}): InternalLinkPlan {
  const known = new Set(input.knownPages.map((p) => p.url));
  const suggestions: InternalLinkSuggestion[] = [];

  for (const s of input.suggestions) {
    if (!known.has(s.sourceUrl)) throw new InventedUrlError(s.sourceUrl);
    if (!known.has(s.targetUrl)) throw new InventedUrlError(s.targetUrl);
    suggestions.push({
      sourceUrl: s.sourceUrl,
      targetUrl: s.targetUrl,
      anchorHint: s.anchorHint,
      rationale: s.rationale,
    });
  }

  return {
    kind: "internal_link_plan",
    id: `internal_link_plan_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    suggestions,
  };
}
