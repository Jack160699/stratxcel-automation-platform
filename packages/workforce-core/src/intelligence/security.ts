import type { ScopedEvidenceRecord } from "./types.ts";
import { assertEvidenceTenantScope, filterScopedEvidence } from "./evidence/model.ts";

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export function assertBrandBrainTenant(args: { tenantId: string; brandBrainTenantId?: string | null }): void {
  if (args.brandBrainTenantId && args.brandBrainTenantId !== args.tenantId) {
    throw new TenantIsolationError("brand_brain_tenant_mismatch");
  }
}

export function assertTenantScopedEvidence(
  records: readonly ScopedEvidenceRecord[],
  ctx: { tenantId: string; missionId: string },
): ScopedEvidenceRecord[] {
  const scoped = filterScopedEvidence(records, ctx);
  if (scoped.length !== records.length) {
    throw new TenantIsolationError("cross_tenant_evidence_rejected");
  }
  for (const r of scoped) assertEvidenceTenantScope(r, ctx);
  return scoped;
}
