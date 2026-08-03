import { z } from "zod";
import { IdempotencyKey, IsoTimestamp, MissionId, ProfileName, RunId, TenantId } from "./common.ts";
import { ArtifactManifest } from "./artifact.ts";

/**
 * What Stratxcel's integration layer sends to submit a mission. Maps to a
 * `POST /v1/runs` call plus Stratxcel-side bookkeeping — see
 * docs/hermes/API_CONTRACT.md. Note `idempotencyKey` is a Stratxcel
 * construct; Hermes' own `/v1/runs` has no equivalent field.
 */
export const SubmitMissionRequest = z.object({
  missionId: MissionId,
  idempotencyKey: IdempotencyKey,
  tenantId: TenantId,
  profile: ProfileName,
  /** Natural-language mission brief. */
  brief: z.string().min(1),
  /** Stratxcel-injected authoritative context bundle — never raw credentials. See docs/hermes/MEMORY_POLICY.md. */
  context: z.record(z.string(), z.unknown()).default({}),
  /** Wall-clock ceiling in seconds, enforced by Stratxcel independent of Hermes' agent.max_turns. */
  timeoutSeconds: z.number().int().positive().optional(),
});
export type SubmitMissionRequest = z.infer<typeof SubmitMissionRequest>;

export const SubmitMissionResponse = z.object({
  missionId: MissionId,
  runId: RunId,
  status: z.enum(["accepted", "duplicate"]),
  acceptedAt: IsoTimestamp,
});
export type SubmitMissionResponse = z.infer<typeof SubmitMissionResponse>;

/** Maps to `POST /v1/runs/{run_id}/stop`. See docs/hermes/FAILURE_RETRY_IDEMPOTENCY.md. */
export const MissionCancellation = z.object({
  missionId: MissionId,
  runId: RunId,
  requestedBy: z.string().min(1),
  requestedAt: IsoTimestamp,
  reason: z.string().optional(),
});
export type MissionCancellation = z.infer<typeof MissionCancellation>;

/**
 * Covers both resume cases documented in
 * docs/hermes/FAILURE_RETRY_IDEMPOTENCY.md: reconnecting to an
 * already-running mission, or resuming one paused on an approval decision.
 */
export const MissionResume = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reconnect"),
    missionId: MissionId,
    runId: RunId,
  }),
  z.object({
    kind: z.literal("approval_resume"),
    missionId: MissionId,
    runId: RunId,
    approvalRequestId: z.uuid(),
  }),
]);
export type MissionResume = z.infer<typeof MissionResume>;

/** Terminal mission record, including its outputs. */
export const MissionOutcome = z.object({
  missionId: MissionId,
  runId: RunId,
  status: z.enum(["completed", "failed", "cancelled", "needs_clarification", "dead_letter"]),
  manifest: ArtifactManifest.optional(),
  failureReason: z.string().optional(),
});
export type MissionOutcome = z.infer<typeof MissionOutcome>;
