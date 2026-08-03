import { z } from "zod";
import { IsoTimestamp } from "./common.ts";

/**
 * A tool invocation, shaped to be compatible with both Hermes' `/v1/responses`
 * `function_call` output items and the Runs API's `tool.started` event
 * payload. See docs/hermes/API_CONTRACT.md.
 */
export const ToolRequest = z.object({
  callId: z.string().min(1),
  /** Hermes-namespaced tool name, e.g. `mcp_stratxcel_vercel_preview_deploy`. */
  name: z.string().min(1),
  /** Raw arguments as Hermes/the tool schema defines them — not re-validated here. */
  arguments: z.record(z.string(), z.unknown()),
  requestedAt: IsoTimestamp,
});
export type ToolRequest = z.infer<typeof ToolRequest>;

export const ToolResultStatus = z.enum([
  "ok",
  "error",
  "pending_approval",
  "rejected",
]);
export type ToolResultStatus = z.infer<typeof ToolResultStatus>;

/**
 * Result of a tool invocation. `status: "pending_approval"` is the shape a
 * Stratxcel-brokered sensitive tool returns instead of executing — see
 * docs/hermes/APPROVAL_AND_HANDOFF.md.
 */
export const ToolResult = z.object({
  callId: z.string().min(1),
  name: z.string().min(1),
  status: ToolResultStatus,
  /** Present when status is "ok"; tool-defined shape, not re-validated here. */
  output: z.unknown().optional(),
  /** Present when status is "error" or "rejected". */
  errorMessage: z.string().optional(),
  /** Present when status is "pending_approval" — links to an ApprovalRequest. */
  approvalRequestId: z.uuid().optional(),
  completedAt: IsoTimestamp,
});
export type ToolResult = z.infer<typeof ToolResult>;
