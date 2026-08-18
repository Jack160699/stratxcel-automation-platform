// Server/route/page call sites only — this file pulls in requireTenantContext,
// which resolves Next.js's request-scoped cookies() (via "next/headers")
// through lib/tenants/tenant-context.ts, so it cannot be imported from
// anything that also needs to run under the plain
// `node --experimental-strip-types` test runner. Repository/orchestrator
// files that only need the types or the isTenantAgentContext guard import
// from agent-tenant-types.ts instead.

import { requireTenantContext } from "../tenants/tenant-context.ts";
import { requirePermission, PermissionDeniedError } from "../rbac/policy.ts";
import type { AgentTenantContext, AgentTenantContextError } from "./agent-tenant-types.ts";

export type {
  AgentTenantContext,
  AgentTenantContextError,
  AgentReadContext,
  AgentActorContext,
} from "./agent-tenant-types.ts";
export { isTenantAgentContext } from "./agent-tenant-types.ts";

/**
 * Re-derives tenant membership from the caller's own session on every call
 * (via requireTenantContext) — a client-supplied tenantId is never trusted
 * on its own. Uses the same "mission:create" permission tier as the rest
 * of the tenant platform's AI-driven feature set (missions), rather than
 * inventing a new, unaudited permission for this one feature.
 */
export async function requireAgentTenantContext(
  tenantId: string
): Promise<AgentTenantContext | AgentTenantContextError> {
  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return ctx;

  try {
    requirePermission(ctx.role, "mission:create");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return { ok: false, status: 403, error: err.message };
    throw err;
  }

  return { ok: true, mode: "tenant", tenantId, actorUserId: ctx.userId, supabase: ctx.supabase };
}
