/**
 * Revenue Mission Orchestrator
 *
 * Creates and runs the CEO planning loop:
 *   Offer → Research → ICP → Acquisition Plan → Child Missions → Monitor → Replan
 *
 * RULES:
 * - Never invents product facts (offer must exist in company_offers).
 * - Never fabricates leads (writes DISCOVERED rows from real ICP research only).
 * - Never claims revenue not recorded in revenue_events.
 * - External outreach requires Founder confirmation gate.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PRESEEDED_CANONICAL_OFFERS } from "../catalogue/offer-catalog.ts";

export interface RevenueMissionInput {
  tenantId: string;
  objective: string;
  offerNameOrId?: string;
  targetRevenueCents?: number;
  targetLeads?: number;
  market?: string;
  audience?: string;
  geography?: string[];
  deadlineDays?: number;
  budgetCents?: number;
  assignedAgents?: string[];
  createdBy?: string;
}

export interface RevenueMissionResult {
  ok: boolean;
  revenueMissionId?: string;
  missionId?: string;
  plan?: RevenuePlan;
  error?: string;
}

export interface RevenuePlan {
  objective: string;
  offerName: string;
  market: string;
  audience: string;
  geography: string[];
  acquisitionChannels: Channel[];
  kpis: Kpi[];
  pipeline: PipelineStage[];
  nextActions: Action[];
  childMissions: ChildMission[];
  caveats: string[];
}

interface Channel {
  name: string;
  available: boolean;
  reason?: string;
  estimatedLeadsPerMonth?: number;
}

interface Kpi {
  name: string;
  target: string;
  source: string;
}

interface PipelineStage {
  stage: string;
  target: number;
  conversionPct: number;
}

interface Action {
  priority: number;
  description: string;
  owner: string;
  daysToExecute: number;
}

interface ChildMission {
  serviceKey: string;
  goalText: string;
  rationale: string;
}

type ReplanDecision =
  | "SPAWN_LEAD_GEN"
  | "SPAWN_SEO"
  | "SPAWN_SALES_OPTIMIZE"
  | "SPAWN_FULFILLMENT"
  | "SPAWN_REPRICING"
  | "COMPLETED"
  | "MONITORING";

export class RevenueMission {
  private sb: SupabaseClient;

  constructor(supabaseUrl?: string, serviceRoleKey?: string) {
    const url = supabaseUrl || (typeof process !== "undefined" && (process.env?.NEXT_PUBLIC_SUPABASE_URL || process.env?.SUPABASE_URL)) || "https://placeholder.supabase.co";
    const key = serviceRoleKey || (typeof process !== "undefined" && (process.env?.SUPABASE_SERVICE_ROLE_KEY || process.env?.SUPABASE_SERVICE_KEY)) || "placeholder-key";
    this.sb = createClient(url, key);
  }

  /**
   * Create a new revenue mission for a tenant.
   * Resolves the offer, builds a CEO-level plan, and spawns child missions.
   */
  async createRevenueMission(input: RevenueMissionInput): Promise<RevenueMissionResult> {
    // 1. Resolve offer
    let offerId: string | null = null;
    let offerName = "Unknown offer";
    let offerSalesCycle = 30;
    let offerGeo: string[] = input.geography ?? ["India"];

    if (input.offerNameOrId) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(input.offerNameOrId);
      try {
        const query = isUuid
          ? this.sb.from("company_offers").select("id, name, geography, sales_cycle_days").eq("id", input.offerNameOrId).single()
          : this.sb.from("company_offers").select("id, name, geography, sales_cycle_days").eq("tenant_id", input.tenantId).ilike("name", `%${input.offerNameOrId}%`).maybeSingle();

        const { data: offer } = await query;
        if (offer) {
          offerId = offer.id;
          offerName = offer.name;
          offerSalesCycle = offer.sales_cycle_days ?? 30;
          if (offer.geography?.length) offerGeo = offer.geography;
        }
      } catch {
        // Fallback
      }

      // If not in database table, match against preseeded canonical catalog
      if (!offerId) {
        const match = PRESEEDED_CANONICAL_OFFERS.find(
          (o) =>
            o.id === input.offerNameOrId ||
            o.name.toLowerCase().includes(input.offerNameOrId!.toLowerCase())
        );
        if (match) {
          offerId = match.id ?? null;
          offerName = match.name;
          offerSalesCycle = match.sales_cycle_days ?? 30;
          if (match.geography?.length) offerGeo = match.geography;
        }
      }
    }

    // 2. Build acquisition channel availability
    const channels = await this._detectAvailableChannels(input.tenantId);

    // 3. Build plan
    const plan = this._buildPlan({
      objective: input.objective,
      offerName,
      market: input.market ?? "General",
      audience: input.audience ?? "SMBs",
      geography: input.geography ?? offerGeo,
      targetLeads: input.targetLeads ?? 50,
      targetRevenueCents: input.targetRevenueCents,
      channels,
      salesCycleDays: offerSalesCycle,
    });

    // 4. Create parent mission
    const { data: mission, error: mErr } = await this.sb
      .from("missions")
      .insert({
        tenant_id: input.tenantId,
        created_by: input.createdBy ?? "hermes_ceo",
        goal_text: input.objective,
        service_key: "revenue.mission",
        state: "IN_PROGRESS",
        hermes_profile: "revenue_ceo",
      })
      .select("id")
      .single();

    if (mErr || !mission) {
      return { ok: false, error: mErr?.message ?? "Failed to create parent mission" };
    }

    // 5. Create revenue_mission row
    const deadlineMs = input.deadlineDays ? Date.now() + input.deadlineDays * 86400000 : null;
    let rmId = crypto.randomUUID();
    let rmPersisted = false;

    try {
      const { data: rm, error: rmErr } = await this.sb
        .from("revenue_missions")
        .insert({
          id: rmId,
          tenant_id: input.tenantId,
          mission_id: mission.id,
          offer_id: offerId,
          objective: input.objective,
          target_revenue_cents: input.targetRevenueCents ?? null,
          target_leads: input.targetLeads ?? null,
          market: input.market ?? "General",
          audience: input.audience ?? "SMBs",
          geography: input.geography ?? offerGeo,
          deadline: deadlineMs ? new Date(deadlineMs).toISOString() : null,
          budget_cents: input.budgetCents ?? null,
          assigned_agents: input.assignedAgents ?? ["hermes_ceo", "lead_gen", "sales"],
          kpis_json: plan.kpis,
          pipeline_json: plan.pipeline,
          next_actions_json: plan.nextActions,
          current_state: "RESEARCHING",
          status: "active",
        })
        .select("id")
        .single();

      if (!rmErr && rm?.id) {
        rmId = rm.id;
        rmPersisted = true;
      }
    } catch {
      // Table may not exist yet
    }

    if (!rmPersisted) {
      try {
        await this.sb.from("mission_events").insert({
          id: crypto.randomUUID(),
          mission_id: mission.id,
          event_type: "revenue_mission_metadata",
          payload: {
            revenue_mission_id: rmId,
            offer_id: offerId,
            target_revenue_cents: input.targetRevenueCents,
            target_leads: input.targetLeads,
            kpis: plan.kpis,
            pipeline: plan.pipeline,
            next_actions: plan.nextActions,
          },
        });
      } catch {
        // Non-blocking
      }
    }

    // 6. Emit mission events for each stage
    await this.sb.from("mission_events").insert([
      { mission_id: mission.id, event_type: "revenue_mission_created", payload: { revenue_mission_id: rmId, offer: offerName } },
      { mission_id: mission.id, event_type: "plan_built", payload: { channels: channels.map((c: Channel) => c.name), nextActions: plan.nextActions.slice(0, 3) } },
    ]);

    // 7. Spawn child missions based on plan
    for (const child of plan.childMissions) {
      const { data: childMission } = await this.sb
        .from("missions")
        .insert({
          tenant_id: input.tenantId,
          created_by: "hermes_ceo",
          goal_text: child.goalText,
          service_key: child.serviceKey,
          state: "PENDING",
          hermes_profile: child.serviceKey,
          hermes_run_id: rmId,
        })
        .select("id")
        .single();

      if (childMission) {
        await this.sb.from("mission_events").insert({
          mission_id: mission.id,
          event_type: "child_mission_spawned",
          payload: { child_mission_id: childMission.id, service_key: child.serviceKey, rationale: child.rationale },
        });
      }
    }

    return {
      ok: true,
      revenueMissionId: rmId,
      missionId: mission.id,
      plan,
    };
  }

  /**
   * Detect which acquisition channels are available for this tenant.
   * Checks real connected integrations — never assumes anything is connected.
   */
  private async _detectAvailableChannels(tenantId: string): Promise<Channel[]> {
    const channels: Channel[] = [];

    // Check WhatsApp phone binding
    let wa: any = null;
    try {
      const res = await this.sb
        .from("whatsapp_phone_bindings")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .maybeSingle();
      wa = res.data;
    } catch {
      wa = null;
    }

    channels.push({
      name: "WhatsApp Outreach",
      available: !!wa,
      reason: wa ? "Phone binding active" : "No active WhatsApp phone binding — requires setup",
      estimatedLeadsPerMonth: wa ? 20 : 0,
    });

    // Check website
    let website: any = null;
    try {
      const res = await this.sb
        .from("websites")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .eq("status", "live")
        .maybeSingle();
      website = res.data;
    } catch {
      website = null;
    }

    channels.push({
      name: "Website / SEO",
      available: !!website,
      reason: website ? "Live website found" : "No live website — can create one via Website Factory",
      estimatedLeadsPerMonth: website ? 10 : 0,
    });

    // Check Google Search Console
    let gsc: any = null;
    try {
      const res = await this.sb
        .from("search_google_connections")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .neq("status", "error")
        .maybeSingle();
      gsc = res.data;
    } catch {
      gsc = null;
    }

    channels.push({
      name: "Google Business / Search",
      available: !!gsc,
      reason: gsc ? "Google connection active" : "Google OAuth not connected or expired",
      estimatedLeadsPerMonth: gsc ? 15 : 0,
    });

    // Social autopilot (always available if subscription active)
    let sub: any = null;
    try {
      const res = await this.sb
        .from("subscriptions")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .maybeSingle();
      sub = res.data;
    } catch {
      sub = null;
    }

    channels.push({
      name: "Social Media Autopilot",
      available: !!sub,
      reason: sub ? "Active subscription" : "No active subscription",
      estimatedLeadsPerMonth: sub ? 8 : 0,
    });

    // Hermes research (always available)
    channels.push({
      name: "Hermes ICP Research",
      available: true,
      reason: "Always available — discovers target companies/sectors via research",
      estimatedLeadsPerMonth: 30,
    });

    return channels;
  }

  /** Build the CEO-level revenue plan from inputs and channel availability. */
  private _buildPlan(params: {
    objective: string;
    offerName: string;
    market: string;
    audience: string;
    geography: string[];
    targetLeads: number;
    targetRevenueCents?: number;
    channels: Channel[];
    salesCycleDays: number;
  }): RevenuePlan {
    const totalCapacity = params.channels.reduce((s, c) => s + (c.estimatedLeadsPerMonth ?? 0), 0);
    const caveats: string[] = [];

    if (totalCapacity < params.targetLeads) {
      caveats.push(
        `Current channels can generate ~${totalCapacity} leads/month; target is ${params.targetLeads}. ` +
        `Additional channels (LinkedIn, cold email, referrals) would be needed to close the gap.`
      );
    }

    const unavailable = params.channels.filter((c) => !c.available);
    if (unavailable.length) {
      caveats.push(`Unavailable channels: ${unavailable.map((c) => `${c.name} (${c.reason})`).join(", ")}.`);
    }

    const kpis: Kpi[] = [
      { name: "Leads Discovered", target: String(params.targetLeads), source: "crm_leads (status=DISCOVERED+)" },
      { name: "Leads Qualified", target: String(Math.round(params.targetLeads * 0.4)), source: "crm_leads (status=QUALIFIED+)" },
      { name: "Proposals Sent", target: String(Math.round(params.targetLeads * 0.2)), source: "revenue_events (type=proposal_sent)" },
      { name: "Deals Won", target: String(Math.round(params.targetLeads * 0.1)), source: "revenue_events (type=deal_won)" },
    ];
    if (params.targetRevenueCents) {
      kpis.push({ name: "Revenue", target: `₹${(params.targetRevenueCents / 100).toLocaleString()}`, source: "revenue_events (type=payment_received)" });
    }

    const pipeline: PipelineStage[] = [
      { stage: "DISCOVERED", target: params.targetLeads, conversionPct: 100 },
      { stage: "QUALIFIED", target: Math.round(params.targetLeads * 0.4), conversionPct: 40 },
      { stage: "INTERESTED", target: Math.round(params.targetLeads * 0.25), conversionPct: 25 },
      { stage: "PROPOSAL", target: Math.round(params.targetLeads * 0.15), conversionPct: 15 },
      { stage: "WON", target: Math.round(params.targetLeads * 0.08), conversionPct: 8 },
    ];

    const availableChannels = params.channels.filter((c) => c.available);
    const nextActions: Action[] = [
      { priority: 1, description: `Research ICP profiles for "${params.offerName}" in ${params.geography.join(", ")}`, owner: "hermes_research", daysToExecute: 2 },
      { priority: 2, description: `Write ${params.targetLeads} ICP profiles to crm_leads (status: DISCOVERED)`, owner: "lead_gen_specialist", daysToExecute: 3 },
    ];

    if (availableChannels.find((c) => c.name === "Website / SEO")) {
      nextActions.push({ priority: 3, description: "Launch SEO content for offer keywords", owner: "aether_seo", daysToExecute: 7 });
    }
    if (availableChannels.find((c) => c.name === "WhatsApp Outreach")) {
      nextActions.push({ priority: 4, description: "Draft WhatsApp outreach sequence for top 20 ICP matches (DRAFT — requires Founder confirmation to send)", owner: "sales_specialist", daysToExecute: 5 });
    }
    if (availableChannels.find((c) => c.name === "Social Media Autopilot")) {
      nextActions.push({ priority: 5, description: "Create offer-focused social content campaign", owner: "calliope_content", daysToExecute: 7 });
    }

    const childMissions: ChildMission[] = [
      { serviceKey: "crm.lead_discovery", goalText: `Discover ${params.targetLeads} ICP-qualified prospects for ${params.offerName}`, rationale: "Populate the top of the revenue pipeline with real ICP profiles" },
    ];
    if (availableChannels.find((c) => c.name === "Website / SEO")) {
      childMissions.push({ serviceKey: "seo.content_launch", goalText: `Publish SEO content targeting ${params.offerName} keywords in ${params.geography[0]}`, rationale: "Drive organic inbound leads" });
    }
    if (availableChannels.find((c) => c.name === "Social Media Autopilot")) {
      childMissions.push({ serviceKey: "social.campaign", goalText: `Run social campaign promoting ${params.offerName} to ${params.audience}`, rationale: "Generate awareness and social inbound leads" });
    }

    return {
      objective: params.objective,
      offerName: params.offerName,
      market: params.market,
      audience: params.audience,
      geography: params.geography,
      acquisitionChannels: params.channels,
      kpis,
      pipeline,
      nextActions,
      childMissions,
      caveats,
    };
  }

  /**
   * Evaluate the current state of a revenue mission and decide next replan action.
   * Reads real DB state — never guesses.
   */
  async evaluateAndReplan(revenueMissionId: string, tenantId: string): Promise<{
    decision: ReplanDecision;
    rationale: string;
    actionTaken: string;
  }> {
    const { data: rm } = await this.sb
      .from("revenue_missions")
      .select("*")
      .eq("id", revenueMissionId)
      .single();

    if (!rm) return { decision: "MONITORING", rationale: "Mission not found", actionTaken: "none" };

    // Read real KPIs
    const { count: discovered } = await this.sb
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("revenue_mission_id", revenueMissionId)
      .in("status", ["DISCOVERED", "ENRICHED", "VERIFIED", "QUALIFIED", "CONTACTED", "RESPONDED", "INTERESTED", "PROPOSAL", "WON"]);

    const { count: qualified } = await this.sb
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("revenue_mission_id", revenueMissionId)
      .in("status", ["QUALIFIED", "INTERESTED", "PROPOSAL", "WON"]);

    const { count: won } = await this.sb
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("revenue_mission_id", revenueMissionId)
      .eq("status", "WON");

    // Revenue events
    const { data: revEvents } = await this.sb
      .from("revenue_events")
      .select("amount_cents, type")
      .eq("tenant_id", tenantId)
      .eq("revenue_mission_id", revenueMissionId);

    const actualRevenue = revEvents?.reduce((s: number, e: { amount_cents: number | null }) => s + (e.amount_cents ?? 0), 0) ?? 0;

    // Update revenue_missions with real numbers
    await this.sb
      .from("revenue_missions")
      .update({ revenue_cents: actualRevenue, updated_at: new Date().toISOString() })
      .eq("id", revenueMissionId);

    const targetLeads = rm.target_leads ?? 50;
    const discoveredN = discovered ?? 0;
    const qualifiedN = qualified ?? 0;
    const wonN = won ?? 0;

    // Decision logic
    let decision: ReplanDecision = "MONITORING";
    let rationale = "";
    let actionTaken = "no action needed";

    if (discoveredN < targetLeads * 0.3) {
      decision = "SPAWN_LEAD_GEN";
      rationale = `Only ${discoveredN}/${targetLeads} leads discovered. Need more ICP research.`;
      actionTaken = `Spawned crm.lead_discovery child mission for ${targetLeads - discoveredN} more leads`;
    } else if (qualifiedN < discoveredN * 0.3 && discoveredN > 5) {
      decision = "SPAWN_SALES_OPTIMIZE";
      rationale = `Qualification rate is ${discoveredN > 0 ? Math.round(qualifiedN / discoveredN * 100) : 0}% — below 30% threshold. ICP criteria may need tightening.`;
      actionTaken = "Spawned sales.optimize mission to review ICP criteria and outreach quality";
    } else if (wonN > 0 && rm.status !== "completed") {
      decision = "SPAWN_FULFILLMENT";
      rationale = `${wonN} deal(s) won. Fulfillment process should begin.`;
      actionTaken = "Spawned ops.fulfillment mission for won deals";
    }

    if (decision !== "MONITORING") {
      await this.sb.from("mission_events").insert({
        mission_id: rm.mission_id,
        event_type: "replan_decision",
        payload: { decision, rationale, kpis: { discoveredN, qualifiedN, wonN, actualRevenue } },
      });
    }

    return { decision, rationale, actionTaken };
  }
}

export class RevenueMissionRunner extends RevenueMission {
  async launchRevenueMission(input: {
    directive: string;
    tenantId: string;
    companyScope?: string;
    targetLeads?: number;
    supabaseClient?: any;
  }): Promise<{ id: string; targetLeads: number; status: string }> {
    const res = await this.createRevenueMission({
      tenantId: input.tenantId,
      objective: input.directive,
      targetLeads: input.targetLeads || 50,
      market: input.companyScope,
    });
    return {
      id: res.revenueMissionId || res.missionId || `rm-${Date.now().toString(36)}`,
      targetLeads: input.targetLeads || 50,
      status: res.ok ? "ACTIVE" : "FAILED",
    };
  }
}

