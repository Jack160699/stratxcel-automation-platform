import {
  getCapabilityOperationClass,
  type CapabilityOperationClass,
} from "./operation-class.ts";

const SECRET_KEY_PATTERN =
  /^(?:.*(?:token|secret|password|api[_-]?key|authorization|credential|private[_-]?key).*)$/i;

/**
 * Scrub receipt detail of secrets, long opaque tokens, and nested credential bags.
 */
export function scrubReceiptDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (typeof value === "string" && value.length >= 40 && /^[A-Za-z0-9_\-.=+/]+$/.test(value)) {
      out[key] = "[redacted]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = scrubReceiptDetail(value as Record<string, unknown>);
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? scrubReceiptDetail(item as Record<string, unknown>)
          : item,
      );
      continue;
    }
    out[key] = value;
  }
  return out;
}

export interface CapabilityExecutionReceipt {
  kind: "capability_execution_receipt";
  capability: string;
  providerKey: string;
  tenantId: string;
  missionId: string;
  requestId: string;
  operationClass: CapabilityOperationClass | null;
  externalMutation: boolean;
  externalMutationOccurred: boolean;
  shadowPreventedMutation: boolean;
  approvalUsed: boolean;
  simulated: false;
  createdAt: string;
  idempotencyKey: string | null;
  inputArtifactIds: readonly string[];
  outputArtifactIds: readonly string[];
  integrationKey: string | null;
  providerExternalId: string | null;
  detail: Record<string, unknown>;
}

export function buildCapabilityExecutionReceipt(input: {
  capability: string;
  providerKey: string;
  tenantId: string;
  missionId: string;
  requestId: string;
  operationClass?: CapabilityOperationClass | null;
  externalMutation?: boolean;
  externalMutationOccurred?: boolean;
  shadowPreventedMutation?: boolean;
  approvalUsed?: boolean;
  idempotencyKey?: string | null;
  inputArtifactIds?: readonly string[];
  outputArtifactIds?: readonly string[];
  integrationKey?: string | null;
  providerExternalId?: string | null;
  detail?: Record<string, unknown>;
  createdAt?: string;
}): CapabilityExecutionReceipt {
  return {
    kind: "capability_execution_receipt",
    capability: input.capability,
    providerKey: input.providerKey,
    tenantId: input.tenantId,
    missionId: input.missionId,
    requestId: input.requestId,
    operationClass:
      input.operationClass ?? getCapabilityOperationClass(input.capability),
    externalMutation: input.externalMutation === true,
    externalMutationOccurred: input.externalMutationOccurred === true,
    shadowPreventedMutation: input.shadowPreventedMutation === true,
    approvalUsed: input.approvalUsed === true,
    simulated: false,
    createdAt: input.createdAt ?? new Date().toISOString(),
    idempotencyKey: input.idempotencyKey ?? null,
    inputArtifactIds: [...(input.inputArtifactIds ?? [])],
    outputArtifactIds: [...(input.outputArtifactIds ?? [])],
    integrationKey: input.integrationKey ?? null,
    providerExternalId: input.providerExternalId ?? null,
    detail: scrubReceiptDetail(input.detail ?? {}),
  };
}
