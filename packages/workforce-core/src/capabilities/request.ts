import type { CapabilityExecutionStatus, CapabilityKey } from "./types.ts";
import type { CapabilityReasonCode } from "./reason-codes.ts";
import type { ProviderErrorCategory, ProviderUsageMetadata } from "../providers/types.ts";

export interface CapabilityBudgetEnvelope {
  /** Remaining budget in cents (also exposed as `remaining` for callers). */
  remainingCents: number;
  /** Alias of remainingCents for gate checks that use `.remaining`. */
  remaining?: number;
  reservedCents?: number;
  /** Known max cost estimate in cents; unknown/omitted is OK. */
  estimatedMaxCostCents?: number;
}

export interface ArtifactRecord {
  id: string;
  tenantId: string;
  missionId?: string;
  kind: string;
  version?: string;
  status?: string;
}

export type ArtifactResolver = (id: string) => ArtifactRecord | null | Promise<ArtifactRecord | null>;

/**
 * Trusted runtime policy for artifact usage — never model/Hermes-supplied.
 * Default without this policy: artifact.missionId must equal request.missionId.
 */
export interface ArtifactUsagePolicy {
  /**
   * Explicit artifact IDs authorized for cross-mission reuse within the tenant
   * (e.g. customer-selected Brand Brain reference, tenant media library asset).
   */
  authorizedArtifactIds?: readonly string[];
  /**
   * Artifact kinds that may be reused across missions when tenant-scoped
   * (e.g. brand_brain, tenant_media_library).
   */
  allowReusableTenantKinds?: readonly string[];
}

/**
 * Capability authorization context from trusted runtime — never model-forged.
 *
 * standingAuthorizationGranted alone must NEVER become universal standing auth
 * across Social / WhatsApp / CRM / Ads / Website. Prefer scoped fields below.
 */
export interface CapabilityAuthorizationContext {
  /** Trusted tenant from runtime — never model-forged authority. */
  trustedTenantId: string;
  approvalGranted?: boolean;
  /**
   * @deprecated Prefer authorizationKind + authorizationCapability (+ optional scope id).
   * When true without matching capability scope, standing auth must not authorize
   * an unrelated capability.
   */
  standingAuthorizationGranted?: boolean;
  /**
   * Standing authorization kind (e.g. PACKAGE_AUTO_PUBLISH, CRM_WRITE_STANDING).
   * Required together with authorizationCapability when using standing auth.
   */
  authorizationKind?: string;
  /** Capability key this standing authorization applies to. Must match request.capability. */
  authorizationCapability?: string;
  /** Optional deterministic scope id (package assignment, campaign, etc.). */
  authorizationScopeId?: string;
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
  /** Known max cost estimate; unknown/omitted is OK. */
  estimatedMaxCostCents?: number;
  authorizationContext: CapabilityAuthorizationContext;
  /** Optional payload for provider adapters (never includes credentials). */
  input?: Record<string, unknown>;
  /**
   * Authoritative expected artifact versions keyed by artifact id.
   * Trusted runtime only — never model-supplied metadata as authority.
   */
  expectedArtifactVersions?: Readonly<Record<string, string>>;
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
