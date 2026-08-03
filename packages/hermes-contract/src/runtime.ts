import { z } from "zod";
import { IsoTimestamp, MissionId } from "./common.ts";

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
 * Normalizes the two confirmed Hermes `usage` shapes
 * (`prompt_tokens`/`completion_tokens` from `/v1/chat/completions`, and
 * `input_tokens`/`output_tokens` from `/v1/responses`). The Runs API's own
 * usage shape was not confirmed — see docs/hermes/MANUAL_REQUIREMENTS.md
 * item 4 — so this is the normalized, Stratxcel-side representation, not a
 * literal passthrough of either wire shape.
 */
export const UsageAndCost = z.object({
  missionId: MissionId,
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  /** USD, when a provider cost model is configured; absent otherwise. */
  estimatedCostUsd: z.number().nonnegative().optional(),
  model: z.string().min(1),
  provider: z.string().min(1),
});
export type UsageAndCost = z.infer<typeof UsageAndCost>;
