import { z } from "zod";
import { IsoTimestamp, MissionId, RunId } from "./common.ts";

/**
 * Normalized shape of `GET /health` / `GET /health/detailed`. Field names
 * beyond `status` are not confirmed against a live deployment; kept loose
 * via `.passthrough()` deliberately. See docs/hermes/DEPLOYMENT.md.
 */
export const RuntimeHealth = z
  .object({
    status: z.enum(["ok", "degraded", "down"]),
    checkedAt: IsoTimestamp,
  })
  .passthrough();
export type RuntimeHealth = z.infer<typeof RuntimeHealth>;

/**
 * Runs API `GET /v1/runs/{run_id}` usage shape — confirmed live against a
 * running Hermes v0.20.0 instance (resolves
 * docs/hermes/MANUAL_REQUIREMENTS.md item 4): the terminal run-status
 * response carries `{ input_tokens, output_tokens, total_tokens }` directly,
 * no `estimatedCostUsd` field from Hermes itself — cost is a Stratxcel-side
 * estimate layered on top (see docs/hermes/RECONCILIATION.md), so it stays
 * optional here.
 */
export const UsageAndCost = z.object({
  missionId: MissionId,
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  /** Stratxcel-side estimate, not returned by Hermes; absent until computed. */
  estimatedCostUsd: z.number().nonnegative().optional(),
  model: z.string().min(1),
  provider: z.string().min(1),
});
export type UsageAndCost = z.infer<typeof UsageAndCost>;

/** Confirmed Runs API run states (`GET /v1/runs/{run_id}.status`), live-verified. */
export const RunStatus = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "stopping",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;

/**
 * Normalized `GET /v1/runs/{run_id}` response — the terminal-state
 * recovery source of truth (see docs/hermes/EVENT_MODEL.md; SSE has no
 * replay, this endpoint does not depend on any live connection).
 */
export const RunStatusResponse = z.object({
  runId: RunId,
  status: RunStatus,
  updatedAt: IsoTimestamp,
  createdAt: IsoTimestamp,
  output: z.string().optional(),
  error: z.string().optional(),
  usage: UsageAndCost.omit({ missionId: true, model: true, provider: true }).partial().optional(),
});
export type RunStatusResponse = z.infer<typeof RunStatusResponse>;

/**
 * `GET /api/sessions/{run_id}/messages` — optional, capability-gated
 * transcript backfill. NOT a documented/stable Hermes contract; discovered
 * from source, not from any published API reference. Callers must treat
 * its absence as normal, not as an error, and must confirm availability
 * (e.g. via a successful capability probe or a prior successful call) before
 * relying on it — see HERMES_TRANSCRIPT_BACKFILL_ENABLED in the runtime
 * adapter config and docs/hermes/RECONCILIATION.md.
 */
export const TranscriptMessage = z.object({
  id: z.number().int(),
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string(),
  toolCallId: z.string().nullable().optional(),
  toolCalls: z.array(z.unknown()).nullable().optional(),
  toolName: z.string().nullable().optional(),
  timestamp: z.number(),
});
export type TranscriptMessage = z.infer<typeof TranscriptMessage>;

export const TranscriptBackfillResponse = z.object({
  sessionId: z.string().min(1),
  messages: z.array(TranscriptMessage),
});
export type TranscriptBackfillResponse = z.infer<typeof TranscriptBackfillResponse>;
