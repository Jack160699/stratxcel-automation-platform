import { recordAuditEvent } from "@stratxcel/audit";
import { getWalletAccount, reserveFunds, InsufficientFundsError } from "@stratxcel/payments-and-wallet";
import { createPostgresQueueAdapter } from "@stratxcel/queue";
import type { ServiceClient } from "./db.ts";
import { compileGoalToMission } from "./compiler.ts";
import { assertTransition, isTerminalState } from "./state-machine.ts";
import type { MissionEventRow, MissionRow, MissionState } from "./types.ts";

export class ConcurrentModificationError extends Error {
  constructor(missionId: string) {
    super(`Mission ${missionId} was modified concurrently by another request — reload and retry`);
    this.name = "ConcurrentModificationError";
  }
}

export class TerminalMissionError extends Error {
  constructor(missionId: string, state: MissionState) {
    super(`Mission ${missionId} is in terminal state ${state} and cannot be modified`);
    this.name = "TerminalMissionError";
  }
}

export async function appendMissionEvent(
  supabase: ServiceClient,
  input: { missionId: string; eventType: string; payload?: Record<string, unknown> }
): Promise<MissionEventRow> {
  const { data, error } = await supabase
    .from("mission_events")
    .insert({ mission_id: input.missionId, event_type: input.eventType, payload: input.payload ?? {} })
    .select("*")
    .single();
  if (error) throw new Error(`appendMissionEvent: ${error.message}`);
  return data as MissionEventRow;
}

/**
 * Same as appendMissionEvent but for Hermes-sourced events: carries
 * run_id/sequence and is safe to call twice for the same
 * (missionId, runId, sequence, eventType) — a duplicate insert is silently
 * dropped rather than erroring, per
 * mission_events_hermes_dedup_idx in 20260804090000_hermes_run_tracking.sql.
 * This is what makes SSE-disconnect-then-poll-then-maybe-reconnect
 * reconciliation safe to retry: the worker can re-process the same
 * HermesExecutionEvent without producing a duplicate mission_events row.
 */
export async function appendMissionEventIdempotent(
  supabase: ServiceClient,
  input: { missionId: string; runId: string; sequence: number; eventType: string; payload: Record<string, unknown> }
): Promise<MissionEventRow | null> {
  const { data, error } = await supabase
    .from("mission_events")
    .upsert(
      {
        mission_id: input.missionId,
        run_id: input.runId,
        sequence: input.sequence,
        event_type: input.eventType,
        payload: input.payload,
      },
      { onConflict: "mission_id,run_id,sequence,event_type", ignoreDuplicates: true }
    )
    .select("*");
  if (error) throw new Error(`appendMissionEventIdempotent: ${error.message}`);
  return (data?.[0] as MissionEventRow | undefined) ?? null;
}

/** Persists the Hermes run ID the instant submitMission() accepts it — before any event has been consumed — so a worker crash after submit still knows which run to reconcile against on retry instead of submitting a second run. */
export async function recordHermesRunSubmitted(
  supabase: ServiceClient,
  input: { missionId: string; runId: string }
): Promise<MissionRow> {
  const { data, error } = await supabase
    .from("missions")
    .update({ hermes_run_id: input.runId, last_hermes_status: "queued", updated_at: new Date().toISOString() })
    .eq("id", input.missionId)
    .select("*")
    .single();
  if (error) throw new Error(`recordHermesRunSubmitted: ${error.message}`);
  return data as MissionRow;
}

/** Records the latest known run status/last-event timestamp without touching the mission's state machine — call this on every observed event/poll so a reload shows fresh status even mid-run. */
export async function recordMissionHeartbeat(
  supabase: ServiceClient,
  input: { missionId: string; hermesStatus: string; lastEventAt?: string }
): Promise<void> {
  const { error } = await supabase
    .from("missions")
    .update({
      last_hermes_status: input.hermesStatus,
      last_event_at: input.lastEventAt ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.missionId);
  if (error) throw new Error(`recordMissionHeartbeat: ${error.message}`);
}

/** Captures final token usage/cost once a run reaches a terminal status — separate from setMissionState's version-checked update since usage is informational, not state. */
export async function recordMissionUsage(
  supabase: ServiceClient,
  input: { missionId: string; inputTokens?: number; outputTokens?: number; totalTokens?: number; actualCostCents?: number }
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.inputTokens !== undefined) update.input_tokens = input.inputTokens;
  if (input.outputTokens !== undefined) update.output_tokens = input.outputTokens;
  if (input.totalTokens !== undefined) update.total_tokens = input.totalTokens;
  if (input.actualCostCents !== undefined) update.actual_cost_cents = input.actualCostCents;

  const { error } = await supabase.from("missions").update(update).eq("id", input.missionId);
  if (error) throw new Error(`recordMissionUsage: ${error.message}`);
}

/**
 * Every state write is optimistic-concurrency-checked (`.eq("version", ...)`)
 * — two concurrent callers reading the same mission and both trying to
 * transition it (e.g. a human clicking "cancel" the instant the worker
 * moves it to RUNNING) can't both silently succeed and leave the mission in
 * whichever state wrote last. The loser gets ConcurrentModificationError
 * and must reload.
 */
async function setMissionState(
  supabase: ServiceClient,
  mission: MissionRow,
  nextState: MissionState,
  eventPayload: Record<string, unknown> = {}
): Promise<MissionRow> {
  assertTransition(mission.state, nextState);

  const { data, error } = await supabase
    .from("missions")
    .update({ state: nextState, version: mission.version + 1, updated_at: new Date().toISOString() })
    .eq("id", mission.id)
    .eq("version", mission.version)
    .select("*");
  if (error) throw new Error(`setMissionState: ${error.message}`);
  if (!data || data.length === 0) throw new ConcurrentModificationError(mission.id);

  const updated = data[0] as MissionRow;

  await appendMissionEvent(supabase, {
    missionId: mission.id,
    eventType: "state_changed",
    payload: { from: mission.state, to: nextState, ...eventPayload },
  });

  return updated;
}

async function fetchMission(supabase: ServiceClient, missionId: string): Promise<MissionRow> {
  const { data, error } = await supabase.from("missions").select("*").eq("id", missionId).single();
  if (error) throw new Error(`fetchMission: ${error.message}`);
  return data as MissionRow;
}

/**
 * Creates a mission in DRAFT, immediately compiles the goal text against
 * the service catalogue (ESTIMATING), reserves wallet funds (READY) or
 * parks it (AWAITING_FUNDS), and — once READY — enqueues it for execution
 * via @stratxcel/queue rather than leaving mission-worker to poll the
 * missions table directly. This is the "plain message to
 * structured/estimated mission" flow the brief's test requirements call
 * for, expressed as one server-side function so API routes and the
 * WhatsApp/dashboard entry points share identical behavior.
 *
 * idempotencyKey (e.g. a WhatsApp provider message ID) prevents a retried
 * or redelivered request from creating a second mission for the same
 * logical event — see the partial unique index in
 * supabase/migrations/20260803150000_mission_approval_automation.sql.
 */
export async function createAndEstimateMission(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    createdBy: string | null;
    goalText: string;
    brandBrainVersion?: number | null;
    idempotencyKey?: string;
  }
): Promise<MissionRow> {
  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from("missions")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .not("state", "in", "(COMPLETED,PARTIALLY_COMPLETED,FAILED,CANCELLED)")
      .maybeSingle();
    if (existing) return existing as MissionRow;
  }

  const { data: draft, error } = await supabase
    .from("missions")
    .insert({
      tenant_id: input.tenantId,
      created_by: input.createdBy,
      goal_text: input.goalText,
      state: "DRAFT",
      brand_brain_version: input.brandBrainVersion ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createAndEstimateMission: ${error.message}`);

  let mission = draft as MissionRow;
  mission = await setMissionState(supabase, mission, "ESTIMATING");

  const compiled = compileGoalToMission(input.goalText);

  const { data: estimated, error: estimateError } = await supabase
    .from("missions")
    .update({
      service_key: compiled.serviceKey,
      hermes_profile: compiled.hermesProfile,
      estimated_cost_cents: compiled.estimatedCostCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mission.id)
    .select("*")
    .single();
  if (estimateError) throw new Error(`createAndEstimateMission: ${estimateError.message}`);
  mission = estimated as MissionRow;

  await appendMissionEvent(supabase, {
    missionId: mission.id,
    eventType: "compiled",
    payload: { serviceKey: compiled.serviceKey, matched: compiled.matched, estimatedCostCents: compiled.estimatedCostCents },
  });

  if (compiled.estimatedCostCents === 0) {
    mission = await setMissionState(supabase, mission, "READY", { reason: "zero_cost_estimate" });
  } else {
    const account = await getWalletAccount(supabase, input.tenantId);
    if (account.balance_cents >= compiled.estimatedCostCents) {
      try {
        await reserveFunds(supabase, {
          tenantId: input.tenantId,
          amountCents: compiled.estimatedCostCents,
          referenceType: "mission",
          referenceId: mission.id,
        });
        mission = await setMissionState(supabase, mission, "READY", { reservedCents: compiled.estimatedCostCents });
      } catch (reserveError) {
        if (reserveError instanceof InsufficientFundsError) {
          mission = await setMissionState(supabase, mission, "AWAITING_FUNDS");
        } else {
          throw reserveError;
        }
      }
    } else {
      mission = await setMissionState(supabase, mission, "AWAITING_FUNDS");
    }
  }

  if (mission.state === "READY") {
    mission = await queueMissionForExecution(supabase, mission);
  }

  await recordAuditEvent(supabase, {
    tenantId: input.tenantId,
    actorUserId: input.createdBy,
    actorKind: "user",
    action: "mission.created",
    targetType: "mission",
    targetId: mission.id,
    metadata: { serviceKey: compiled.serviceKey, state: mission.state },
  });

  return mission;
}

/**
 * READY -> QUEUED, plus the actual queue enqueue — the two must happen
 * together (a mission marked QUEUED with no corresponding queue job would
 * simply never execute; a queue job with no state change would let a
 * second caller queue the same mission again).
 */
export async function queueMissionForExecution(supabase: ServiceClient, mission: MissionRow): Promise<MissionRow> {
  const queue = createPostgresQueueAdapter(supabase);
  await queue.enqueue({
    tenantId: mission.tenant_id,
    jobType: "mission.execute",
    payload: { missionId: mission.id },
    idempotencyKey: `mission:${mission.id}`,
  });
  return setMissionState(supabase, mission, "QUEUED");
}

export async function transitionMission(
  supabase: ServiceClient,
  input: { missionId: string; nextState: MissionState; payload?: Record<string, unknown> }
): Promise<MissionRow> {
  const mission = await fetchMission(supabase, input.missionId);
  return setMissionState(supabase, mission, input.nextState, input.payload);
}

export async function cancelMission(
  supabase: ServiceClient,
  input: { missionId: string; cancelledBy: string; reason?: string }
): Promise<MissionRow> {
  const mission = await fetchMission(supabase, input.missionId);
  if (isTerminalState(mission.state)) throw new TerminalMissionError(mission.id, mission.state);

  const updated = await setMissionState(supabase, mission, "CANCELLED", { reason: input.reason ?? "cancelled_by_user" });

  await recordAuditEvent(supabase, {
    tenantId: mission.tenant_id,
    actorUserId: input.cancelledBy,
    actorKind: "user",
    action: "mission.cancelled",
    targetType: "mission",
    targetId: mission.id,
    metadata: { reason: input.reason ?? null },
  });

  return updated;
}

/**
 * Admin/owner override: re-queues a FAILED mission for another attempt.
 * This deliberately bypasses the normal state machine (FAILED has no
 * outgoing edges in state-machine.ts — it's terminal by design for
 * automated flows) rather than adding FAILED->QUEUED as a regular
 * transition, so every use of this path is a distinct, loudly-audited
 * exception rather than something automation could trigger by accident.
 */
export async function adminRetryMission(
  supabase: ServiceClient,
  input: { missionId: string; retriedBy: string; reason: string }
): Promise<MissionRow> {
  const mission = await fetchMission(supabase, input.missionId);
  if (mission.state !== "FAILED") {
    throw new Error(`adminRetryMission: mission ${mission.id} is in state ${mission.state}, not FAILED`);
  }

  const { data, error } = await supabase
    .from("missions")
    .update({ state: "QUEUED", version: mission.version + 1, updated_at: new Date().toISOString() })
    .eq("id", mission.id)
    .eq("version", mission.version)
    .select("*");
  if (error) throw new Error(`adminRetryMission: ${error.message}`);
  if (!data || data.length === 0) throw new ConcurrentModificationError(mission.id);
  const updated = data[0] as MissionRow;

  const queue = createPostgresQueueAdapter(supabase);
  await queue.enqueue({
    tenantId: mission.tenant_id,
    jobType: "mission.execute",
    payload: { missionId: mission.id },
    idempotencyKey: `mission:${mission.id}:retry:${Date.now()}`,
  });

  await appendMissionEvent(supabase, {
    missionId: mission.id,
    eventType: "admin_override",
    payload: { from: "FAILED", to: "QUEUED", retriedBy: input.retriedBy, reason: input.reason },
  });

  await recordAuditEvent(supabase, {
    tenantId: mission.tenant_id,
    actorUserId: input.retriedBy,
    actorKind: "user",
    action: "mission.admin_override_retry",
    targetType: "mission",
    targetId: mission.id,
    metadata: { reason: input.reason },
  });

  return updated;
}

/**
 * Cross-tenant lookup for admin tooling / diagnostics — service-role
 * bypasses RLS, which is why this must never be exposed through a
 * user-facing API route without its own tenant/role check.
 */
export async function listMissionsByState(supabase: ServiceClient, state: MissionState, limit = 20): Promise<MissionRow[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("state", state)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listMissionsByState: ${error.message}`);
  return (data ?? []) as MissionRow[];
}

export async function listMissionsForTenant(supabase: ServiceClient, tenantId: string, limit = 50): Promise<MissionRow[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listMissionsForTenant: ${error.message}`);
  return (data ?? []) as MissionRow[];
}

export async function getMission(supabase: ServiceClient, missionId: string): Promise<MissionRow> {
  return fetchMission(supabase, missionId);
}

export async function listMissionEvents(supabase: ServiceClient, missionId: string): Promise<MissionEventRow[]> {
  const { data, error } = await supabase
    .from("mission_events")
    .select("*")
    .eq("mission_id", missionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listMissionEvents: ${error.message}`);
  return (data ?? []) as MissionEventRow[];
}
