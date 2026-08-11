import type {
  ContentGapEntry,
  ContentGapMap,
  KeywordMap,
  KeywordOpportunity,
  QueryEvidence,
} from "./types.ts";

export function buildKeywordMap(input: {
  tenantId: string;
  queryEvidence: readonly QueryEvidence[];
}): KeywordMap {
  const opportunities: KeywordOpportunity[] = input.queryEvidence.map((ev) => {
    const opportunity: KeywordOpportunity = {
      query: ev.query,
      intent: ev.intent ?? "informational",
      topic: ev.topic ?? ev.query,
      evidenceIds: [ev.evidenceId],
      relevance: ev.relevance ?? 0.5,
      opportunityClass: ev.opportunityClass ?? "new_content",
      priority: ev.priority ?? 50,
      confidence: ev.confidence ?? 0.5,
    };
    if (ev.geography) opportunity.geography = ev.geography;
    if (ev.difficultyClass) opportunity.difficultyClass = ev.difficultyClass;
    if (typeof ev.currentPosition === "number") opportunity.currentPosition = ev.currentPosition;
    if (ev.targetPage) opportunity.targetPage = ev.targetPage;
    return opportunity;
  });

  return {
    kind: "keyword_map",
    id: `keyword_map_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    opportunities,
    evidenceIds: input.queryEvidence.map((e) => e.evidenceId),
    fabricatedVolumes: false,
  };
}

export function buildContentGapMap(input: {
  tenantId: string;
  services: readonly string[];
  locations?: readonly string[];
  existingPages: readonly { url: string; title?: string; topics?: readonly string[] }[];
  evidenceIds?: readonly string[];
}): ContentGapMap {
  const gaps: ContentGapEntry[] = [];
  const pageText = input.existingPages.map((p) =>
    `${p.url} ${p.title ?? ""} ${(p.topics ?? []).join(" ")}`.toLowerCase(),
  );
  const evidenceIds = input.evidenceIds ?? [];

  for (const service of input.services) {
    const locations = input.locations?.length ? input.locations : [undefined];
    for (const location of locations) {
      const needle = `${service} ${location ?? ""}`.trim().toLowerCase();
      const matchIdx = pageText.findIndex((t) =>
        needle.split(/\s+/).every((token) => token.length === 0 || t.includes(token)),
      );
      if (matchIdx >= 0) {
        gaps.push({
          serviceOrTopic: service,
          location,
          existingPageUrl: input.existingPages[matchIdx]?.url,
          gap: "covered",
          evidenceIds,
        });
      } else {
        gaps.push({
          serviceOrTopic: service,
          location,
          gap: "missing_page",
          evidenceIds,
        });
      }
    }
  }

  return {
    kind: "content_gap_map",
    id: `content_gap_map_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    gaps,
  };
}
