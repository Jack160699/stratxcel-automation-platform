import { z } from "zod";
import { IsoTimestamp, MissionId, TenantId } from "./common.ts";

export const ApprovalRiskCategory = z.enum([
  "production_deploy",
  "publish",
  "outbound_message",
  "spend",
  "destructive",
  "other_sensitive",
]);
export type ApprovalRiskCategory = z.infer<typeof ApprovalRiskCategory>;

/**
 * Created by the Stratxcel MCP tool server when a `sensitive: true` tool is
 * called, instead of executing the tool. See docs/hermes/APPROVAL_AND_HANDOFF.md.
 */
export const ApprovalRequest = z.object({
  approvalRequestId: z.uuid(),
  tenantId: TenantId,
  missionId: MissionId,
  toolName: z.string().min(1),
  toolArguments: z.record(z.string(), z.unknown()),
  riskCategory: ApprovalRiskCategory,
  /** Human-readable summary of what would happen if approved — shown in the review UI. */
  summary: z.string().min(1),
  requestedAt: IsoTimestamp,
  status: z.enum(["pending", "approved", "rejected", "expired"]),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

/**
 * A human's resolution of an ApprovalRequest. Delivered to Hermes via
 * `POST /v1/runs/{run_id}/approval` when the run is genuinely paused, or
 * used to trigger a new, linked mission step otherwise — see
 * docs/hermes/APPROVAL_AND_HANDOFF.md for why it's never a silent replay.
 */
export const ApprovalDecision = z.object({
  approvalRequestId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  /** Stratxcel user ID of the decider — never omitted, for audit purposes. */
  decidedBy: z.string().min(1),
  decidedAt: IsoTimestamp,
  /** Required when decision is "rejected"; optional context when "approved". */
  reason: z.string().optional(),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;
