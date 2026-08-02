import { createSupabaseServiceClient } from "../supabase/service";
import { recordAuditEvent } from "../audit/log";
import { getWalletAccount, reserveFunds, InsufficientFundsError } from "../wallet/ledger";
import { compileGoalToMission } from "./compiler";
import { assertTransition } from "./state-machine";
import type { MissionEventRow, MissionRow, MissionState } from "./types";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

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

async function setMissionState(
  supabase: ServiceClient,
  mission: MissionRow,
  nextState: MissionState,
  eventPayload: Record<string, unknown> = {}
): Promise<MissionRow> {
  assertTransition(mission.state, nextState);

  const { data, error } = await supabase
    .from("missions")
    .update({ state: nextState, updated_at: new Date().toISOString() })
    .eq("id", mission.id)
    .select("*")
    .single();
  if (error) throw new Error(`setMissionState: ${error.message}`);

  await appendMissionEvent(supabase, {
    missionId: mission.id,
    eventType: "state_changed",
    payload: { from: mission.state, to: nextState, ...eventPayload },
  });

  return data as MissionRow;
}

/**
 * Creates a mission in DRAFT, immediately compiles the goal text against
 * the service catalogue (ESTIMATING), and checks the tenant's wallet
 * balance to decide READY (funds reserved) vs AWAITING_FUNDS. This is the
 * "plain message to structured/estimated mission" flow the brief's test
 * requirements call for, expressed as one server-side function so API
 * routes and the WhatsApp/dashboard entry points share identical behavior.
 */
export async function createAndEstimateMission(
  supabase: ServiceClient,
  input: { tenantId: string; createdBy: string | null; goalText: string; brandBrainVersion?: number | null }
): Promise<MissionRow> {
  const { data: draft, error } = await supabase
    .from("missions")
    .insert({
      tenant_id: input.tenantId,
      created_by: input.createdBy,
      goal_text: input.goalText,
      state: "DRAFT",
      brand_brain_version: input.brandBrainVersion ?? null,
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

export async function transitionMission(
  supabase: ServiceClient,
  input: { missionId: string; nextState: MissionState; payload?: Record<string, unknown> }
): Promise<MissionRow> {
  const { data: mission, error } = await supabase
    .from("missions")
    .select("*")
    .eq("id", input.missionId)
    .single();
  if (error) throw new Error(`transitionMission: ${error.message}`);

  return setMissionState(supabase, mission as MissionRow, input.nextState, input.payload);
}

export async function listMissionsForTenant(
  supabase: ServiceClient,
  tenantId: string,
  limit = 50
): Promise<MissionRow[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listMissionsForTenant: ${error.message}`);
  return (data ?? []) as MissionRow[];
}

export async function listMissionEvents(
  supabase: ServiceClient,
  missionId: string
): Promise<MissionEventRow[]> {
  const { data, error } = await supabase
    .from("mission_events")
    .select("*")
    .eq("mission_id", missionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listMissionEvents: ${error.message}`);
  return (data ?? []) as MissionEventRow[];
}
