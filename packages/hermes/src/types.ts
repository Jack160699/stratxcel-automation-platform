import type { BrandBrainContent } from "@stratxcel/brand-brain";
import type { MissionRow } from "@stratxcel/missions";

export type HermesOutcome =
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "AWAITING_INPUT"
  | "AWAITING_APPROVAL"
  | "HUMAN_HANDOFF"
  | "BLOCKED";

export interface HermesProgressEvent {
  atIso: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface HermesExecutionResult {
  outcome: HermesOutcome;
  summary: string;
  progressEvents?: HermesProgressEvent[];
  artifactRefs?: string[];
}

/**
 * The 12 restricted tools Hermes may call back into StratExcel with — this
 * is the exhaustive allowlist. Anything not in this union is not a tool
 * Hermes can invoke, by construction (ToolName is a closed type, and
 * apps/hermes-gateway's dispatcher only recognizes these names).
 */
export type ToolName =
  | "get_brand_context"
  | "get_service_definition"
  | "create_draft_artifact"
  | "update_mission_progress"
  | "request_approval"
  | "get_approval_status"
  | "create_human_handoff"
  | "query_publication_status"
  | "submit_publish_request"
  | "create_website_change_request"
  | "create_crm_lead"
  | "attach_research_evidence";

/**
 * What Hermes actually receives when a mission starts — no secrets, no
 * service-role credentials, no other tenant's data. Compiled once by
 * compileMissionContext and handed to the adapter alongside a short-lived,
 * mission-scoped tool token; Hermes never sees a Supabase key, a social
 * access token, or a Razorpay secret, per the master brief's non-negotiable
 * rule.
 */
export interface MissionScopedContext {
  missionId: string;
  tenantId: string;
  goalText: string;
  serviceKey: string | null;
  hermesProfile: string | null;
  brandBrainVersion: number | null;
  brandBrain: BrandBrainContent | null;
  budgetCents: number;
  allowedTools: ToolName[];
}

export function missionToContextInput(mission: MissionRow): Pick<MissionScopedContext, "missionId" | "tenantId" | "goalText" | "serviceKey" | "hermesProfile" | "brandBrainVersion" | "budgetCents"> {
  return {
    missionId: mission.id,
    tenantId: mission.tenant_id,
    goalText: mission.goal_text,
    serviceKey: mission.service_key,
    hermesProfile: mission.hermes_profile,
    brandBrainVersion: mission.brand_brain_version,
    budgetCents: mission.estimated_cost_cents ?? 0,
  };
}

export interface HermesHealthStatus {
  healthy: boolean;
  mode: "disabled" | "mock" | "http";
  details?: string;
}

export class HermesTimeoutError extends Error {
  constructor(message = "Hermes request timed out") {
    super(message);
    this.name = "HermesTimeoutError";
  }
}

export class HermesUnavailableError extends Error {
  constructor(message = "Hermes runtime is unavailable") {
    super(message);
    this.name = "HermesUnavailableError";
  }
}

/** Whether a failure calling Hermes is worth retrying (network/5xx/timeout) vs. not (4xx — a real rejection). */
export function isRetryableHermesFailure(err: unknown): boolean {
  if (err instanceof HermesTimeoutError) return true;
  if (err instanceof HermesUnavailableError) return true;
  return false;
}
