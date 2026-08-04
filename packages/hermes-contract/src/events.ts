import { z } from "zod";
import { IsoTimestamp, MissionId, RunId, TenantId } from "./common.ts";
import { ToolRequest, ToolResult } from "./tools.ts";

/**
 * Runs API SSE event types. Corrected against a live, source-verified
 * Hermes v0.20.0 instance (see docs/hermes/RECONCILIATION.md) — this
 * supersedes the foundation branch's docs-only modeling in three ways:
 *
 * 1. The real assistant-text-delta event is `message.delta`, not
 *    `assistant.delta` (the docs page reviewed used the OpenAI-family name;
 *    Hermes' own source uses its native name).
 * 2. The approval-pause event is `approval.request` (run status becomes
 *    `waiting_for_approval`), not the `run.paused_approval` placeholder —
 *    resolves docs/hermes/MANUAL_REQUIREMENTS.md item 1.
 * 3. `run.completed` / `run.failed` / `run.cancelled` are three distinct
 *    event types on the wire, not one `run.completed` event carrying a
 *    status field.
 *
 * `subagent.start`/`subagent.complete` remain as documented (not
 * independently re-verified by the local test — Hermes' delegate_task
 * subagent flow was not exercised).
 */
export const HermesExecutionEventType = z.enum([
  "message.delta",
  "reasoning.available",
  "tool.started",
  "tool.completed",
  "approval.request",
  "approval.responded",
  "subagent.start",
  "subagent.complete",
  "run.completed",
  "run.failed",
  "run.cancelled",
]);
export type HermesExecutionEventType = z.infer<typeof HermesExecutionEventType>;

const HermesExecutionEventBase = z.object({
  tenantId: TenantId,
  missionId: MissionId,
  runId: RunId,
  /** Monotonic per-run sequence assigned by Stratxcel on ingest, not by Hermes. */
  sequence: z.number().int().nonnegative(),
  receivedVia: z.enum(["sse", "webhook", "backfill"]),
  receivedAt: IsoTimestamp,
});

export const HermesExecutionEvent = z.discriminatedUnion("type", [
  HermesExecutionEventBase.extend({
    type: z.literal("message.delta"),
    textDelta: z.string(),
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("reasoning.available"),
    reasoning: z.string(),
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
    type: z.literal("approval.request"),
    /** Command/args are redacted by Hermes before this ever reaches the SSE stream. */
    toolName: z.string().min(1).optional(),
    approvalRequestId: z.uuid().optional(),
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("approval.responded"),
    choice: z.enum(["once", "session", "always", "deny"]),
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
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("run.failed"),
    error: z.string(),
  }),
  HermesExecutionEventBase.extend({
    type: z.literal("run.cancelled"),
  }),
]);
export type HermesExecutionEvent = z.infer<typeof HermesExecutionEvent>;
