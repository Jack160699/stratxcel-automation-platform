import type { ComplianceReasonCode, RevisionRequest } from "../types.ts";
import type { QualityPolicy } from "@stratxcel/workforce-core";

export interface CreateRevisionRequestInput {
  artifactId: string;
  artifactVersion: number;
  requestedByDepartment: string;
  requestedByRole: string;
  reasonCodes: readonly ComplianceReasonCode[];
  requiredChanges: readonly string[];
  revisionNumber: number;
  createdAtIso?: string;
}

export function createRevisionRequest(input: CreateRevisionRequestInput): RevisionRequest {
  if (input.reasonCodes.length === 0) {
    throw new Error("revision_request_requires_reason_codes");
  }
  if (input.requiredChanges.length === 0) {
    throw new Error("revision_request_requires_required_changes");
  }
  if (input.revisionNumber < 1) {
    throw new Error("revision_number_must_be_positive");
  }

  return {
    artifactId: input.artifactId,
    artifactVersion: input.artifactVersion,
    requestedByDepartment: input.requestedByDepartment,
    requestedByRole: input.requestedByRole,
    reasonCodes: [...input.reasonCodes],
    requiredChanges: [...input.requiredChanges],
    revisionNumber: input.revisionNumber,
    createdAtIso: input.createdAtIso ?? new Date().toISOString(),
  };
}

export function enforceRevisionCap(policy: QualityPolicy, revisionCount: number): void {
  if (revisionCount > policy.maxRevisionCount) {
    throw new Error("revision_cap_exceeded");
  }
}

export function nextRevisionNumber(currentCount: number): number {
  return currentCount + 1;
}

export function isStructuredRevisionRequest(request: RevisionRequest): boolean {
  return (
    typeof request.artifactId === "string" &&
    typeof request.artifactVersion === "number" &&
    request.reasonCodes.length > 0 &&
    request.requiredChanges.length > 0 &&
    typeof request.revisionNumber === "number" &&
    typeof request.createdAtIso === "string"
  );
}
