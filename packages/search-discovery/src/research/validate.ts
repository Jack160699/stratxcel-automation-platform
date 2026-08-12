import { RESEARCH_BOUNDS, type ResearchRequest } from "./types.ts";

export class ResearchRequestValidationError extends Error {
  readonly code = "invalid_research_request";
  constructor(message: string) {
    super(message);
    this.name = "ResearchRequestValidationError";
  }
}

function asDomainList(raw: unknown, field: string): string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) throw new ResearchRequestValidationError(`${field}_must_be_array`);
  if (raw.length > RESEARCH_BOUNDS.domainListMax) {
    throw new ResearchRequestValidationError(`${field}_too_long`);
  }
  return raw.map((d) => {
    if (typeof d !== "string" || !d.trim()) {
      throw new ResearchRequestValidationError(`${field}_invalid_domain`);
    }
    return d.trim().toLowerCase().replace(/^www\./, "");
  });
}

export function parseResearchRequest(raw: Record<string, unknown>): ResearchRequest {
  const tenantId = typeof raw.tenantId === "string" ? raw.tenantId.trim() : "";
  const missionId = typeof raw.missionId === "string" ? raw.missionId.trim() : "";
  const requestId = typeof raw.requestId === "string" ? raw.requestId.trim() : "";
  const question = typeof raw.question === "string" ? raw.question.trim() : "";

  if (!tenantId) throw new ResearchRequestValidationError("tenantId_required");
  if (!missionId) throw new ResearchRequestValidationError("missionId_required");
  if (!requestId) throw new ResearchRequestValidationError("requestId_required");
  if (question.length < RESEARCH_BOUNDS.questionMin) {
    throw new ResearchRequestValidationError("question_too_short");
  }
  if (question.length > RESEARCH_BOUNDS.questionMax) {
    throw new ResearchRequestValidationError("question_too_long");
  }

  const taskClass = raw.taskClass === "SEO_RESEARCH" ? "SEO_RESEARCH" : "RESEARCH";

  let maxSources =
    typeof raw.maxSources === "number" && Number.isFinite(raw.maxSources)
      ? Math.floor(raw.maxSources)
      : 8;
  maxSources = Math.min(
    RESEARCH_BOUNDS.maxSourcesMax,
    Math.max(RESEARCH_BOUNDS.maxSourcesMin, maxSources),
  );

  let freshnessDays: number | undefined;
  if (raw.freshnessDays != null) {
    if (typeof raw.freshnessDays !== "number" || !Number.isFinite(raw.freshnessDays)) {
      throw new ResearchRequestValidationError("freshnessDays_invalid");
    }
    freshnessDays = Math.min(
      RESEARCH_BOUNDS.freshnessDaysMax,
      Math.max(RESEARCH_BOUNDS.freshnessDaysMin, Math.floor(raw.freshnessDays)),
    );
  }

  const geography =
    raw.geography && typeof raw.geography === "object"
      ? {
          country:
            typeof (raw.geography as { country?: unknown }).country === "string"
              ? String((raw.geography as { country: string }).country).slice(0, 80)
              : undefined,
          state:
            typeof (raw.geography as { state?: unknown }).state === "string"
              ? String((raw.geography as { state: string }).state).slice(0, 80)
              : undefined,
          city:
            typeof (raw.geography as { city?: unknown }).city === "string"
              ? String((raw.geography as { city: string }).city).slice(0, 80)
              : undefined,
        }
      : undefined;

  let maxVerifiedFetches =
    typeof raw.maxVerifiedFetches === "number" && Number.isFinite(raw.maxVerifiedFetches)
      ? Math.floor(raw.maxVerifiedFetches)
      : RESEARCH_BOUNDS.maxVerifiedFetchesDefault;
  maxVerifiedFetches = Math.min(
    RESEARCH_BOUNDS.maxVerifiedFetchesHard,
    Math.max(0, maxVerifiedFetches),
  );

  const preferredDomains = asDomainList(raw.preferredDomains, "preferredDomains");
  const blockedDomains = asDomainList(raw.blockedDomains, "blockedDomains");
  const requiredDomains = asDomainList(raw.requiredDomains, "requiredDomains");
  if (requiredDomains?.length && blockedDomains?.length) {
    const blocked = new Set(blockedDomains);
    const conflict = requiredDomains.find((d) => blocked.has(d));
    if (conflict) {
      throw new ResearchRequestValidationError(`required_blocked_domain_conflict:${conflict}`);
    }
  }

  return {
    tenantId,
    missionId,
    requestId,
    question,
    purpose: typeof raw.purpose === "string" ? raw.purpose.slice(0, 500) : undefined,
    taskClass,
    geography,
    language: typeof raw.language === "string" ? raw.language.slice(0, 32) : undefined,
    freshnessDays,
    maxSources,
    preferredDomains,
    blockedDomains,
    requiredDomains,
    primarySourcesPreferred: raw.primarySourcesPreferred !== false,
    requireWebEvidence: raw.requireWebEvidence !== false,
    requireClaimCitations: raw.requireClaimCitations !== false,
    correlationId:
      typeof raw.correlationId === "string" ? raw.correlationId.slice(0, 128) : undefined,
    competitorNames: Array.isArray(raw.competitorNames)
      ? raw.competitorNames
          .filter((n): n is string => typeof n === "string")
          .map((n) => n.slice(0, 120))
          .slice(0, 10)
      : undefined,
    verifyTopSources: raw.verifyTopSources !== false,
    maxVerifiedFetches,
  };
}
