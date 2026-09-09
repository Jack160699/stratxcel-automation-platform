/**
 * KPI Tracker
 *
 * Reads real DB data to compute per-agent and per-mission KPIs.
 * Feeds the Hermes CEO replanning engine with truthful signals.
 * Never fabricates metrics.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface AgentKpi {
  agentId: string;
  leadsDiscovered: number;
  leadsQualified: number;
  missionsCompleted: number;
  revenueInfluencedCents: number;
  proposalsSent: number;
  dealsWon: number;
  successRate: number; // 0-1
  lastActiveAt: string | null;
}

export interface MissionKpi {
  missionId: string;
  revenueMissionId: string | null;
  targetRevenueCents: number | null;
  actualRevenueCents: number;
  targetLeads: number | null;
  discoveredLeads: number;
  qualifiedLeads: number;
  wonDeals: number;
  conversionRate: number; // qualified → won
  currentState: string;
  nextActions: unknown[];
}

export class KpiTracker {
  private sb: SupabaseClient;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.sb = createClient(supabaseUrl, serviceRoleKey);
  }

  /** Compute KPIs for a specific agent across a tenant. */
  async getAgentKpi(tenantId: string, agentId: string): Promise<AgentKpi> {
    // Leads discovered by this agent
    const { count: discovered } = await this.sb
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("assigned_to", agentId)
      .eq("status", "DISCOVERED");

    // Leads qualified
    const { count: qualified } = await this.sb
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("assigned_to", agentId)
      .in("status", ["QUALIFIED", "INTERESTED", "PROPOSAL", "WON"]);

    // Missions completed by this agent
    const { count: missionsCompleted } = await this.sb
      .from("missions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("state", "COMPLETED")
      .eq("created_by", agentId);

    // Revenue events attributed to this agent
    const { data: revEvents } = await this.sb
      .from("revenue_events")
      .select("amount_cents, type")
      .eq("tenant_id", tenantId)
      .eq("agent_attribution", agentId);

    const revenueInfluencedCents =
      revEvents?.reduce((sum: number, e: { amount_cents: number | null }) => sum + (e.amount_cents ?? 0), 0) ?? 0;
    const proposalsSent = revEvents?.filter((e: { type: string }) => e.type === "proposal_sent").length ?? 0;
    const dealsWon = revEvents?.filter((e: { type: string }) => e.type === "deal_won").length ?? 0;

    const successRate = proposalsSent > 0 ? dealsWon / proposalsSent : 0;

    // Last activity
    const { data: lastLead } = await this.sb
      .from("crm_leads")
      .select("updated_at")
      .eq("tenant_id", tenantId)
      .eq("assigned_to", agentId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      agentId,
      leadsDiscovered: discovered ?? 0,
      leadsQualified: qualified ?? 0,
      missionsCompleted: missionsCompleted ?? 0,
      revenueInfluencedCents,
      proposalsSent,
      dealsWon,
      successRate,
      lastActiveAt: lastLead?.updated_at ?? null,
    };
  }

  /** Compute mission-level KPIs from real DB data. */
  async getMissionKpi(tenantId: string, missionId: string): Promise<MissionKpi> {
    // Revenue mission
    const { data: rm } = await this.sb
      .from("revenue_missions")
      .select("id, target_revenue_cents, target_leads, revenue_cents, current_state, next_actions_json")
      .eq("mission_id", missionId)
      .maybeSingle();

    // Lead counts
    const { count: discovered } = await this.sb
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const { count: qualified } = await this.sb
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["QUALIFIED", "INTERESTED", "PROPOSAL", "WON"]);

    const { count: won } = await this.sb
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "WON");

    const qualifiedN = qualified ?? 0;
    const wonN = won ?? 0;
    const conversionRate = qualifiedN > 0 ? wonN / qualifiedN : 0;

    return {
      missionId,
      revenueMissionId: rm?.id ?? null,
      targetRevenueCents: rm?.target_revenue_cents ?? null,
      actualRevenueCents: rm?.revenue_cents ?? 0,
      targetLeads: rm?.target_leads ?? null,
      discoveredLeads: discovered ?? 0,
      qualifiedLeads: qualifiedN,
      wonDeals: wonN,
      conversionRate,
      currentState: rm?.current_state ?? "UNKNOWN",
      nextActions: rm?.next_actions_json ?? [],
    };
  }

  /** Compare all agents by revenue influenced — highest first. */
  async rankAgents(tenantId: string, agentIds: string[]): Promise<AgentKpi[]> {
    const kpis = await Promise.all(agentIds.map((id) => this.getAgentKpi(tenantId, id)));
    return kpis.sort((a, b) => b.revenueInfluencedCents - a.revenueInfluencedCents);
  }
}
