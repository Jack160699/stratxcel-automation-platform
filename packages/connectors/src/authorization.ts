import type { ServiceClient } from "./db.ts";
import { getConnectorDefinition, resolvePreferredExecutionMethod } from "./registry.ts";
import { getConnectorConnection } from "./repository.ts";
import type { ConnectorAccessMethod, ConnectorAuthorizationResult, ConnectorAutonomy } from "./types.ts";
import { recordConnectorAudit } from "./audit.ts";

export interface ConnectorAuthorizationInput {
  connectorKey: string;
  capabilityKey: string;
  tenantId: string | null;
  agentDefinitionId?: string | null;
  department?: string | null;
  missionId?: string | null;
  actorKind?: "founder" | "hermes" | "admin" | "system";
  actorId?: string | null;
  requestedMethod?: ConnectorAccessMethod;
}

/**
 * Production-hardened server-side authorization and isolation gate.
 * Single control plane checking:
 * Founder/Tenant + Company + Agent + Mission + Capability + Connector + Permission + Autonomy + Budget
 */
export async function assertConnectorCapabilityAuthorized(
  supabase: ServiceClient,
  input: ConnectorAuthorizationInput
): Promise<ConnectorAuthorizationResult> {
  const actorKind = input.actorKind ?? "hermes";

  // 1. Definition check
  const def = getConnectorDefinition(input.connectorKey);
  if (!def) {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: { reason: "unknown_connector", missionId: input.missionId },
    });
    return { authorized: false, reason: `unknown_connector:${input.connectorKey}`, errorCode: "UNKNOWN_CONNECTOR" };
  }

  // 2. Capability declared check
  if (!def.declaredCapabilities.includes(input.capabilityKey)) {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: { reason: "capability_not_declared_for_connector", missionId: input.missionId },
    });
    return {
      authorized: false,
      reason: `capability_not_declared_for_connector:${input.capabilityKey}`,
      errorCode: "CAPABILITY_NOT_DECLARED",
    };
  }

  // 3. Company isolation & connection resolution
  const scopedTenantId = def.scopeLevel === "platform" ? null : input.tenantId;
  const connection = await getConnectorConnection(supabase, input.connectorKey, scopedTenantId);
  if (!connection) {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: { reason: "connector_not_connected", missionId: input.missionId },
    });
    return { authorized: false, reason: "connector_not_connected", errorCode: "CONNECTOR_NOT_CONNECTED" };
  }

  // 4. Health verification check
  if (!["connected", "healthy"].includes(connection.status)) {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      connectionId: connection.id,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: { reason: `connector_unhealthy:${connection.status}`, missionId: input.missionId },
    });
    return {
      authorized: false,
      reason: `connector_unhealthy:${connection.status}`,
      errorCode: "CONNECTOR_UNHEALTHY",
    };
  }

  // 5. Connection-level budget check
  if (
    connection.budget_limit_usd !== null &&
    connection.budget_limit_usd !== undefined &&
    connection.current_usage_usd >= connection.budget_limit_usd
  ) {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      connectionId: connection.id,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: {
        reason: "budget_exceeded",
        currentUsage: connection.current_usage_usd,
        budgetLimit: connection.budget_limit_usd,
        missionId: input.missionId,
      },
    });
    return {
      authorized: false,
      reason: "connector_budget_limit_exceeded",
      errorCode: "BUDGET_EXCEEDED",
    };
  }

  // 6. Capability assignment & agent/company isolation lookup
  const { data, error } = await supabase
    .from("connector_capability_assignments")
    .select("*")
    .eq("connection_id", connection.id)
    .eq("capability_key", input.capabilityKey);

  if (error) {
    return { authorized: false, reason: `assignment_lookup_failed:${error.message}`, errorCode: "DATABASE_ERROR" };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    autonomy: ConnectorAutonomy;
    tenant_id: string | null;
    department: string | null;
    agent_definition_id: string | null;
    budget_limit_usd?: number | null;
    current_usage_usd?: number;
    allowed_methods?: ConnectorAccessMethod[] | null;
  }>;

  // Filter matching tenant scope, agent scope, and department scope
  let match = rows.find((r) => {
    const tenantMatches = r.tenant_id === null || r.tenant_id === input.tenantId;
    if (!tenantMatches) return false;

    if (input.agentDefinitionId && r.agent_definition_id) {
      if (r.agent_definition_id !== input.agentDefinitionId) return false;
    }
    if (input.department && r.department) {
      if (r.department !== input.department) return false;
    }
    return true;
  });

  // If no explicit row exists in connector_capability_assignments:
  // For platform-scoped connectors (tenantId === null), default to full autonomy if the capability is in connection.discovered_capabilities or def.declaredCapabilities
  if (!match && rows.length === 0 && def.scopeLevel === "platform" && input.tenantId === null) {
    const discovered = (connection.discovered_capabilities as string[]) ?? [];
    const isDeclared = def.declaredCapabilities.includes(input.capabilityKey) || discovered.includes(input.capabilityKey);
    if (isDeclared) {
      match = {
        id: `auto-${input.capabilityKey}`,
        autonomy: "full" as ConnectorAutonomy,
        tenant_id: null,
        department: null,
        agent_definition_id: null,
        budget_limit_usd: null,
        current_usage_usd: 0,
        allowed_methods: null,
      };
    }
  }

  if (!match) {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      connectionId: connection.id,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: { reason: "capability_not_assigned", missionId: input.missionId },
    });
    return { authorized: false, reason: "capability_not_assigned", errorCode: "CAPABILITY_NOT_ASSIGNED" };
  }

  // 7. Autonomy policy enforcement
  if (match.autonomy === "disabled") {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      connectionId: connection.id,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: { reason: "autonomy_disabled", missionId: input.missionId },
    });
    return { authorized: false, reason: "autonomy_disabled", errorCode: "AUTONOMY_DISABLED" };
  }

  if (match.autonomy === "approval_required") {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      connectionId: connection.id,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: { reason: "autonomy_approval_required", missionId: input.missionId },
    });
    return {
      authorized: false,
      reason: "autonomy_approval_required_not_yet_auto_routed",
      errorCode: "APPROVAL_REQUIRED",
    };
  }

  // 8. Assignment-level budget check
  if (
    match.budget_limit_usd !== null &&
    match.budget_limit_usd !== undefined &&
    typeof match.current_usage_usd === "number" &&
    match.current_usage_usd >= match.budget_limit_usd
  ) {
    await recordConnectorAudit(supabase, {
      connectorKey: input.connectorKey,
      connectionId: connection.id,
      tenantId: input.tenantId,
      actorKind,
      actorId: input.actorId ?? input.agentDefinitionId ?? null,
      eventType: "authorization_denied",
      capabilityKey: input.capabilityKey,
      status: "denied",
      metadata: { reason: "assignment_budget_exceeded", missionId: input.missionId },
    });
    return {
      authorized: false,
      reason: "assignment_budget_limit_exceeded",
      errorCode: "ASSIGNMENT_BUDGET_EXCEEDED",
    };
  }

  // 9. Resolve effective access method (Native > MCP > API > CLI > Browser)
  const effectiveMethod = input.requestedMethod ?? resolvePreferredExecutionMethod(def, match.allowed_methods);

  return {
    authorized: true,
    autonomy: match.autonomy,
    effectiveMethod,
    connectionId: connection.id,
    assignmentId: match.id,
  };
}
