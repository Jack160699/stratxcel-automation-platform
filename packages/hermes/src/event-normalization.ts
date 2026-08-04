import type { HermesExecutionEvent } from "@stratxcel/hermes-contract";

/**
 * Stratxcel's own mission event vocabulary — stable across whichever agent
 * runtime is behind AgentRuntimeAdapter, so UI/audit/webhook consumers
 * never depend on Hermes' wire event names directly. A few members
 * (`approval.responded`, `mission.failed`, `task.completed`) go beyond the
 * literal list in the master brief because the Hermes wire protocol
 * distinguishes cases the brief's list collapsed (e.g. a top-level run
 * failure vs. a delegated subagent task failure) — adding them here avoids
 * lossy mapping rather than expanding scope.
 */
export type StratxcelMissionEventType =
  | "mission.accepted"
  | "mission.plan_created"
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "assistant.progress"
  | "tool.requested"
  | "tool.started"
  | "tool.completed"
  | "artifact.created"
  | "approval.required"
  | "approval.responded"
  | "awaiting_input"
  | "human.handoff"
  | "mission.completed"
  | "mission.failed"
  | "mission.cancelled";

export interface StratxcelMissionEvent {
  tenantId: string;
  missionId: string;
  runId: string;
  type: StratxcelMissionEventType;
  /** Same sequence as the source HermesExecutionEvent — see idempotency note below. */
  sequence: number;
  occurredAt: string;
  payload: Record<string, unknown>;
}

const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN = /token|secret|key|password|authorization|credential/i;

function redactArguments(args: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    redacted[k] = SENSITIVE_KEY_PATTERN.test(k) ? REDACTED : v;
  }
  return redacted;
}

/** Tool names (Stratxcel tool names or Hermes builtin toolset names) that mean more than a generic tool.completed to Stratxcel's own event consumers. */
const ARTIFACT_TOOL_NAME_PATTERN = /artifact|draft_save|asset_save/i;
const HANDOFF_TOOL_NAME_PATTERN = /human_handoff/i;
const CLARIFY_TOOL_NAME = "clarify";

function makeEvent(
  source: HermesExecutionEvent,
  type: StratxcelMissionEventType,
  payload: Record<string, unknown>
): StratxcelMissionEvent {
  return {
    tenantId: source.tenantId,
    missionId: source.missionId,
    runId: source.runId,
    type,
    sequence: source.sequence,
    occurredAt: source.receivedAt,
    payload,
  };
}

/**
 * Maps one wire-level HermesExecutionEvent to zero or more Stratxcel
 * mission events. Pure and deterministic — same input always produces the
 * same output, so callers (the worker's persistence loop) can safely retry
 * on the same event without double-normalizing differently; combined with
 * a uniqueness constraint on (mission_id, sequence, type) at the storage
 * layer, this makes ingestion idempotent end to end. tenantId/missionId
 * are carried through from the source event untouched (never re-derived,
 * never defaulted) so a bug upstream can't silently cross tenant/mission
 * boundaries here.
 */
export function normalizeHermesEvent(event: HermesExecutionEvent): StratxcelMissionEvent[] {
  switch (event.type) {
    case "message.delta":
      return [makeEvent(event, "assistant.progress", { kind: "delta", text: event.textDelta })];

    case "reasoning.available":
      return [makeEvent(event, "assistant.progress", { kind: "reasoning", text: event.reasoning })];

    case "tool.started": {
      const events = [
        makeEvent(event, "tool.started", {
          callId: event.tool.callId,
          name: event.tool.name,
          arguments: redactArguments(event.tool.arguments),
          requestedAt: event.tool.requestedAt,
        }),
      ];
      if (event.tool.name === CLARIFY_TOOL_NAME) {
        events.push(makeEvent(event, "awaiting_input", { callId: event.tool.callId }));
      }
      return events;
    }

    case "tool.completed": {
      const events = [
        makeEvent(event, "tool.completed", {
          callId: event.tool.callId,
          name: event.tool.name,
          status: event.tool.status,
          errorMessage: event.tool.errorMessage,
          approvalRequestId: event.tool.approvalRequestId,
        }),
      ];
      if (event.tool.status === "ok" && ARTIFACT_TOOL_NAME_PATTERN.test(event.tool.name)) {
        events.push(makeEvent(event, "artifact.created", { callId: event.tool.callId, name: event.tool.name }));
      }
      if (event.tool.status === "ok" && HANDOFF_TOOL_NAME_PATTERN.test(event.tool.name)) {
        events.push(makeEvent(event, "human.handoff", { callId: event.tool.callId, name: event.tool.name }));
      }
      return events;
    }

    case "approval.request":
      return [makeEvent(event, "approval.required", { toolName: event.toolName, approvalRequestId: event.approvalRequestId })];

    case "approval.responded":
      return [makeEvent(event, "approval.responded", { choice: event.choice })];

    case "subagent.start":
      return [makeEvent(event, "task.started", { subagentProfile: event.subagentProfile, subagentRunId: event.subagentRunId })];

    case "subagent.complete":
      return [
        makeEvent(event, event.status === "failed" ? "task.failed" : "task.completed", {
          subagentRunId: event.subagentRunId,
          status: event.status,
        }),
      ];

    case "run.completed":
      return [makeEvent(event, "mission.completed", {})];

    case "run.failed":
      return [makeEvent(event, "mission.failed", { error: event.error })];

    case "run.cancelled":
      return [makeEvent(event, "mission.cancelled", {})];

    default: {
      const exhaustiveCheck: never = event;
      return exhaustiveCheck;
    }
  }
}
