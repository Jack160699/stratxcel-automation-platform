import type { CapabilityExecutionStatus, CapabilityKey } from "./types.ts";
import type { CapabilityReasonCode } from "./reason-codes.ts";
import type { ProviderErrorCategory, ProviderUsageMetadata } from "../providers/types.ts";

export interface CapabilityBudgetEnvelope {
  remainingCents: number;
  reservedCents?: number;
}

export interface CapabilityAuthorizationContext {
  /** Trusted tenant from runtime — never model-forged authority. */
  trustedTenantId: string;
  approvalGranted?: boolean;
  standingAuthorizationGranted?: boolean;
  shadowMode?: boolean;
  killSwitchActive?: boolean;
  /** Explicit marker that this context came from a planner snapshot (must not authorize). */
  fromPlannerSnapshot?: boolean;
}

export interface CapabilityExecutionRequest {
  requestId: string;
  missionId: string;
  tenantId: string;
  stageId?: string;
  department: string;
  role: string;
  capability: CapabilityKey | string;
  inputArtifactIds: readonly string[];
  requestedAt: string;
  budgetEnvelope?: CapabilityBudgetEnvelope;
  authorizationContext: CapabilityAuthorizationContext;
  /** Optional payload for provider adapters (never includes credentials). */
  input?: Record<string, unknown>;
}

export interface CapabilityExecutionResult {
  requestId: string;
  capability: string;
  status: CapabilityExecutionStatus;
  outputArtifactIds: readonly string[];
  providerKey?: string;
  providerReference?: string;
  usage?: ProviderUsageMetadata;
  cost?: {
    amount: number | null;
    currency: string | null;
    costKnown: boolean;
  };
  receipt?: Record<string, unknown>;
  errorClassification?: ProviderErrorCategory;
  reasonCode?: CapabilityReasonCode;
  humanReason?: string;
  evaluatedAt: string;
}
