import type { ToolName } from "@stratxcel/hermes";
import { getCapability } from "../capabilities/registry.ts";
import { isCapabilityKey, isNonExecutableStatus } from "../capabilities/types.ts";

export class SecurityValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SecurityValidationError";
    this.code = code;
  }
}

export class CapabilityEscalationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityEscalationError";
  }
}

export interface TrustedScopeInput {
  trustedTenantId: string;
  requestTenantId: string;
  departmentExists: boolean;
  roleExists: boolean;
}

export function assertTrustedScope(input: TrustedScopeInput): void {
  if (input.trustedTenantId !== input.requestTenantId) {
    throw new SecurityValidationError("tenant_mismatch", "Tenant scope mismatch");
  }
  if (!input.departmentExists) {
    throw new SecurityValidationError("unknown_department", "Unknown department");
  }
  if (!input.roleExists) {
    throw new SecurityValidationError("unknown_role", "Unknown role");
  }
}

export function narrowTools(parentTools: readonly ToolName[], childTools: readonly ToolName[]): ToolName[] {
  const parentSet = new Set(parentTools);
  for (const tool of childTools) {
    if (!parentSet.has(tool)) {
      throw new Error(`Child tool escalation rejected: ${tool}`);
    }
  }
  return [...childTools];
}

export function narrowCapabilityClasses(
  parentCapabilities: readonly string[],
  childCapabilities: readonly string[],
): string[] {
  const parentSet = new Set(parentCapabilities);
  const narrowed: string[] = [];
  for (const cap of childCapabilities) {
    if (!isCapabilityKey(cap) || !getCapability(cap)) {
      throw new SecurityValidationError("unknown_capability", `Unknown capability: ${cap}`);
    }
    if (!parentSet.has(cap)) {
      throw new CapabilityEscalationError(`Child capability escalation rejected: ${cap}`);
    }
    narrowed.push(cap);
  }
  return narrowed;
}

export function assertNoExternalMutationFromPlanAlone(
  capabilityKey: string,
  executionAuthorized: boolean,
): void {
  const cap = getCapability(capabilityKey);
  if (cap?.externalMutation && !executionAuthorized) {
    throw new SecurityValidationError(
      "external_mutation_not_authorized",
      `External mutation not authorized for ${capabilityKey}`,
    );
  }
}

export function isBlockedCapability(key: string): boolean {
  const cap = getCapability(key);
  return !!cap && isNonExecutableStatus(cap.status);
}

export function assertCapabilitiesExecutable(required: readonly string[]): void {
  for (const cap of required) {
    const def = getCapability(cap);
    if (!def) {
      throw new SecurityValidationError("unknown_capability", `Unknown capability: ${cap}`);
    }
    if (isNonExecutableStatus(def.status)) {
      throw new SecurityValidationError("capability_unavailable", `Capability unavailable: ${cap}`);
    }
  }
}
