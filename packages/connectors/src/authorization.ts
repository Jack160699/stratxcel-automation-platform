import type { ServiceClient } from "./db.ts";
import { getConnectorDefinition } from "./registry.ts";
import { getConnectorConnection } from "./repository.ts";
import type { ConnectorAutonomy } from "./types.ts";

export type ConnectorAuthorizationResult =
  | { authorized: true; autonomy: ConnectorAutonomy }
  | { authorized: false; reason: string };

/**
 * Server-side enforcement gate (master brief Section 18 -- "a major
 * priority"): a connector being present/connected in Admin does NOT
 * automatically mean a mission may use it. This is the real check every
 * connector-backed Hermes tool call must pass BEFORE executing, not a
 * UI-only restriction and not a trust-the-tool-name shortcut.
 *
 * Honest v1 scope: Hermes missions (packages/hermes's MissionScopedContext)
 * carry a verified tenantId but no agent_definition_id or department --
 * the missions table itself has neither column today (confirmed against
 * the live schema before writing this). So this checks
 * Connector + Capability + Company(tenant) + Autonomy + real connector
 * health -- the full granularity the master brief's own list adds
 * (per-agent/per-department scoping) is a real, separate future task that
 * needs mission-to-agent association added first, not silently claimed
 * here.
 *
 * autonomy handling: "disabled" and "approval_required" both BLOCK the
 * call outright in this v1 -- approval_required does not (yet) route
 * through the existing request_approval flow and resume the mission
 * afterward; that is a genuine, larger mission-state integration, not
 * built here. Blocking conservatively is still a strictly safer default
 * than today's status quo (zero enforcement), never a regression.
 */
export async function assertConnectorCapabilityAuthorized(
  supabase: ServiceClient,
  input: { connectorKey: string; capabilityKey: string; tenantId: string }
): Promise<ConnectorAuthorizationResult> {
  const def = getConnectorDefinition(input.connectorKey);
  if (!def) return { authorized: false, reason: `unknown_connector:${input.connectorKey}` };
  if (!def.declaredCapabilities.includes(input.capabilityKey)) {
    return { authorized: false, reason: `capability_not_declared_for_connector:${input.capabilityKey}` };
  }

  const scopedTenantId = def.scopeLevel === "platform" ? null : input.tenantId;
  const connection = await getConnectorConnection(supabase, input.connectorKey, scopedTenantId);
  if (!connection) return { authorized: false, reason: "connector_not_connected" };
  if (!["connected", "healthy"].includes(connection.status)) {
    return { authorized: false, reason: `connector_unhealthy:${connection.status}` };
  }

  // An assignment may be recorded platform-wide (tenant_id null) or
  // specifically for this tenant -- either authorizes the tenant's call.
  const { data, error } = await supabase
    .from("connector_capability_assignments")
    .select("autonomy, tenant_id")
    .eq("connection_id", connection.id)
    .eq("capability_key", input.capabilityKey);
  if (error) return { authorized: false, reason: `assignment_lookup_failed:${error.message}` };

  const rows = (data ?? []) as Array<{ autonomy: ConnectorAutonomy; tenant_id: string | null }>;
  const match = rows.find((r) => r.tenant_id === null || r.tenant_id === input.tenantId);
  if (!match) return { authorized: false, reason: "capability_not_assigned" };
  if (match.autonomy === "disabled") return { authorized: false, reason: "autonomy_disabled" };
  if (match.autonomy === "approval_required") return { authorized: false, reason: "autonomy_approval_required_not_yet_auto_routed" };

  return { authorized: true, autonomy: match.autonomy };
}
