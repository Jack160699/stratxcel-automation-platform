import { listLeads } from "@stratxcel/leads-and-crm";
import { listConversationsForTenant, listMessagesForConversation } from "@stratxcel/whatsapp";
import { getIntegrationMode } from "@stratxcel/whatsapp";
import { listMissionsForTenant, getMission } from "@stratxcel/missions";
import { listPendingApprovals } from "@stratxcel/approvals";
import { listOpenHandoffs } from "@stratxcel/human-handoff";
import { listAuditEvents } from "@stratxcel/audit";
import { listKillSwitches, getWorkerHealth, type WorkerType } from "@stratxcel/queue";
import { getWalletAccount } from "@stratxcel/payments-and-wallet";
import type { AgentTool } from "../contract.ts";

function requireTenantId(args: Record<string, unknown>): string {
  const tenantId = args.tenantId;
  if (typeof tenantId !== "string" || !tenantId) {
    throw new Error("tenantId is required for this admin tool");
  }
  return tenantId;
}

/**
 * All tools in this file are READ tools with real repository-backed
 * implementations — none fabricate data. Where a genuinely equivalent
 * backend capability does not exist yet (e.g. a single all-up "system
 * health" endpoint), the tool composes existing real functions rather than
 * inventing a new capability (see inspect_system_health).
 */
export const ADMIN_READ_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "agency_overview",
      description: "Cross-tenant agency snapshot: total clients, open handoffs, pending approvals, and worker health — composed from existing real counts, not a fabricated summary.",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:clients",
    async execute(ctx) {
      // Every count below is a direct, service-role-scoped aggregate over
      // the same tables list_clients/list_handoffs/list_approvals already
      // read per-tenant — this just removes the tenantId filter, it does
      // not touch Social's cookie-scoped OwnerContext or invent new data.
      const [{ count: tenantCount }, { count: openHandoffCount }, { count: pendingApprovalCount }] = await Promise.all([
        ctx.supabase.from("tenants").select("id", { count: "exact", head: true }),
        // Status vocabulary matches listOpenHandoffs/listPendingApprovals exactly (see packages/human-handoff, packages/approvals).
        ctx.supabase.from("human_handoffs").select("id", { count: "exact", head: true }).in("status", ["OPEN", "IN_PROGRESS"]),
        ctx.supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      ]);
      const workerTypes: WorkerType[] = ["mission-worker", "whatsapp-worker", "hermes-gateway"];
      const workerHealth = await Promise.all(workerTypes.map(async (type) => ({ workerType: type, health: await getWorkerHealth(ctx.supabase, type) })));
      return {
        tenantCount: tenantCount ?? 0,
        openHandoffCount: openHandoffCount ?? 0,
        pendingApprovalCount: pendingApprovalCount ?? 0,
        workerHealth,
      };
    },
  },
  {
    schema: {
      name: "list_clients",
      description: "List Stratxcel client tenants (id, slug, name, created_at).",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:clients",
    async execute(ctx, args) {
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const { data, error } = await ctx.supabase
        .from("tenants")
        .select("id, slug, name, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return { clients: data ?? [] };
    },
  },
  {
    schema: {
      name: "get_client",
      description: "Get a single client tenant plus its member count.",
      parameters: { type: "object", properties: { tenantId: { type: "string" } }, required: ["tenantId"] },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:clients",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const { data: tenant, error } = await ctx.supabase
        .from("tenants")
        .select("id, slug, name, created_at")
        .eq("id", tenantId)
        .maybeSingle();
      if (error) throw error;
      if (!tenant) return { found: false };
      const { count } = await ctx.supabase
        .from("tenant_members")
        .select("user_id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      return { found: true, client: tenant, memberCount: count ?? 0 };
    },
  },
  {
    schema: {
      name: "list_leads",
      description: "List leads for a tenant, most recent first.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, limit: { type: "number" } },
        required: ["tenantId"],
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:leads",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const leads = await listLeads(ctx.supabase, tenantId, limit);
      return { leads };
    },
  },
  {
    schema: {
      name: "get_lead",
      description: "Get a single lead by id (tenant-scoped).",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, leadId: { type: "string" } },
        required: ["tenantId", "leadId"],
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:leads",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const leadId = String(args.leadId ?? "");
      const { data, error } = await ctx.supabase
        .from("crm_leads")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw error;
      return { found: Boolean(data), lead: data ?? null };
    },
  },
  {
    schema: {
      name: "find_lead",
      description: "Search leads in a tenant by name, phone, or email (partial match).",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, query: { type: "string" } },
        required: ["tenantId", "query"],
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:leads",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const query = String(args.query ?? "").slice(0, 100);
      if (!query) return { leads: [] };
      const like = `%${query.replace(/[%_]/g, "")}%`;
      const { data, error } = await ctx.supabase
        .from("crm_leads")
        .select("*")
        .eq("tenant_id", tenantId)
        .or(`contact_name.ilike.${like},contact_phone.ilike.${like},contact_email.ilike.${like}`)
        .limit(10);
      if (error) throw error;
      return { leads: data ?? [] };
    },
  },
  {
    schema: {
      name: "list_conversations",
      description: "List WhatsApp conversations for a tenant.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, limit: { type: "number" } },
        required: ["tenantId"],
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:conversations",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const conversations = await listConversationsForTenant(ctx.supabase, tenantId, limit);
      return { conversations };
    },
  },
  {
    schema: {
      name: "get_conversation",
      description: "Get recent messages for a conversation.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, conversationId: { type: "string" }, limit: { type: "number" } },
        required: ["tenantId", "conversationId"],
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:conversations",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const conversationId = String(args.conversationId ?? "");
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const messages = await listMessagesForConversation(ctx.supabase, tenantId, conversationId, limit);
      return { messages };
    },
  },
  {
    schema: {
      name: "list_missions",
      description: "List missions for a tenant.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, limit: { type: "number" } },
        required: ["tenantId"],
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:missions",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;
      const missions = await listMissionsForTenant(ctx.supabase, tenantId, limit);
      return { missions };
    },
  },
  {
    schema: {
      name: "get_mission",
      description: "Get a single mission by id.",
      parameters: { type: "object", properties: { missionId: { type: "string" } }, required: ["missionId"] },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:missions",
    async execute(ctx, args) {
      const missionId = String(args.missionId ?? "");
      const mission = await getMission(ctx.supabase, missionId);
      return { mission };
    },
  },
  {
    schema: {
      name: "list_approvals",
      description: "List pending approvals for a tenant.",
      parameters: { type: "object", properties: { tenantId: { type: "string" } }, required: ["tenantId"] },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:approvals",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const approvals = await listPendingApprovals(ctx.supabase, tenantId);
      return { approvals };
    },
  },
  {
    schema: {
      name: "list_handoffs",
      description: "List open human handoffs for a tenant.",
      parameters: { type: "object", properties: { tenantId: { type: "string" } }, required: ["tenantId"] },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:handoffs",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const handoffs = await listOpenHandoffs(ctx.supabase, tenantId);
      return { handoffs };
    },
  },
  {
    schema: {
      name: "inspect_operations_queue",
      description: "Inspect active operational kill-switches (queue/worker circuit breakers).",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:operations",
    async execute(ctx) {
      const killSwitches = await listKillSwitches(ctx.supabase);
      return { killSwitches };
    },
  },
  {
    schema: {
      name: "inspect_system_health",
      description: "Inspect worker heartbeat/health for mission-worker, whatsapp-worker, and hermes-gateway.",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:health",
    async execute(ctx) {
      const workerTypes: WorkerType[] = ["mission-worker", "whatsapp-worker", "hermes-gateway"];
      const reports = await Promise.all(
        workerTypes.map(async (type) => ({ workerType: type, health: await getWorkerHealth(ctx.supabase, type) }))
      );
      return { workers: reports };
    },
  },
  {
    schema: {
      name: "inspect_integrations",
      description: "Inspect configured integration modes (WhatsApp, etc.) — disabled/shadow/live.",
      parameters: { type: "object", properties: {} },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:integrations",
    async execute() {
      return {
        whatsapp: getIntegrationMode("WHATSAPP_INTEGRATION_MODE"),
      };
    },
  },
  {
    schema: {
      name: "inspect_audit_events",
      description: "List recent audit events for a tenant.",
      parameters: {
        type: "object",
        properties: { tenantId: { type: "string" }, limit: { type: "number" } },
        required: ["tenantId"],
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:audit",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 25;
      const events = await listAuditEvents(ctx.supabase, tenantId, limit);
      // Secret-shaped fields are already redacted by recordAuditEvent's
      // sanitizeAuditMetadata at write time — nothing further to strip here.
      return { events };
    },
  },
  {
    schema: {
      name: "finance_summary",
      description: "Get wallet balance/reservation summary for a tenant.",
      parameters: { type: "object", properties: { tenantId: { type: "string" } }, required: ["tenantId"] },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:finance",
    async execute(ctx, args) {
      const tenantId = requireTenantId(args);
      const account = await getWalletAccount(ctx.supabase, tenantId);
      return { wallet: account };
    },
  },
  {
    schema: {
      name: "check_capabilities",
      description: "The canonical Capability Registry -- what the whole Stratxcel ecosystem can actually do right now, honestly classified (REAL_EXPOSED, REAL_NOT_EXPOSED, PARTIAL, BROKEN, NOT_BUILT, EXTERNAL_REQUIRED). Use this to answer 'what can you do', 'can you do X yet', or to check a capability's real status before claiming it exists or doesn't.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional filter, e.g. research, growth, media, outreach, website, finance, ecosystem." },
          status: { type: "string", description: "Optional filter: REAL_EXPOSED, REAL_NOT_EXPOSED, PARTIAL, BROKEN, NOT_BUILT, or EXTERNAL_REQUIRED." },
        },
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:capabilities",
    async execute(ctx, args) {
      let query = ctx.supabase
        .from("capability_registry")
        .select("capability_key, name, description, category, status, status_notes, external_blocker, department, connection, cost_profile")
        .order("category", { ascending: true });
      const category = typeof args.category === "string" ? args.category : null;
      const status = typeof args.status === "string" ? args.status : null;
      if (category) query = query.eq("category", category);
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return { capabilities: data ?? [] };
    },
  },
];
