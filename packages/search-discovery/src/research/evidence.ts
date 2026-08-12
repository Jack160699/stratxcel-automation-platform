
import { createHash } from "node:crypto";
import type { ResearchClaim, ResearchRequest, ResearchSource } from "./types.ts";
import { RESEARCH_BOUNDS } from "./types.ts";
import { stripControlDirectivesFromExcerpt } from "./prompt-injection.ts";

export function stableEvidenceKey(args: {
  missionId: string;
  requestId: string;
  canonicalUrl: string;
  query?: string;
}): string {
  const h = createHash("sha256")
    .update(
      [
        args.missionId,
        args.requestId,
        args.canonicalUrl.toLowerCase(),
        (args.query ?? "").toLowerCase().trim(),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
  return `research_evidence_${h}`;
}

export function stableSummaryKey(args: {
  missionId: string;
  requestId: string;
  question: string;
}): string {
  const h = createHash("sha256")
    .update([args.missionId, args.requestId, args.question.trim().toLowerCase()].join("|"))
    .digest("hex")
    .slice(0, 24);
  return `research_summary_${h}`;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export function safeExcerpt(text: string, max = RESEARCH_BOUNDS.maxExcerptChars): string {
  return stripControlDirectivesFromExcerpt(text).replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildEvidenceArtifactMetadata(args: {
  tenantId: string;
  missionId: string;
  requestId: string;
  source: ResearchSource;
  claimIds: readonly string[];
}): Record<string, unknown> {
  return {
    kind: "research_evidence",
    tenantId: args.tenantId,
    missionId: args.missionId,
    requestId: args.requestId,
    sourceId: args.source.id,
    url: args.source.url,
    canonicalUrl: args.source.canonicalUrl,
    title: args.source.title ?? null,
    domain: args.source.domain,
    provider: args.source.provider,
    retrievedAt: args.source.retrievedAt,
    searchQueries: args.source.searchQueries,
    sourceType: args.source.sourceType,
    verification: args.source.verification,
    freshnessStatus: args.source.freshnessStatus ?? null,
    excerpt: args.source.excerpt ?? null,
    contentHash: args.source.contentHash ?? null,
    publishedAt: args.source.publishedAt ?? null,
    claimIds: [...args.claimIds],
    // Never store full page bodies.
    fullPageStored: false,
  };
}

export function buildSummaryArtifactMetadata(args: {
  request: ResearchRequest;
  summary: string;
  claims: readonly ResearchClaim[];
  sources: readonly ResearchSource[];
  evidenceArtifactIds: readonly string[];
  provider: string | null;
  model: string | null;
  selectionReceipt?: Record<string, unknown>;
  searchedAt: string;
  disagreements?: readonly string[];
  status: string;
}): Record<string, unknown> {
  return {
    kind: "research_summary",
    tenantId: args.request.tenantId,
    missionId: args.request.missionId,
    requestId: args.request.requestId,
    question: args.request.question,
    purpose: args.request.purpose ?? null,
    taskClass: args.request.taskClass,
    geography: args.request.geography ?? null,
    freshnessDays: args.request.freshnessDays ?? null,
    summary: args.summary,
    claimIds: args.claims.map((c) => c.id),
    claims: args.claims,
    sourceIds: args.sources.map((s) => s.id),
    evidenceArtifactIds: [...args.evidenceArtifactIds],
    provider: args.provider,
    model: args.model,
    selectionReceipt: args.selectionReceipt ?? null,
    researchedAt: args.searchedAt,
    freshnessConstraints: {
      freshnessDays: args.request.freshnessDays ?? null,
    },
    disagreements: args.disagreements ?? [],
    status: args.status,
    handoff: {
      forDepartments: [
        "strategy",
        "seo",
        "content",
        "social",
        "website",
        "growth",
        "ads",
        "sales",
        "conversion",
        "hermes",
      ],
      requiresEvidenceArtifactIds: true,
      flattenProseForbidden: true,
    },
  };
}
