import { z } from "zod";
import { IsoTimestamp, MissionId, RunId, TenantId } from "./common.ts";
import { ToolRequest, ToolResult } from "./tools.ts";

/**
 * Confirmed Runs API SSE event types, from docs/hermes/EVENT_MODEL.md.
 * `run.paused_approval` is NOT a confirmed Hermes event name — it is a
 * conservative placeholder pending verification (see
 * docs/hermes/MANUAL_REQUIREMENTS.md item 1) so the discriminated union has
 * a slot for it without guessing the real wire value.
 */
export const HermesExecutionEventType = z.enum([
  "assistant.delta",
  "tool.started",
  "tool.completed",
  "subagent.start",
  "subagent.complete",
  "run.completed",
  "run.paused_approval",
]);
export type HermesExecutionEventType = z.infer<typeof HermesExecutionEventType>;

const HermesExecutionEventBase = z.object({
  tenantId: TenantId,
  missionId: MissionId,
  runId: RunId,
  /** Monotonic per-run sequence assigned by Stratxcel on ingest, not by Hermes. */
  sequence: z.number().int().nonnegative(),
  receivedVia: z.enum(["sse", "webhook"]),
  receivedAt: IsoTimestamp,
});

export const HermesExecutionEvent = z.discriminatedUnion("type", [
  HermesExecutionEventBase.extend({
    type: z.literal("assistant.delta"),
    textDelta: z.string(),
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("tool.started"),
    tool: ToolRequest,
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("tool.completed"),
    tool: ToolResult,
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("subagent.start"),
    subagentProfile: z.string().min(1),
    subagentRunId: RunId,
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("subagent.complete"),
    subagentRunId: RunId,
    status: z.enum(["completed", "failed", "cancelled"]),
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("run.completed"),
    status: z.enum(["completed", "failed", "cancelled", "needs_clarification"]),
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("run.paused_approval"),
    approvalRequestId: z.uuid(),
  }),
]);
export type HermesExecutionEvent = z.infer<typeof HermesExecutionEvent>;
