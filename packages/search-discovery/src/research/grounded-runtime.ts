
/**
 * Grounded research orchestrator — AI Runtime only for models.
 * Research business logic never parses raw Gemini/OpenAI JSON.
 */
import type { AIBudgetEnvelope, AIExecutionResult, AIWebEvidence } from "@stratxcel/ai-runtime";
import { parseResearchRequest, ResearchRequestValidationError } from "./validate.ts";
import { dedupeNormalizedSources, normalizeResearchUrl, UnsafeResearchUrlError } from "./normalize.ts";
import { classifySourceQuality, preferPrimarySources } from "./source-quality.ts";
import { detectConflictingClaims, validateClaimSourceMapping } from "./citation-validation.ts";
import { evaluateResearchQuality } from "./quality-gate.ts";
import { buildEvidenceArtifactMetadata, buildSummaryArtifactMetadata, safeExcerpt, stableEvidenceKey, stableSummaryKey } from "./evidence.ts";
import { verifyTopSources } from "./verify-source.ts";
import { RESEARCH_TRUSTED_SYSTEM_PREAMBLE, wrapUntrustedSourceText } from "./prompt-injection.ts";
import type { ResearchClaim, ResearchRequest, ResearchResult, ResearchSource, ResearchStatementKind } from "./types.ts";
import { RESEARCH_BOUNDS } from "./types.ts";

export interface ResearchAIExecutor {
  isConfigured: () => boolean;
  execute: (input: {
    tenantId: string;
    missionId: string;
    requestId: string;
    taskClass: "RESEARCH" | "SEO_RESEARCH";
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    requireWebEvidence: boolean;
    correlationId?: string;
    budgetEnvelope?: AIBudgetEnvelope;
  }) => Promise<AIExecutionResult>;
}

export interface ResearchArtifactPersister {
  persist: (input: {
    tenantId: string;
    missionId: string;
    requestId: string;
    kind: "research_evidence" | "research_summary";
    idempotencyKey: string;
    metadata: Record<string, unknown>;
  }) => Promise<{ ok: true; id: string } | { ok: false; errorMessage: string }>;
  findByIdempotencyKey?: (args: {
    tenantId: string;
    missionId: string;
    key: string;
  }) => Promise<{ id: string; metadata?: Record<string, unknown> } | null>;
}

export interface RunGroundedResearchDeps {
  ai: ResearchAIExecutor;
  artifacts: ResearchArtifactPersister;
  now?: () => Date;
  verifyFetcher?: typeof fetch;
  budgetEnvelope?: AIBudgetEnvelope;
}

function domainMatches(domain: string, entry: string): boolean {
  const d = domain.toLowerCase();
  const e = entry.toLowerCase();
  return d === e || d.endsWith(`.${e}`);
}

function mapWebEvidenceToSources(
  evidence: AIWebEvidence | undefined,
  request: ResearchRequest,
  retrievedAt: string,
): {
  sources: ResearchSource[];
  providerSourceToCanonical: Map<string, string>;
} {
  const providerSourceToCanonical = new Map<string, string>();
  if (!evidence?.sources?.length) return { sources: [], providerSourceToCanonical };

  const canonicalToSource = new Map<string, ResearchSource>();
  for (let i = 0; i < evidence.sources.length; i++) {
    const src = evidence.sources[i]!;
    const providerSourceId = src.id || `provider_src_${i}`;
    try {
      const normalized = normalizeResearchUrl(src.url);
      if (request.blockedDomains?.some((d) => domainMatches(normalized.domain, d))) continue;
      const canonicalId = stableEvidenceKey({
        missionId: request.missionId,
        requestId: request.requestId,
        canonicalUrl: normalized.canonicalUrl,
      });
      providerSourceToCanonical.set(providerSourceId, canonicalId);

      const existing = canonicalToSource.get(canonicalId);
      if (!existing) {
        canonicalToSource.set(canonicalId, {
          id: canonicalId,
          providerSourceId,
          url: normalized.url,
          canonicalUrl: normalized.canonicalUrl,
          title: src.title,
          domain: normalized.domain,
          provider:
            src.provider === "openai" ? "openai" : src.provider === "google" ? "google" : "unknown",
          retrievedAt,
          searchQueries: [...(src.searchQueries ?? evidence.searchQueries ?? [])],
          sourceType: classifySourceQuality({ domain: normalized.domain }),
          verification: "skipped",
          freshnessStatus: null,
          publishedAt: null,
        });
      } else {
        const mergedQueries = new Set([
          ...existing.searchQueries,
          ...(src.searchQueries ?? []),
          ...(evidence.searchQueries ?? []),
        ]);
        existing.searchQueries = [...mergedQueries];
        if (!existing.title && src.title) existing.title = src.title;
      }
    } catch (err) {
      if (err instanceof UnsafeResearchUrlError) continue;
      continue;
    }
  }

  let sources = dedupeNormalizedSources([...canonicalToSource.values()]);
  if (request.requiredDomains?.length) {
    const required = new Set(request.requiredDomains.map((d) => d.toLowerCase()));
    const preferredFirst = sources.filter((s) => [...required].some((d) => domainMatches(s.domain, d)));
    const rest = sources.filter((s) => ![...required].some((d) => domainMatches(s.domain, d)));
    sources = [...preferredFirst, ...rest];
  }
  if (request.preferredDomains?.length) {
    const preferred = new Set(request.preferredDomains.map((d) => d.toLowerCase()));
    const preferredFirst = sources.filter((s) => [...preferred].some((d) => domainMatches(s.domain, d)));
    const rest = sources.filter((s) => ![...preferred].some((d) => domainMatches(s.domain, d)));
    sources = [...preferredFirst, ...rest];
  }
  if (request.primarySourcesPreferred) {
    sources = preferPrimarySources(sources);
  }
  sources = sources.slice(0, request.maxSources);
  return { sources, providerSourceToCanonical };
}

function normalizeClaimText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function resolveSupportCanonicalIds(
  support: NonNullable<AIWebEvidence["citationSupports"]>[number],
  evidence: AIWebEvidence,
  sourceById: ReadonlyMap<string, ResearchSource>,
  providerSourceToCanonical: ReadonlyMap<string, string>,
): string[] {
  const directIds = (support.sourceIds ?? [])
    .map((id) => providerSourceToCanonical.get(id) ?? id)
    .filter((id): id is string => Boolean(id) && sourceById.has(id));
  const indexedIds = (support.sourceIndices ?? [])
    .map((idx) => evidence.sources[idx]?.id)
    .filter((id): id is string => Boolean(id))
    .map((id) => providerSourceToCanonical.get(id) ?? id)
    .filter((id): id is string => Boolean(id) && sourceById.has(id));
  return [...new Set([...directIds, ...indexedIds])];
}

function supportMatchesClaim(claimText: string, supportText: string): boolean {
  const a = normalizeClaimText(claimText);
  const b = normalizeClaimText(supportText);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Model structured claims provide semantic shape only — never authoritative source IDs. */
function claimsFromStructured(structured: unknown): ResearchClaim[] {
  if (!structured || typeof structured !== "object") return [];
  const rawClaims = (structured as { claims?: unknown }).claims;
  if (!Array.isArray(rawClaims)) return [];
  const claims: ResearchClaim[] = [];
  for (let i = 0; i < rawClaims.length; i++) {
    const c = rawClaims[i];
    if (!c || typeof c !== "object") continue;
    const text = typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text.trim() : "";
    if (!text) continue;
    const kindRaw = (c as { statementKind?: unknown }).statementKind;
    const statementKind: ResearchStatementKind =
      kindRaw === "inference" ||
      kindRaw === "recommendation" ||
      kindRaw === "unknown" ||
      kindRaw === "sourced_fact"
        ? kindRaw
        : "unknown";
    claims.push({
      id: typeof (c as { id?: unknown }).id === "string" ? (c as { id: string }).id : `claim_${i + 1}`,
      text: text.slice(0, 2000),
      sourceIds: [],
      confidence: null,
      sourceSupportStatus: "unsupported",
      statementKind,
    });
  }
  return claims;
}

function claimsFromCitationSupports(
  evidence: AIWebEvidence | undefined,
  sourceById: ReadonlyMap<string, ResearchSource>,
  providerSourceToCanonical: ReadonlyMap<string, string>,
  summary: string,
): ResearchClaim[] {
  if (!evidence?.citationSupports?.length) return [];
  return evidence.citationSupports.map((support, i) => {
    const sourceIds = resolveSupportCanonicalIds(
      support,
      evidence,
      sourceById,
      providerSourceToCanonical,
    );
    return {
      id: `claim_support_${i + 1}`,
      text: (support.text ?? summary.slice(support.startIndex ?? 0, support.endIndex ?? 200)).slice(0, 2000),
      sourceIds,
      confidence: null,
      sourceSupportStatus: sourceIds.length ? "supported" : "unsupported",
      statementKind: sourceIds.length ? "sourced_fact" : "unknown",
    };
  });
}

/**
 * Merge model semantic claims with provider-native citationSupports.
 * Provider evidence is authoritative for source association.
 */
function mergeClaimsWithProviderSupports(args: {
  structuredClaims: ResearchClaim[];
  evidence: AIWebEvidence | undefined;
  sourceById: ReadonlyMap<string, ResearchSource>;
  providerSourceToCanonical: ReadonlyMap<string, string>;
  summary: string;
}): ResearchClaim[] {
  const providerClaims = claimsFromCitationSupports(
    args.evidence,
    args.sourceById,
    args.providerSourceToCanonical,
    args.summary,
  );
  if (args.structuredClaims.length === 0) {
    if (providerClaims.length > 0) return providerClaims;
    if (args.summary.trim()) {
      return [
        {
          id: "claim_summary",
          text: args.summary.slice(0, 2000),
          sourceIds: [],
          confidence: null,
          sourceSupportStatus: "unsupported",
          statementKind: "unknown",
        },
      ];
    }
    return [];
  }

  const usedSupports = new Set<number>();
  const merged: ResearchClaim[] = args.structuredClaims.map((claim) => {
    if (claim.statementKind !== "sourced_fact") {
      return { ...claim, sourceIds: [], sourceSupportStatus: "unsupported" };
    }
    if (!args.evidence?.citationSupports?.length) {
      return { ...claim, sourceIds: [], sourceSupportStatus: "unsupported" };
    }
    let matchedIds: string[] = [];
    for (let i = 0; i < args.evidence.citationSupports.length; i++) {
      if (usedSupports.has(i)) continue;
      const support = args.evidence.citationSupports[i]!;
      const supportText =
        support.text ??
        args.summary.slice(support.startIndex ?? 0, support.endIndex ?? 0);
      if (!supportMatchesClaim(claim.text, supportText)) continue;
      const ids = resolveSupportCanonicalIds(
        support,
        args.evidence,
        args.sourceById,
        args.providerSourceToCanonical,
      );
      if (ids.length === 0) continue;
      usedSupports.add(i);
      matchedIds = ids;
      break;
    }
    return {
      ...claim,
      sourceIds: matchedIds,
      sourceSupportStatus: matchedIds.length ? "supported" : "unsupported",
    };
  });

  for (let i = 0; i < providerClaims.length; i++) {
    if (usedSupports.has(i)) continue;
    const leftover = providerClaims[i]!;
    if (leftover.sourceIds.length === 0) continue;
    merged.push(leftover);
  }
  return merged;
}

function applyFreshness(sources: ResearchSource[], request: ResearchRequest): ResearchSource[] {
  if (!request.freshnessDays) return sources.map((s) => ({ ...s, freshnessStatus: null }));
  const cutoff = Date.now() - request.freshnessDays * 86_400_000;
  return sources.map((s) => {
    const published = s.publishedAt ? Date.parse(s.publishedAt) : Number.NaN;
    if (!Number.isFinite(published)) return { ...s, freshnessStatus: "UNKNOWN_FOR_REQUEST" as const };
    return {
      ...s,
      freshnessStatus: published >= cutoff ? ("FRESH" as const) : ("STALE_FOR_REQUEST" as const),
    };
  });
}

export async function runGroundedResearch(rawInput: Record<string, unknown>, deps: RunGroundedResearchDeps): Promise<ResearchResult> {
  const now = deps.now?.() ?? new Date();
  const searchedAt = now.toISOString();

  let request: ResearchRequest;
  try {
    request = parseResearchRequest(rawInput);
  } catch (err) {
    return {
      status: "BLOCKED",
      question: typeof rawInput.question === "string" ? rawInput.question : "",
      summary: "",
      claims: [],
      sources: [],
      evidenceArtifactIds: [],
      summaryArtifactId: null,
      provider: null,
      model: null,
      searchedAt,
      reasonCode: "INVALID_INPUT",
      humanReason: err instanceof Error ? err.message : "invalid_research_request",
    };
  }

  if (!deps.ai.isConfigured()) {
    return {
      status: "WAITING_CONFIGURATION",
      question: request.question,
      summary: "",
      claims: [],
      sources: [],
      evidenceArtifactIds: [],
      summaryArtifactId: null,
      provider: null,
      model: null,
      searchedAt,
      reasonCode: "AI_NOT_CONFIGURED",
      humanReason: "No AI provider configured for grounded research",
    };
  }

  const geoBits = [request.geography?.city, request.geography?.state, request.geography?.country]
    .filter(Boolean)
    .join(", ");
  const userPrompt = [
    `Research question: ${request.question}`,
    request.purpose ? `Purpose: ${request.purpose}` : null,
    geoBits ? `Geography context (not assumed truth): ${geoBits}` : null,
    request.competitorNames?.length
      ? `Competitor focus (public web only): ${request.competitorNames.join(", ")}`
      : null,
    request.freshnessDays ? `Prefer sources from the last ${request.freshnessDays} days when available.` : null,
    request.requiredDomains?.length
      ? `Required sources/domains (advisory; server still enforces): ${request.requiredDomains.join(", ")}`
      : null,
    request.preferredDomains?.length
      ? `Preferred domains (advisory): ${request.preferredDomains.join(", ")}`
      : null,
    request.blockedDomains?.length
      ? `Blocked domains (advisory; server still enforces): ${request.blockedDomains.join(", ")}`
      : null,
    request.language ? `Output language: ${request.language}` : null,
    "Return structured JSON with fields: summary (string), claims (array of {id,text,statementKind}).",
    "statementKind must be one of sourced_fact|inference|recommendation|unknown.",
    "Do not invent URLs or internal source IDs. Provider grounding/citations are authoritative for evidence linkage.",
    "If sources conflict, include separate claims and note disagreement in summary.",
  ]
    .filter(Boolean)
    .join("\n");

  const aiResult = await deps.ai.execute({
    tenantId: request.tenantId,
    missionId: request.missionId,
    requestId: request.requestId,
    taskClass: request.taskClass,
    requireWebEvidence: request.requireWebEvidence,
    correlationId: request.correlationId ?? request.requestId,
    budgetEnvelope: deps.budgetEnvelope,
    messages: [
      { role: "system", content: RESEARCH_TRUSTED_SYSTEM_PREAMBLE },
      { role: "user", content: userPrompt },
    ],
  });

  if (aiResult.errorCategory === "BUDGET_EXHAUSTED") {
    return {
      status: "BLOCKED",
      question: request.question,
      summary: "",
      claims: [],
      sources: [],
      evidenceArtifactIds: [],
      summaryArtifactId: null,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: {
        inputTokens: aiResult.inputTokens,
        outputTokens: aiResult.outputTokens,
        estimatedCostUsd: aiResult.estimatedCostUsd,
      },
      selectionReceipt: aiResult.selection as unknown as Record<string, unknown>,
      searchedAt,
      reasonCode: "BUDGET_EXHAUSTED",
      humanReason: aiResult.userSafeError ?? "Usage limit reached",
    };
  }
  if (aiResult.errorCategory === "NOT_CONFIGURED" || aiResult.errorCategory === "AUTH_CONFIGURATION") {
    return {
      status: "WAITING_CONFIGURATION",
      question: request.question,
      summary: "",
      claims: [],
      sources: [],
      evidenceArtifactIds: [],
      summaryArtifactId: null,
      provider: aiResult.provider,
      model: aiResult.model,
      searchedAt,
      reasonCode: "AI_NOT_CONFIGURED",
      humanReason: aiResult.userSafeError ?? "AI not configured",
    };
  }

  const mappedSources = mapWebEvidenceToSources(aiResult.webEvidence, request, searchedAt);
  let sources = applyFreshness(mappedSources.sources, request);

  if (request.verifyTopSources && sources.length > 0) {
    sources = await verifyTopSources(
      sources,
      request.maxVerifiedFetches ?? RESEARCH_BOUNDS.maxVerifiedFetchesDefault,
      { fetcher: deps.verifyFetcher },
    );
    for (const s of sources) {
      if (!s.excerpt) continue;
      void wrapUntrustedSourceText({ url: s.url, title: s.title, excerpt: s.excerpt });
      s.excerpt = safeExcerpt(s.excerpt);
    }
  }

  const hasRequiredDomainCoverage = request.requiredDomains?.length
    ? request.requiredDomains.every((d) => sources.some((s) => domainMatches(s.domain, d)))
    : true;
  if (
    request.requireWebEvidence &&
    (sources.length < 1 ||
      aiResult.errorCategory === "INSUFFICIENT_EVIDENCE" ||
      (!aiResult.ok && (aiResult.webEvidence?.sources?.length ?? 0) < 1) ||
      !hasRequiredDomainCoverage)
  ) {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      question: request.question,
      summary: aiResult.text?.slice(0, 2000) ?? "",
      claims: [],
      sources,
      evidenceArtifactIds: [],
      summaryArtifactId: null,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: {
        inputTokens: aiResult.inputTokens,
        outputTokens: aiResult.outputTokens,
        estimatedCostUsd: aiResult.estimatedCostUsd,
      },
      selectionReceipt: aiResult.selection as unknown as Record<string, unknown>,
      searchedAt,
      reasonCode: !hasRequiredDomainCoverage ? "REQUIRED_DOMAIN_MISSING" : "INSUFFICIENT_EVIDENCE",
      humanReason: !hasRequiredDomainCoverage
        ? "Required domain evidence missing"
        : "Grounded research returned no usable web sources",
    };
  }

  const summaryText =
    (aiResult.structuredOutput &&
    typeof aiResult.structuredOutput === "object" &&
    typeof (aiResult.structuredOutput as { summary?: unknown }).summary === "string"
      ? (aiResult.structuredOutput as { summary: string }).summary
      : aiResult.text) ?? "";

  const sourceById = new Map(sources.map((s) => [s.id, s] as const));
  const structuredClaims = claimsFromStructured(aiResult.structuredOutput);
  let claims = mergeClaimsWithProviderSupports({
    structuredClaims,
    evidence: aiResult.webEvidence,
    sourceById,
    providerSourceToCanonical: mappedSources.providerSourceToCanonical,
    summary: summaryText,
  });

  const mapped = validateClaimSourceMapping({
    claims,
    sources,
    requireClaimCitations: request.requireClaimCitations,
  });
  claims = mapped.claims;
  const disagreements = [
    ...detectConflictingClaims(claims),
    ...(claims.some((c) => c.sourceSupportStatus === "conflicting")
      ? ["One or more claims marked conflicting by upstream mapping"]
      : []),
  ];

  const quality = evaluateResearchQuality({
    request,
    summary: summaryText,
    claims,
    sources,
    disagreements,
  });
  if (!quality.pass) {
    return {
      status: quality.status,
      question: request.question,
      summary: summaryText.slice(0, 4000),
      claims,
      sources,
      evidenceArtifactIds: [],
      summaryArtifactId: null,
      provider: aiResult.provider,
      model: aiResult.model,
      usage: {
        inputTokens: aiResult.inputTokens,
        outputTokens: aiResult.outputTokens,
        estimatedCostUsd: aiResult.estimatedCostUsd,
      },
      selectionReceipt: aiResult.selection as unknown as Record<string, unknown>,
      searchedAt,
      disagreements,
      reasonCode: quality.status,
      humanReason: quality.reasons.join(", "),
    };
  }

  const evidenceArtifactIds: string[] = [];
  for (const source of sources) {
    const idempotencyKey = stableEvidenceKey({
      missionId: request.missionId,
      requestId: request.requestId,
      canonicalUrl: source.canonicalUrl,
      query: source.searchQueries[0],
    });
    const existing = deps.artifacts.findByIdempotencyKey
      ? await deps.artifacts.findByIdempotencyKey({
          tenantId: request.tenantId,
          missionId: request.missionId,
          key: idempotencyKey,
        })
      : null;
    if (existing?.id) {
      evidenceArtifactIds.push(existing.id);
      continue;
    }
    const claimIds = claims.filter((c) => c.sourceIds.includes(source.id)).map((c) => c.id);
    const persisted = await deps.artifacts.persist({
      tenantId: request.tenantId,
      missionId: request.missionId,
      requestId: request.requestId,
      kind: "research_evidence",
      idempotencyKey,
      metadata: {
        ...buildEvidenceArtifactMetadata({
          tenantId: request.tenantId,
          missionId: request.missionId,
          requestId: request.requestId,
          source,
          claimIds,
        }),
        idempotencyKey,
      },
    });
    if (!persisted.ok) {
      return {
        status: "FAILED",
        question: request.question,
        summary: summaryText.slice(0, 4000),
        claims,
        sources,
        evidenceArtifactIds: [],
        summaryArtifactId: null,
        provider: aiResult.provider,
        model: aiResult.model,
        searchedAt,
        reasonCode: "ARTIFACT_PERSIST_FAILED",
        humanReason: persisted.errorMessage,
      };
    }
    evidenceArtifactIds.push(persisted.id);
  }

  const summaryKey = stableSummaryKey({
    missionId: request.missionId,
    requestId: request.requestId,
    question: request.question,
  });
  const existingSummary = deps.artifacts.findByIdempotencyKey
    ? await deps.artifacts.findByIdempotencyKey({
        tenantId: request.tenantId,
        missionId: request.missionId,
        key: summaryKey,
      })
    : null;

  let summaryArtifactId: string | null = existingSummary?.id ?? null;
  if (!summaryArtifactId) {
    const persisted = await deps.artifacts.persist({
      tenantId: request.tenantId,
      missionId: request.missionId,
      requestId: request.requestId,
      kind: "research_summary",
      idempotencyKey: summaryKey,
      metadata: {
        ...buildSummaryArtifactMetadata({
          request,
          summary: summaryText.slice(0, 8000),
          claims,
          sources,
          evidenceArtifactIds,
          provider: aiResult.provider,
          model: aiResult.model,
          selectionReceipt: aiResult.selection as unknown as Record<string, unknown>,
          searchedAt,
          disagreements,
          status: "PASS",
        }),
        idempotencyKey: summaryKey,
      },
    });
    if (!persisted.ok) {
      return {
        status: "FAILED",
        question: request.question,
        summary: summaryText.slice(0, 4000),
        claims,
        sources,
        evidenceArtifactIds: [],
        summaryArtifactId: null,
        provider: aiResult.provider,
        model: aiResult.model,
        searchedAt,
        reasonCode: "ARTIFACT_PERSIST_FAILED",
        humanReason: persisted.errorMessage,
      };
    }
    summaryArtifactId = persisted.id;
  }

  return {
    status: "PASS",
    question: request.question,
    summary: summaryText.slice(0, 8000),
    claims,
    sources,
    evidenceArtifactIds,
    summaryArtifactId,
    provider: aiResult.provider,
    model: aiResult.model,
    usage: {
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
      estimatedCostUsd: aiResult.estimatedCostUsd,
    },
    selectionReceipt: aiResult.selection as unknown as Record<string, unknown>,
    searchedAt,
    disagreements,
  };
}

export { ResearchRequestValidationError };
