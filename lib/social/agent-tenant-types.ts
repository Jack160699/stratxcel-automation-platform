import type { OwnerContext } from "./db-context.ts";

// Deliberately dependency-free (no requireTenantContext/next-headers import
// here) — this is the half of agent-tenant-context.ts every repository/
// orchestrator function needs just for its type signature and the
// isTenantAgentContext branch, and those files must stay loadable under
// the plain `node --experimental-strip-types` test runner (most of
// lib/social/__tests__/*), which cannot resolve Next.js's request-scoped
// "next/headers" (pulled in transitively by requireTenantContext's real
// resolution logic in agent-tenant-context.ts). Only actual route/page/
// server-action call sites — which always run inside the real Next.js
// server runtime — need requireAgentTenantContext itself.

/**
 * Tenant-scoped sibling of OwnerContext (db-context.ts) for the
 * customer-facing Social Copilot. Same session-scoped Supabase client
 * (anon key + cookies, RLS-enforced) — the isolation boundary here is
 * tenant membership (tenant_members), never StratXcel-staff ownership.
 *
 * A row is unambiguously owner-scoped OR tenant-scoped, never both — see
 * the (owner_id IS NOT NULL) <> (tenant_id IS NOT NULL) CHECK constraint
 * added in 20260818230000_social_copilot_tenant_scoping.sql.
 *
 * `actorUserId` is kept distinct from `tenantId` deliberately: it is the
 * real authenticated person for audit/attribution (who sent this message,
 * who approved this action), while `tenantId` is the data-isolation
 * boundary. Never conflate the two — a tenant can have several members.
 */
export interface AgentTenantContext {
  ok: true;
  mode: "tenant";
  tenantId: string;
  actorUserId: string;
  supabase: OwnerContext["supabase"];
}

export interface AgentTenantContextError {
  ok: false;
  status: 401 | 403;
  error: string;
}

/**
 * Read-only structural shape most Social Copilot repository functions
 * actually need — they rely entirely on RLS via ctx.supabase and never
 * branch on which mode the caller is in. Both OwnerContext and
 * AgentTenantContext satisfy this.
 */
export interface AgentReadContext {
  supabase: OwnerContext["supabase"];
}

/** Full actor union for the few functions that must branch on identity (session creation, the atomic claim RPC, audit attribution). */
export type AgentActorContext = OwnerContext | AgentTenantContext;

export function isTenantAgentContext(ctx: AgentActorContext): ctx is AgentTenantContext {
  return "mode" in ctx && ctx.mode === "tenant";
}
