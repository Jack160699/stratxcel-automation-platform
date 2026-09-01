import { listLeads } from "@stratxcel/leads-and-crm";
import { listConversationsForTenant } from "@stratxcel/whatsapp";
import { listMissionsForTenant, getMission, createAndEstimateMission } from "@stratxcel/missions";
import { listPendingApprovals } from "@stratxcel/approvals";
import { createHumanHandoff } from "@stratxcel/human-handoff";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { getIntegrationMode } from "@stratxcel/whatsapp";
import type { AgentTool, ToolContext } from "../contract.ts";
import { interpretMissionOutcome } from "../mission-outcome.ts";

/**
 * PHASE 9 INVARIANT: every tool in this file derives tenantId from
 * ctx.principal.tenantId ONLY. Model-supplied tenantId arguments are never
 * read, even if present in `args` — see requireClientTenantId(), which does
 * not look at `args` at all. This is what makes cross-tenant isolation hold
 * even if a compromised/confused provider echoes a different tenantId back
 * as a tool argument.
 */
function requireClientTenantId(ctx: ToolContext): string {
  if (ctx.principal.kind !== "client") {
    throw new Error("agent-core: client tool invoked with a non-client principal");
  }
  if (!ctx.principal.tenantId) {
    throw new Error("agent-core: invariant violated — client principal without tenantId");
  }
  return ctx.principal.tenantId;
}

export const CLIENT_READ_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "my_workspace",
      description: "Get the caller's own workspace (tenant) summary.",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:workspace",
    async execute(ctx) {
      const tenantId = requireClientTenantId(ctx);
      const { data, error } = await ctx.supabase
        .from("tenants")
        .select("id, slug, name, created_at")
        .eq("id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return { workspace: data };
    },
  },
  {
    schema: {
      name: "my_missions",
      description: "List missions in the caller's own workspace.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:missions",
    async execute(ctx, args) {
      const tenantId = requireClientTenantId(ctx);
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const missions = await listMissionsForTenant(ctx.supabase, tenantId, limit);
      return { missions };
    },
  },
  {
    schema: {
      name: "my_mission",
      description: "Get a single mission by id, if it belongs to the caller's workspace.",
      parameters: { type: "object", properties: { missionId: { type: "string" } }, required: ["missionId"] },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:missions",
    async execute(ctx, args) {
      const tenantId = requireClientTenantId(ctx);
      const missionId = String(args.missionId ?? "");
      const mission = await getMission(ctx.supabase, missionId);
      if (mission.tenant_id !== tenantId) {
        // Do not reveal existence of another tenant's mission.
        return { found: false };
      }
      return { found: true, mission };
    },
  },
  {
    schema: {
      name: "my_approvals",
      description: "List pending approvals in the caller's own workspace.",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:approvals",
    async execute(ctx) {
      const tenantId = requireClientTenantId(ctx);
      const approvals = await listPendingApprovals(ctx.supabase, tenantId);
      return { approvals };
    },
  },
  {
    schema: {
      name: "my_brand",
      description: "Get the caller's own Brand Brain summary.",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:brand",
    async execute(ctx) {
      const tenantId = requireClientTenantId(ctx);
      const brand = await getCurrentBrandBrain(ctx.supabase, tenantId);
      return { brand };
    },
  },
  {
    schema: {
      name: "my_leads",
      description: "List leads in the caller's own workspace.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:leads",
    async execute(ctx, args) {
      const tenantId = requireClientTenantId(ctx);
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const leads = await listLeads(ctx.supabase, tenantId, limit);
      return { leads };
    },
  },
  {
    schema: {
      name: "my_conversations",
      description: "List WhatsApp conversations in the caller's own workspace.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:conversations",
    async execute(ctx, args) {
      const tenantId = requireClientTenantId(ctx);
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const conversations = await listConversationsForTenant(ctx.supabase, tenantId, limit);
      return { conversations };
    },
  },
  {
    schema: {
      name: "my_integrations_status",
      description: "Get the caller's integration mode status (e.g. WhatsApp disabled/shadow/live).",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:integrations",
    async execute(ctx) {
      requireClientTenantId(ctx);
      return { whatsapp: getIntegrationMode("WHATSAPP_INTEGRATION_MODE") };
    },
  },
];

export const CLIENT_MUTATION_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "create_mission",
      description: "Compile a goal into a mission in the caller's own workspace.",
      parameters: { type: "object", properties: { goalText: { type: "string" } }, required: ["goalText"] },
    },
    mutating: true,
    risk: "external_mutation",
    requiredPermission: "agent:mutate:missions",
    async execute(ctx, args) {
      const tenantId = requireClientTenantId(ctx);
      const goalText = String(args.goalText ?? "");
      if (!goalText) throw new Error("goalText is required");
      const mission = await createAndEstimateMission(ctx.supabase, {
        tenantId,
        createdBy: ctx.principal.authUserId,
        goalText,
      });
      return { mission };
    },
    // VERIFICATION INTEGRITY (autonomous-convergence-loop mission, section
    // 10) -- this customer-facing create_mission shares admin/mutation-tools.ts's
    // exact same soft-failure surface (createAndEstimateMission can return
    // a mission stuck in AWAITING_FUNDS/AWAITING_APPROVAL/etc without
    // throwing); see ../mission-outcome.ts's header comment.
    interpretOutcome: interpretMissionOutcome,
  },
  {
    schema: {
      name: "request_handoff",
      description: "Request a human handoff in the caller's own workspace.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" }, missionId: { type: "string" } },
        required: ["reason"],
      },
    },
    mutating: true,
    risk: "low_mutation",
    requiredPermission: "agent:mutate:handoffs",
    async execute(ctx, args) {
      const tenantId = requireClientTenantId(ctx);
      const reason = String(args.reason ?? "");
      if (!reason) throw new Error("reason is required");
      const missionId = typeof args.missionId === "string" ? args.missionId : undefined;
      const handoff = await createHumanHandoff(ctx.supabase, {
        tenantId,
        missionId,
        reason,
        contextSnapshot: { source: "agent_core", channel: ctx.principal.channel },
      });
      return { handoff };
    },
  },
];
