/**
 * Master brief Section 15 (Continuous Operations): lets a Founder set up a
 * real recurring mission ("run a lead-discovery pass on Bhilai/Durg every
 * week") via chat, reusing packages/missions/src/recurring.ts's real
 * cadence engine and createAndEstimateMission (never a duplicate mission-
 * creation path). create/list/disable always work; the automatic firing
 * itself is gated behind RECURRING_MISSIONS_ENABLED (off by default, a
 * real financial-commitment activation decision -- see recurring.ts's own
 * doc comment) -- run_recurring_mission_templates_now lets a human
 * explicitly fire due templates right now regardless of that flag, since
 * an explicit human request IS the authorization.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { createSupabaseServiceClient } from "../supabase/service.ts";
import { processRecurringTemplates, isRecurringMissionsEnabled, type RecurringCadence } from "@stratxcel/missions";

const VALID_CADENCES: RecurringCadence[] = ["daily", "weekly", "monthly"];

export const CREATE_RECURRING_MISSION_TEMPLATE_TOOL: AgentTool = {
  schema: {
    name: "create_recurring_mission_template",
    description:
      "Creates a real recurring mission template for a company -- e.g. 'run a lead-discovery pass on Bhilai/Durg every week'. Automatic firing is off by default platform-wide (a real financial-commitment activation the Founder must separately enable) -- use run_recurring_mission_templates_now to fire due templates on demand in the meantime. tenantId must be a real tenant id -- use resolve_client_by_name first if the user named a company.",
    parameters: {
      type: "object",
      properties: {
        tenantId: { type: "string" },
        label: { type: "string", description: "A short human-readable name, e.g. 'Weekly solar lead discovery'." },
        goalText: { type: "string", description: "The real mission goal text, compiled the same way a one-off mission would be." },
        cadence: { type: "string", enum: VALID_CADENCES },
      },
      required: ["tenantId", "label", "goalText", "cadence"],
    },
  },
  mutating: true,
  risk: "low_mutation",
  requiredPermission: "agent:mutate:recurring_missions",
  async execute(ctx, args) {
    const tenantId = typeof args.tenantId === "string" ? args.tenantId : "";
    const label = typeof args.label === "string" ? args.label.trim() : "";
    const goalText = typeof args.goalText === "string" ? args.goalText.trim() : "";
    const cadence = typeof args.cadence === "string" && (VALID_CADENCES as string[]).includes(args.cadence) ? (args.cadence as RecurringCadence) : null;
    if (!tenantId || !label || !goalText || !cadence) return { outcome: "FAILED", reason: "missing_or_invalid_field" };

    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("recurring_mission_templates")
      .insert({ tenant_id: tenantId, label, goal_text: goalText, cadence, created_by: ctx.principal.authUserId })
      .select("id, next_fire_at")
      .single();
    if (error) return { outcome: "FAILED", reason: error.message };
    return { outcome: "CREATED", templateId: data.id, nextFireAt: data.next_fire_at, automaticFiringEnabled: isRecurringMissionsEnabled() };
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "CREATED") return null;
    return { status: "failed", detail: r?.reason };
  },
};

export const LIST_RECURRING_MISSION_TEMPLATES_TOOL: AgentTool = {
  schema: {
    name: "list_recurring_mission_templates",
    description: "Lists a company's real recurring mission templates -- label, cadence, next fire time, whether enabled, and the last mission it created.",
    parameters: { type: "object", properties: { tenantId: { type: "string" } }, required: ["tenantId"] },
  },
  mutating: false,
  risk: "read",
  requiredPermission: "agent:read:recurring_missions",
  async execute(_ctx, args) {
    const tenantId = typeof args.tenantId === "string" ? args.tenantId : "";
    if (!tenantId) return { templates: [] };
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("recurring_mission_templates")
      .select("id, label, goal_text, cadence, enabled, next_fire_at, last_fired_at, last_mission_id")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`list_recurring_mission_templates: ${error.message}`);
    return { templates: data ?? [], automaticFiringEnabled: isRecurringMissionsEnabled() };
  },
};

export const SET_RECURRING_MISSION_TEMPLATE_ENABLED_TOOL: AgentTool = {
  schema: {
    name: "set_recurring_mission_template_enabled",
    description: "Enables or disables one existing recurring mission template. Disabling stops it from ever firing again until re-enabled; it does not delete it or cancel any mission it already created.",
    parameters: {
      type: "object",
      properties: { templateId: { type: "string" }, enabled: { type: "boolean" } },
      required: ["templateId", "enabled"],
    },
  },
  mutating: true,
  risk: "low_mutation",
  requiredPermission: "agent:mutate:recurring_missions",
  async execute(_ctx, args) {
    const templateId = typeof args.templateId === "string" ? args.templateId : "";
    const enabled = typeof args.enabled === "boolean" ? args.enabled : null;
    if (!templateId || enabled === null) return { outcome: "FAILED", reason: "missing_or_invalid_field" };
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("recurring_mission_templates")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", templateId)
      .select("id")
      .maybeSingle();
    if (error) return { outcome: "FAILED", reason: error.message };
    if (!data) return { outcome: "FAILED", reason: "template_not_found" };
    return { outcome: "UPDATED", templateId, enabled };
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "UPDATED") return null;
    return { status: "failed", detail: r?.reason };
  },
};

export const RUN_RECURRING_MISSION_TEMPLATES_NOW_TOOL: AgentTool = {
  schema: {
    name: "run_recurring_mission_templates_now",
    description:
      "Manually fires every currently-due, enabled recurring mission template right now, across all companies -- works even while automatic firing is disabled platform-wide, since an explicit request from you IS the authorization. Use when the Founder explicitly asks to run recurring missions now, or to test a template right after creating it. Each firing reserves real wallet funds for its company the same way a one-off mission would.",
    parameters: { type: "object", properties: {} },
  },
  mutating: true,
  risk: "external_mutation",
  requiredPermission: "agent:mutate:recurring_missions",
  async execute() {
    const service = createSupabaseServiceClient();
    const results = await processRecurringTemplates(service as never);
    return {
      fired: results.filter((r) => r.outcome === "fired").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      results,
    };
  },
};

export const RECURRING_MISSION_TOOLS: AgentTool[] = [
  CREATE_RECURRING_MISSION_TEMPLATE_TOOL,
  LIST_RECURRING_MISSION_TEMPLATES_TOOL,
  SET_RECURRING_MISSION_TEMPLATE_ENABLED_TOOL,
  RUN_RECURRING_MISSION_TEMPLATES_NOW_TOOL,
];
