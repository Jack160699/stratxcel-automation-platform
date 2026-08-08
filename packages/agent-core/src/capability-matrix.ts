/**
 * Machine-readable capability matrix (PHASE 11). This is deliberately honest
 * about what has a real, tool-backed implementation today vs. what does
 * not — "the route/table exists" is never treated as FULL. Kept in sync by
 * the accompanying test (see __tests__/capability-matrix.test.ts), which
 * asserts every tool name listed here actually exists in the relevant
 * registry.
 */

export type CapabilityLevel = "FULL" | "READ" | "DASHBOARD_ONLY" | "UNAVAILABLE";

export interface CapabilityEntry {
  area: string;
  level: CapabilityLevel;
  readTools: string[];
  mutationTools: string[];
  notes?: string;
}

export const ADMIN_CAPABILITY_MATRIX: CapabilityEntry[] = [
  {
    area: "Agency Overview",
    level: "READ",
    readTools: ["agency_overview"],
    mutationTools: [],
    notes: "Cross-tenant counts (clients, open handoffs, pending approvals) plus worker health — composed from the same real tables list_clients/list_handoffs/list_approvals/inspect_system_health already read per-tenant.",
  },
  {
    area: "Clients",
    level: "READ",
    readTools: ["list_clients", "get_client"],
    mutationTools: [],
  },
  {
    area: "Leads",
    level: "READ",
    readTools: ["list_leads", "get_lead", "find_lead"],
    mutationTools: ["update_lead_status", "assign_lead", "create_follow_up"],
    notes: "Narrow, existing mutations only — no lead creation/deletion tool exposed to the agent.",
  },
  {
    area: "Missions",
    level: "READ",
    readTools: ["list_missions", "get_mission"],
    mutationTools: ["create_mission"],
    notes: "Mission cancel/retry/approve are staff-console actions, intentionally not exposed as agent tools in v1.",
  },
  {
    area: "Approvals",
    level: "READ",
    readTools: ["list_approvals"],
    mutationTools: [],
    notes: "Deciding an approval (approve/reject) is a human-accountability action and is deliberately NOT an agent tool.",
  },
  {
    area: "Human Handoffs",
    level: "READ",
    readTools: ["list_handoffs"],
    mutationTools: ["create_handoff"],
  },
  {
    area: "Operations Queue",
    level: "READ",
    readTools: ["inspect_operations_queue"],
    mutationTools: [],
    notes: "Kill-switch toggling is intentionally not an agent tool (adjacent to high-risk infrastructure control).",
  },
  {
    area: "Social Autopilot",
    level: "READ",
    readTools: ["social_inspect_accounts", "social_inspect_jobs"],
    mutationTools: [],
    notes:
      "Delegates to lib/social/repositories's service-client read functions. social_inspect_dead_letters and " +
      "social_get_performance are UNAVAILABLE in v1: their backing functions (listDeadLetters, listRecentMetrics) " +
      "require a cookie-scoped OwnerContext (see lib/social/db-context.ts), which does not exist in a " +
      "HMAC-authenticated server-to-server WhatsApp request, and this task must not change the Social Autopilot " +
      "agent's OwnerContext contract.",
  },
  {
    area: "Finance",
    level: "READ",
    readTools: ["finance_summary"],
    mutationTools: [],
    notes: "Wallet balance/reservation summary only — no payment capture/refund/settlement tool (explicitly high-risk/out of scope).",
  },
  {
    area: "Team",
    level: "UNAVAILABLE",
    readTools: [],
    mutationTools: [],
    notes: "No tenant_members management tool built in this phase.",
  },
  {
    area: "Integrations",
    level: "READ",
    readTools: ["inspect_integrations"],
    mutationTools: [],
  },
  {
    area: "System Health",
    level: "READ",
    readTools: ["inspect_system_health"],
    mutationTools: [],
  },
  {
    area: "Audit Log",
    level: "READ",
    readTools: ["inspect_audit_events"],
    mutationTools: [],
  },
];

/** Client-facing capability coverage. Every read/mutation tool listed here
 *  is tenant-scoped via ctx.principal.tenantId only — see
 *  tools/client/tools.ts's requireClientTenantId(). */
export const CLIENT_CAPABILITY: CapabilityEntry[] = [
  {
    area: "Workspace",
    level: "READ",
    readTools: ["my_workspace"],
    mutationTools: [],
  },
  {
    area: "Missions",
    level: "READ",
    readTools: ["my_missions", "my_mission"],
    mutationTools: ["create_mission"],
  },
  {
    area: "Approvals",
    level: "READ",
    readTools: ["my_approvals"],
    mutationTools: [],
  },
  {
    area: "Artifacts",
    level: "UNAVAILABLE",
    readTools: [],
    mutationTools: [],
    notes: "No artifact-listing repository function identified in this phase; not fabricated.",
  },
  {
    area: "Reports",
    level: "UNAVAILABLE",
    readTools: [],
    mutationTools: [],
    notes: "No client-facing report repository function identified in this phase; not fabricated.",
  },
  {
    area: "Brand",
    level: "READ",
    readTools: ["my_brand"],
    mutationTools: [],
  },
  {
    area: "Leads",
    level: "READ",
    readTools: ["my_leads"],
    mutationTools: [],
  },
  {
    area: "Conversations",
    level: "READ",
    readTools: ["my_conversations"],
    mutationTools: [],
  },
  {
    area: "Integrations",
    level: "READ",
    readTools: ["my_integrations_status"],
    mutationTools: [],
  },
  {
    area: "Human Handoffs",
    level: "READ",
    readTools: [],
    mutationTools: ["request_handoff"],
  },
];
