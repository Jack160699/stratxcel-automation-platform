import type {
  EvidenceClaim, EvidenceQualityVerdict, EvidenceSourceType, IntelligenceClaimStatus, ScopedEvidenceRecord,
} from "../types.ts";
import { EVIDENCE_FRESHNESS_WINDOWS, FIRST_PARTY_SOURCE_TYPES } from "../types.ts";

export class EvidenceScopeError extends Error {
  constructor(message: string) { super(message); this.name = "EvidenceScopeError"; }
}
export class EvidenceGovernanceError extends Error {
  constructor(message: string) { super(message); this.name = "EvidenceGovernanceError"; }
}

export interface EvidenceValidationContext { tenantId: string; missionId: string; nowIso: string; }

const EXTERNAL = new Set<EvidenceSourceType>(["research_web", "research_serp", "third_party_report"]);

function ageDays(retrievedAtIso: string, nowIso: string): number {
  return Math.floor((Date.parse(nowIso) - Date.parse(retrievedAtIso)) / 86400000);
}

export function assertEvidenceTenantScope(record: ScopedEvidenceRecord, ctx: { tenantId: string; missionId: string }): void {
  if (record.tenantId !== ctx.tenantId) throw new EvidenceScopeError(`cross_tenant_evidence:${record.id}`);
  if (record.missionId !== ctx.missionId) throw new EvidenceScopeError(`cross_mission_evidence:${record.id}`);
}

export function filterScopedEvidence(records: readonly ScopedEvidenceRecord[], ctx: { tenantId: string; missionId: string }): ScopedEvidenceRecord[] {
  return records.filter((r) => { try { assertEvidenceTenantScope(r, ctx); return true; } catch { return false; } });
}

export function isEvidenceFresh(record: ScopedEvidenceRecord, nowIso: string): boolean {
  return ageDays(record.retrievedAtIso, nowIso) <= EVIDENCE_FRESHNESS_WINDOWS[record.sourceType];
}

export function classifyFirstParty(record: ScopedEvidenceRecord): boolean {
  return record.isFirstParty || FIRST_PARTY_SOURCE_TYPES.has(record.sourceType);
}

export function resolveClaimStatus(args: {
  statement: string;
  requestedStatus: IntelligenceClaimStatus;
  supportingRecords: readonly ScopedEvidenceRecord[];
  ctx: EvidenceValidationContext;
}) {
  const rejections: string[] = [];
  const fresh = args.supportingRecords.filter((r) => {
    try { assertEvidenceTenantScope(r, args.ctx); } catch { rejections.push(`scope:${r.id}`); return false; }
    if (!isEvidenceFresh(r, args.ctx.nowIso)) { rejections.push(`stale:${r.id}`); return false; }
    return true;
  });
  if (fresh.length === 0) return { status: "RESEARCH_REQUIRED" as const, qualityVerdict: "INSUFFICIENT" as const, evidenceIds: [], rejectionReasons: rejections };

  const firstParty = fresh.filter(classifyFirstParty);
  const external = fresh.filter((r) => EXTERNAL.has(r.sourceType));
  const supports = (set: ScopedEvidenceRecord[]) => set.some((r) => r.supportedClaims.some((c) => c === args.statement || args.statement.includes(c)));

  let status: IntelligenceClaimStatus = args.requestedStatus;
  let qualityVerdict: EvidenceQualityVerdict = "INSUFFICIENT";
  if (supports(firstParty)) {
    status = firstParty.some((r) => r.sourceType === "customer_provided") ? "KNOWN_CUSTOMER_PROVIDED" : "KNOWN";
    qualityVerdict = "SUPPORTED";
  } else if (supports(external)) {
    if (status === "KNOWN" || status === "KNOWN_CUSTOMER_PROVIDED") {
      rejections.push("external_claim_cannot_become_known");
      status = "DERIVED";
    }
    qualityVerdict = "PARTIALLY_SUPPORTED";
  } else if (status === "KNOWN") {
    status = "ASSUMPTION";
    qualityVerdict = "INSUFFICIENT";
  }
  return { status, qualityVerdict, evidenceIds: fresh.map((r) => r.id), rejectionReasons: rejections };
}

export function buildEvidenceClaim(args: {
  claimId: string; statement: string; domain: string; requestedStatus: IntelligenceClaimStatus;
  supportingRecords: readonly ScopedEvidenceRecord[]; ctx: EvidenceValidationContext;
}): EvidenceClaim {
  const r = resolveClaimStatus(args);
  return { claimId: args.claimId, statement: args.statement, domain: args.domain, status: r.status, evidenceIds: r.evidenceIds, qualityVerdict: r.qualityVerdict };
}

export function assessEvidenceQuality(records: readonly ScopedEvidenceRecord[], ctx: EvidenceValidationContext): EvidenceQualityVerdict {
  const scoped = filterScopedEvidence(records, ctx).filter((r) => isEvidenceFresh(r, ctx.nowIso));
  if (scoped.length === 0) return "INSUFFICIENT";
  const fp = scoped.filter(classifyFirstParty).length;
  const ext = scoped.filter((r) => EXTERNAL.has(r.sourceType)).length;
  if (fp >= 2 || (fp === 1 && ext === 0)) return "SUPPORTED";
  if (fp >= 1 && ext >= 1) return "PARTIALLY_SUPPORTED";
  if (ext >= 2) return "PARTIALLY_SUPPORTED";
  return "INSUFFICIENT";
}
