import { createSupabaseServiceClient } from "../supabase/service";
import { recordAuditEvent } from "../audit/log";
import { transitionMission } from "../missions/repository";
import type { HumanHandoffRow } from "./types";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Opens a handoff and, if it's tied to a mission, moves that mission into
 * HUMAN_HANDOFF in the same call — the two must never drift out of sync
 * (an OPEN handoff whose mission still says RUNNING would make the mission
 * state machine a lie).
 */
export async function createHumanHandoff(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    missionId?: string | null;
    reason: string;
    contextSnapshot: Record<string, unknown>;
  }
): Promise<HumanHandoffRow> {
  const { data, error } = await supabase
    .from("human_handoffs")
    .insert({
      tenant_id: input.tenantId,
      mission_id: input.missionId ?? null,
      reason: input.reason,
      context_snapshot: input.contextSnapshot,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createHumanHandoff: ${error.message}`);

  if (input.missionId) {
    await transitionMission(supabase, {
      missionId: input.missionId,
      nextState: "HUMAN_HANDOFF",
      payload: { handoffId: data.id, reason: input.reason },
    });
  }

  await recordAuditEvent(supabase, {
    tenantId: input.tenantId,
    actorKind: "system",
    action: "human_handoff.created",
    targetType: "human_handoff",
    targetId: data.id,
    metadata: { missionId: input.missionId ?? null, reason: input.reason },
  });

  return data as HumanHandoffRow;
}

/**
 * Resolves a handoff and, if it was tied to a mission, returns that mission
 * to RESUMED — the explicit "return to originating mission" path the brief
 * requires as a test case, rather than leaving the mission stuck in
 * HUMAN_HANDOFF forever.
 */
export async function resolveHumanHandoff(
  supabase: ServiceClient,
  input: { handoffId: string; resolvedBy: string; resolutionNotes?: string }
): Promise<HumanHandoffRow> {
  const { data: handoff, error: fetchError } = await supabase
    .from("human_handoffs")
    .select("*")
    .eq("id", input.handoffId)
    .single();
  if (fetchError) throw new Error(`resolveHumanHandoff: ${fetchError.message}`);

  const { data, error } = await supabase
    .from("human_handoffs")
    .update({
      status: "RETURNED_TO_MISSION",
      resolved_at: new Date().toISOString(),
      context_snapshot: {
        ...(handoff.context_snapshot as Record<string, unknown>),
        resolution_notes: input.resolutionNotes ?? null,
      },
    })
    .eq("id", input.handoffId)
    .select("*")
    .single();
  if (error) throw new Error(`resolveHumanHandoff: ${error.message}`);

  if (handoff.mission_id) {
    await transitionMission(supabase, {
      missionId: handoff.mission_id,
      nextState: "RESUMED",
      payload: { handoffId: input.handoffId },
    });
  }

  await recordAuditEvent(supabase, {
    tenantId: handoff.tenant_id,
    actorUserId: input.resolvedBy,
    actorKind: "user",
    action: "human_handoff.resolved",
    targetType: "human_handoff",
    targetId: input.handoffId,
    metadata: { missionId: handoff.mission_id },
  });

  return data as HumanHandoffRow;
}

export async function listOpenHandoffs(supabase: ServiceClient, tenantId: string): Promise<HumanHandoffRow[]> {
  const { data, error } = await supabase
    .from("human_handoffs")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["OPEN", "IN_PROGRESS"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listOpenHandoffs: ${error.message}`);
  return (data ?? []) as HumanHandoffRow[];
}
