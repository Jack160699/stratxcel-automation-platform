import type {
  FactualClaim,
  SearchIntent,
  SeoArticleBrief,
  SeoArticleDraft,
} from "./types.ts";

export class ArticleEvidenceRequiredError extends Error {
  readonly code = "article_evidence_required";
  constructor(message = "article_evidence_required") {
    super(message);
    this.name = "ArticleEvidenceRequiredError";
  }
}

export class KeywordStuffingError extends Error {
  readonly code = "keyword_stuffing_rejected";
  constructor(message = "keyword_stuffing_rejected") {
    super(message);
    this.name = "KeywordStuffingError";
  }
}

export class UnsupportedFactualClaimError extends Error {
  readonly code = "unsupported_factual_claim";
  constructor(message = "unsupported_factual_claim") {
    super(message);
    this.name = "UnsupportedFactualClaimError";
  }
}

function detectKeywordStuffing(body: string, primaryQuery: string): boolean {
  const tokens = primaryQuery.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const lower = body.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const phrase = tokens.join(" ");
  let phraseHits = 0;
  let idx = 0;
  while (idx < lower.length) {
    const found = lower.indexOf(phrase, idx);
    if (found < 0) break;
    phraseHits += 1;
    idx = found + phrase.length;
  }
  // Require repeated exact-phrase spam — a single natural use is fine.
  const density = phraseHits / Math.max(1, words.length);
  return phraseHits >= 6 || (phraseHits >= 4 && density > 0.12);
}

export function buildSeoArticleBrief(input: {
  tenantId: string;
  primaryQuery: string;
  intent: SearchIntent;
  outline: readonly string[];
  evidenceIds: readonly string[];
  businessObjective: string;
}): SeoArticleBrief {
  if (!input.evidenceIds.length) {
    throw new ArticleEvidenceRequiredError("SEO article brief requires evidence ids");
  }
  return {
    kind: "seo_article_brief",
    id: `seo_article_brief_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    primaryQuery: input.primaryQuery,
    intent: input.intent,
    outline: [...input.outline],
    evidenceIds: [...input.evidenceIds],
    businessObjective: input.businessObjective,
  };
}

export function buildSeoArticleDraft(input: {
  tenantId: string;
  brief: SeoArticleBrief;
  title: string;
  body: string;
  factualClaims: readonly FactualClaim[];
}): SeoArticleDraft {
  if (!input.brief.evidenceIds.length) {
    throw new ArticleEvidenceRequiredError("SEO article draft requires research evidence");
  }

  if (detectKeywordStuffing(input.body, input.brief.primaryQuery)) {
    throw new KeywordStuffingError("keyword stuffing rejected");
  }

  const allowed = new Set(input.brief.evidenceIds);
  for (const claim of input.factualClaims) {
    if (!claim.evidenceId || !allowed.has(claim.evidenceId)) {
      throw new UnsupportedFactualClaimError(
        `External factual claim lacks linked evidence: ${claim.claim}`,
      );
    }
  }

  return {
    kind: "seo_article_draft",
    id: `seo_article_draft_${crypto.randomUUID()}`,
    tenantId: input.tenantId,
    title: input.title,
    body: input.body,
    primaryQuery: input.brief.primaryQuery,
    factualClaims: [...input.factualClaims],
    evidenceIds: [...input.brief.evidenceIds],
    keywordStuffingRejected: false,
    publishAuthorized: false,
  };
}
