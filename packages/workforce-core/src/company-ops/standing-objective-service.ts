/**
 * Standing Objective Service — "GROW STRATXCEL REVENUE"
 * StratXcel Autonomous Company OS - Workforce Core
 *
 * Provides a canonical, durable database anchor in Supabase `missions`.
 * Survives server restart, worker restart, deployment, relogin, and mission completion.
 * Hermes must never become idle due to the absence of a manual Founder mission.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const STANDING_OBJECTIVE_GOAL = "GROW STRATXCEL REVENUE";
export const STANDING_OBJECTIVE_SERVICE_KEY = "autonomous_revenue";
export const CANONICAL_TENANT_ID = "466e6195-a9f6-4576-8271-29fdae61c18a";

export interface StandingMissionRecord {
  id: string;
  tenant_id: string;
  goal_text: string;
  service_key: string;
  state: string;
  estimated_cost_cents: number | null;
  created_at: string;
  updated_at?: string;
}

export interface StandingCycleMetrics {
  cycleId: string;
  discoveredCount: number;
  qualifiedCount: number;
  diagnosedCount: number;
  outreachCount: number;
  driveArtifactsCount: number;
  projectedRevenueInr: number;
  activeCategory: string;
  summary: string;
}

export class StandingObjectiveService {
  private supabase: SupabaseClient;
  private tenantId: string;

  constructor(supabase: SupabaseClient, tenantId: string = CANONICAL_TENANT_ID) {
    this.supabase = supabase;
    this.tenantId = tenantId;
  }

  /**
   * Ensures the persistent standing mission exists in Supabase and is RUNNING.
   * Idempotent and self-healing.
   */
  async ensureStandingObjective(): Promise<StandingMissionRecord> {
    // 1. Check for existing standing mission
    const { data: existing, error: fetchErr } = await this.supabase
      .from("missions")
      .select("id, tenant_id, goal_text, service_key, state, estimated_cost_cents, created_at, updated_at")
      .eq("tenant_id", this.tenantId)
      .eq("goal_text", STANDING_OBJECTIVE_GOAL)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      console.warn(`[StandingObjectiveService] Error checking standing mission: ${fetchErr.message}`);
    }

    if (existing) {
      // If it exists but got marked anything other than RUNNING, restore it to RUNNING
      if (existing.state !== "RUNNING") {
        const { data: updated, error: updateErr } = await this.supabase
          .from("missions")
          .update({
            state: "RUNNING",
            service_key: STANDING_OBJECTIVE_SERVICE_KEY,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (updateErr) {
          console.error(`[StandingObjectiveService] Failed to resume standing mission: ${updateErr.message}`);
          return existing as StandingMissionRecord;
        }

        await this.recordMissionEvent(existing.id, "standing_objective_resumed", {
          reason: "Hermes persistent autonomous revenue daemon auto-resumed standing mission",
          previousState: existing.state,
          resumedAt: new Date().toISOString(),
        });

        return updated as StandingMissionRecord;
      }
      return existing as StandingMissionRecord;
    }

    // 2. Create the canonical standing mission row
    const missionId = randomUUID();
    const newMission = {
      id: missionId,
      tenant_id: this.tenantId,
      goal_text: STANDING_OBJECTIVE_GOAL,
      service_key: STANDING_OBJECTIVE_SERVICE_KEY,
      state: "RUNNING",
      estimated_cost_cents: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error: insertErr } = await this.supabase
      .from("missions")
      .insert(newMission)
      .select()
      .single();

    if (insertErr) {
      console.error(`[StandingObjectiveService] Failed to create standing mission: ${insertErr.message}`);
      // Fallback object to not halt execution
      return newMission as StandingMissionRecord;
    }

    await this.recordMissionEvent(missionId, "standing_objective_initialized", {
      directive: STANDING_OBJECTIVE_GOAL,
      serviceKey: STANDING_OBJECTIVE_SERVICE_KEY,
      initializedAt: new Date().toISOString(),
      description: "Hermes primary standing objective established as durable corporate mandate.",
    });

    return created as StandingMissionRecord;
  }

  /**
   * Appends an event to the mission timeline for live Mission Control display.
   */
  async recordMissionEvent(missionId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.supabase.from("mission_events").insert({
        mission_id: missionId,
        event_type: eventType,
        payload,
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn(`[StandingObjectiveService] Failed to record mission event: ${err.message}`);
    }
  }

  /**
   * Records completed cycle metrics onto the standing mission event stream.
   */
  async recordCycleProgress(missionId: string, metrics: StandingCycleMetrics): Promise<void> {
    await this.recordMissionEvent(missionId, "revenue_cycle_completed", {
      cycleId: metrics.cycleId,
      discoveredCount: metrics.discoveredCount,
      qualifiedCount: metrics.qualifiedCount,
      diagnosedCount: metrics.diagnosedCount,
      outreachCount: metrics.outreachCount,
      driveArtifactsCount: metrics.driveArtifactsCount,
      projectedRevenueInr: metrics.projectedRevenueInr,
      activeCategory: metrics.activeCategory,
      summary: metrics.summary,
      timestamp: new Date().toISOString(),
    });

    // Touch the mission's updated_at
    await this.supabase
      .from("missions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", missionId);
  }
}
