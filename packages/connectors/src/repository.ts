import { createDevEncryptedVault } from "@stratxcel/byok";
import type { ServiceClient } from "./db.ts";
import type {
  ConnectorAccessMethod,
  ConnectorAutonomy,
  ConnectorCapabilityAssignmentRow,
  ConnectorConnectionRow,
  ConnectorHealthStatus,
} from "./types.ts";
import { getConnectorDefinition } from "./registry.ts";
import { recordConnectorAudit } from "./audit.ts";

function isMissingColumnError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("could not find")
  );
}

/**
 * Stores raw secrets in the AES-256-GCM vault from @stratxcel/byok.
 * Refuses plaintext secrets for mcp_managed connectors or existing read-only adapter tables.
 */
export async function createConnectorConnection(
  supabase: ServiceClient,
  input: {
    connectorKey: string;
    tenantId: string | null;
    rawSecret: string | null;
    connectedByUserId: string | null;
    budgetLimitUsd?: number | null;
    rateLimitPerMinute?: number | null;
    metadata?: Record<string, unknown>;
  }
): Promise<ConnectorConnectionRow> {
  const def = getConnectorDefinition(input.connectorKey);
  if (!def) throw new Error(`createConnectorConnection: unknown_connector:${input.connectorKey}`);

  const readOnlyAdapterConnectors = new Set(["whatsapp", "meta", "google_workspace"]);
  const secretForbidden =
    def.authMethod === "mcp_managed" ||
    readOnlyAdapterConnectors.has(input.connectorKey) ||
    (input.connectorKey === "vercel" && Boolean(input.tenantId));

  if (input.rawSecret && secretForbidden) {
    throw new Error(
      `createConnectorConnection: ${input.connectorKey}${input.tenantId ? " (company-scoped)" : ""} must never store a secret here -- ${
        def.authMethod === "mcp_managed" ? "it is mcp_managed" : "connect it through its own real flow instead"
      }`
    );
  }

  let ref: string | null = null;
  if (input.rawSecret) {
    const vault = createDevEncryptedVault(supabase as never);
    ref = await vault.store(input.rawSecret);
  }

  const now = new Date().toISOString();
  const upsertPayload: Record<string, unknown> = {
    connector_key: input.connectorKey,
    tenant_id: input.tenantId,
    status: "connected",
    encrypted_secret_ref: ref,
    connected_by_user_id: input.connectedByUserId,
    connected_at: now,
    updated_at: now,
  };

  if (input.budgetLimitUsd !== undefined) upsertPayload.budget_limit_usd = input.budgetLimitUsd;
  if (input.rateLimitPerMinute !== undefined) upsertPayload.rate_limit_per_minute = input.rateLimitPerMinute;
  if (input.metadata !== undefined) upsertPayload.metadata = input.metadata;

  // Check if an existing row already exists to avoid onConflict issues with NULL tenant_id
  let existingQuery = supabase.from("connector_connections").select("id").eq("connector_key", input.connectorKey);
  existingQuery = input.tenantId === null ? existingQuery.is("tenant_id", null) : existingQuery.eq("tenant_id", input.tenantId);
  const { data: existingRow } = await existingQuery.maybeSingle();

  let res;
  if (existingRow?.id) {
    res = await supabase.from("connector_connections").update(upsertPayload).eq("id", existingRow.id).select("*").single();
  } else {
    res = await supabase.from("connector_connections").insert(upsertPayload).select("*").single();
  }

  if (res.error) {
    // If column doesn't exist in postgres (code 42703 or PGRST204), strip extended columns and encode metadata into encrypted_secret_ref
    if (isMissingColumnError(res.error)) {
      const fallbackPayload = { ...upsertPayload };
      if (fallbackPayload.metadata && !fallbackPayload.encrypted_secret_ref) {
        fallbackPayload.encrypted_secret_ref = "fc-meta:" + JSON.stringify(fallbackPayload.metadata);
      }
      delete fallbackPayload.metadata;
      delete fallbackPayload.budget_limit_usd;
      delete fallbackPayload.rate_limit_per_minute;
      delete fallbackPayload.last_verified_at;
      delete fallbackPayload.discovered_at;

      if (existingRow?.id) {
        res = await supabase.from("connector_connections").update(fallbackPayload).eq("id", existingRow.id).select("*").single();
      } else {
        res = await supabase.from("connector_connections").insert(fallbackPayload).select("*").single();
      }
    }
  }

  if (res.error) throw new Error(`createConnectorConnection: ${res.error.message}`);
  const row = normalizeConnectionRow(res.data as ConnectorConnectionRow);
  if (!row) throw new Error("createConnectorConnection: failed to insert or normalize connection row");

  await recordConnectorAudit(supabase, {
    connectorKey: input.connectorKey,
    connectionId: row.id,
    tenantId: input.tenantId,
    actorKind: input.connectedByUserId ? "founder" : "system",
    actorId: input.connectedByUserId,
    eventType: "connected",
    status: "success",
    metadata: { scope: input.tenantId ? "company" : "platform" },
  });

  return row;
}

function normalizeConnectionRow(row: ConnectorConnectionRow | null): ConnectorConnectionRow | null {
  if (!row) return null;
  let meta = (row as any).metadata;
  if ((!meta || Object.keys(meta).length === 0) && typeof row.encrypted_secret_ref === "string") {
    for (const prefix of ["fc-meta:", "aws-meta:", "meta:"]) {
      if (row.encrypted_secret_ref.startsWith(prefix)) {
        try {
          meta = JSON.parse(row.encrypted_secret_ref.slice(prefix.length));
          break;
        } catch {}
      }
    }
  }
  return {
    ...row,
    metadata: meta || {},
  };
}

export async function listConnectorConnections(
  supabase: ServiceClient,
  tenantId: string | null
): Promise<ConnectorConnectionRow[]> {
  let query = supabase.from("connector_connections").select("*").order("created_at", { ascending: false });
  query = tenantId === null ? query.is("tenant_id", null) : query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error) throw new Error(`listConnectorConnections: ${error.message}`);
  return ((data ?? []) as ConnectorConnectionRow[]).map(normalizeConnectionRow) as ConnectorConnectionRow[];
}

export async function getConnectorConnection(
  supabase: ServiceClient,
  connectorKey: string,
  tenantId: string | null
): Promise<ConnectorConnectionRow | null> {
  let query = supabase.from("connector_connections").select("*").eq("connector_key", connectorKey);
  query = tenantId === null ? query.is("tenant_id", null) : query.eq("tenant_id", tenantId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`getConnectorConnection: ${error.message}`);
  if (!data && tenantId !== null) {
    const def = getConnectorDefinition(connectorKey);
    if (def?.scopeLevel === "platform" || def?.scopeLevel === "both" || connectorKey === "founder_computer") {
      const { data: platformData } = await supabase
        .from("connector_connections")
        .select("*")
        .eq("connector_key", connectorKey)
        .is("tenant_id", null)
        .maybeSingle();
      if (platformData) {
        return normalizeConnectionRow(platformData as ConnectorConnectionRow);
      }
    }
  }
  return normalizeConnectionRow((data as ConnectorConnectionRow) ?? null);
}

export async function updateConnectorHealth(
  supabase: ServiceClient,
  input: {
    connectionId: string;
    status: ConnectorHealthStatus;
    discoveredCapabilities?: string[];
    lastError?: string | null;
    lastVerifiedAt?: string | null;
    discoveredAt?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  // Check if status is within Postgres check constraint
  const allowedConstraintStatuses = new Set([
    "pending", "connected", "healthy", "auth_expired", "rate_limited",
    "quota_exhausted", "error", "disabled", "requires_reauth"
  ]);
  const dbStatus = allowedConstraintStatuses.has(input.status) ? input.status : "connected";

  const patch: Record<string, unknown> = {
    status: dbStatus,
    last_health_check_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_error: input.lastError ?? null,
  };
  if (input.discoveredCapabilities) patch.discovered_capabilities = input.discoveredCapabilities;
  if (input.lastVerifiedAt !== undefined) patch.last_verified_at = input.lastVerifiedAt;
  if (input.discoveredAt !== undefined) patch.discovered_at = input.discoveredAt;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  let res = await supabase.from("connector_connections").update(patch).eq("id", input.connectionId);
  if (res.error && isMissingColumnError(res.error)) {
    // If extended columns don't exist in DB schema, strip them and store metadata in encrypted_secret_ref fallback
    const fallbackPatch = { ...patch };
    if (fallbackPatch.metadata) {
      fallbackPatch.encrypted_secret_ref = "fc-meta:" + JSON.stringify(fallbackPatch.metadata);
    }
    delete fallbackPatch.metadata;
    delete fallbackPatch.last_verified_at;
    delete fallbackPatch.discovered_at;
    delete fallbackPatch.budget_limit_usd;
    delete fallbackPatch.rate_limit_per_minute;
    res = await supabase.from("connector_connections").update(fallbackPatch).eq("id", input.connectionId);
  }
  if (res.error) throw new Error(`updateConnectorHealth: ${res.error.message}`);
}

export async function updateConnectorConnectionMetadata(
  supabase: ServiceClient,
  connectionId: string,
  metadata: Record<string, unknown>,
  extraPatch?: Record<string, unknown>
): Promise<void> {
  const allowedConstraintStatuses = new Set([
    "pending", "connected", "healthy", "auth_expired", "rate_limited",
    "quota_exhausted", "error", "disabled", "requires_reauth"
  ]);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    metadata,
    ...extraPatch,
  };

  if (patch.status && typeof patch.status === "string" && !allowedConstraintStatuses.has(patch.status)) {
    // Map non-DB constraint statuses (e.g. auth_required, ready)
    patch.status = patch.status === "ready" ? "healthy" : "connected";
  }

  let res = await supabase.from("connector_connections").update(patch).eq("id", connectionId);
  if (res.error && isMissingColumnError(res.error)) {
    const fallbackPatch = { ...patch };
    if (fallbackPatch.metadata) {
      fallbackPatch.encrypted_secret_ref = "fc-meta:" + JSON.stringify(fallbackPatch.metadata);
    }
    delete fallbackPatch.metadata;
    delete fallbackPatch.last_verified_at;
    delete fallbackPatch.discovered_at;
    delete fallbackPatch.budget_limit_usd;
    delete fallbackPatch.rate_limit_per_minute;
    res = await supabase.from("connector_connections").update(fallbackPatch).eq("id", connectionId);
  }
  if (res.error) throw new Error(`updateConnectorConnectionMetadata: ${res.error.message}`);
}


export async function updateConnectorBudgetAndUsage(
  supabase: ServiceClient,
  connectionId: string,
  input: {
    budgetLimitUsd?: number | null;
    currentUsageUsd?: number;
    incrementUsageUsd?: number;
    rateLimitPerMinute?: number | null;
  }
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.budgetLimitUsd !== undefined) patch.budget_limit_usd = input.budgetLimitUsd;
  if (input.rateLimitPerMinute !== undefined) patch.rate_limit_per_minute = input.rateLimitPerMinute;

  if (input.currentUsageUsd !== undefined) {
    patch.current_usage_usd = input.currentUsageUsd;
  } else if (input.incrementUsageUsd) {
    const { data } = await supabase.from("connector_connections").select("current_usage_usd").eq("id", connectionId).single();
    const current = (data as { current_usage_usd: number | null } | null)?.current_usage_usd ?? 0;
    patch.current_usage_usd = current + input.incrementUsageUsd;
  }

  const { error } = await supabase.from("connector_connections").update(patch).eq("id", connectionId);
  if (error && !isMissingColumnError(error)) throw new Error(`updateConnectorBudgetAndUsage: ${error.message}`);
}

export async function setConnectorEnabled(supabase: ServiceClient, connectionId: string, enabled: boolean): Promise<void> {
  const { data: conn } = await supabase.from("connector_connections").select("connector_key, tenant_id").eq("id", connectionId).single();

  const { error } = await supabase
    .from("connector_connections")
    .update({ status: enabled ? "pending" : "disabled", updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) throw new Error(`setConnectorEnabled: ${error.message}`);

  if (conn) {
    const c = conn as { connector_key: string; tenant_id: string | null };
    await recordConnectorAudit(supabase, {
      connectorKey: c.connector_key,
      connectionId,
      tenantId: c.tenant_id,
      actorKind: "admin",
      eventType: enabled ? "enabled" : "disabled",
      status: "success",
    });
  }
}

export async function disconnectConnectorConnection(supabase: ServiceClient, connectionId: string): Promise<void> {
  const { data: connection, error: fetchError } = await supabase
    .from("connector_connections")
    .select("connector_key, tenant_id, encrypted_secret_ref")
    .eq("id", connectionId)
    .single();
  if (fetchError) throw new Error(`disconnectConnectorConnection: ${fetchError.message}`);

  const row = connection as { connector_key: string; tenant_id: string | null; encrypted_secret_ref: string | null };
  if (row.encrypted_secret_ref) {
    const vault = createDevEncryptedVault(supabase as never);
    await vault.revoke(row.encrypted_secret_ref);
  }

  const { error } = await supabase
    .from("connector_connections")
    .update({ status: "disabled", encrypted_secret_ref: null, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) throw new Error(`disconnectConnectorConnection: ${error.message}`);

  await recordConnectorAudit(supabase, {
    connectorKey: row.connector_key,
    connectionId,
    tenantId: row.tenant_id,
    actorKind: "admin",
    eventType: "disconnected",
    status: "success",
  });
}

export async function retrieveConnectorSecret(supabase: ServiceClient, connectionId: string): Promise<string | null> {
  const { data, error } = await supabase.from("connector_connections").select("encrypted_secret_ref").eq("id", connectionId).maybeSingle();
  if (error) throw new Error(`retrieveConnectorSecret: ${error.message}`);
  const ref = (data as { encrypted_secret_ref: string | null } | null)?.encrypted_secret_ref;
  if (!ref) return null;
  if (ref.startsWith("meta:") || ref.startsWith("fc-meta:") || ref.startsWith("aws-meta:")) {
    return null;
  }
  try {
    const vault = createDevEncryptedVault(supabase as never);
    return await vault.retrieve(ref);
  } catch {
    return null;
  }
}

export async function createCapabilityAssignment(
  supabase: ServiceClient,
  input: {
    connectionId: string;
    capabilityKey: string;
    tenantId: string | null;
    department?: string | null;
    agentDefinitionId?: string | null;
    autonomy: ConnectorAutonomy;
    budgetLimitUsd?: number | null;
    allowedMethods?: ConnectorAccessMethod[] | null;
  }
): Promise<ConnectorCapabilityAssignmentRow> {
  let insertRes = await supabase
    .from("connector_capability_assignments")
    .insert({
      connection_id: input.connectionId,
      capability_key: input.capabilityKey,
      tenant_id: input.tenantId,
      department: input.department ?? null,
      agent_definition_id: input.agentDefinitionId ?? null,
      autonomy: input.autonomy,
      budget_limit_usd: input.budgetLimitUsd ?? null,
      current_usage_usd: 0,
      allowed_methods: input.allowedMethods ?? null,
    })
    .select("*")
    .single();

  if (insertRes.error && isMissingColumnError(insertRes.error)) {
    insertRes = await supabase
      .from("connector_capability_assignments")
      .insert({
        connection_id: input.connectionId,
        capability_key: input.capabilityKey,
        tenant_id: input.tenantId,
        department: input.department ?? null,
        agent_definition_id: input.agentDefinitionId ?? null,
        autonomy: input.autonomy,
      })
      .select("*")
      .single();
  }

  if (insertRes.error) throw new Error(`createCapabilityAssignment: ${insertRes.error.message}`);
  const row = insertRes.data as ConnectorCapabilityAssignmentRow;
  await recordConnectorAudit(supabase, {
    connectorKey: "capability_assignment",
    connectionId: input.connectionId,
    tenantId: input.tenantId,
    actorKind: "admin",
    eventType: "permission_changed",
    capabilityKey: input.capabilityKey,
    status: "success",
    metadata: {
      autonomy: input.autonomy,
      department: input.department ?? null,
      agentDefinitionId: input.agentDefinitionId ?? null,
    },
  });

  return row;
}

export async function listCapabilityAssignments(
  supabase: ServiceClient,
  connectionId: string
): Promise<ConnectorCapabilityAssignmentRow[]> {
  const { data, error } = await supabase
    .from("connector_capability_assignments")
    .select("*")
    .eq("connection_id", connectionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listCapabilityAssignments: ${error.message}`);
  return (data ?? []) as ConnectorCapabilityAssignmentRow[];
}

export async function updateCapabilityAssignmentAutonomy(
  supabase: ServiceClient,
  assignmentId: string,
  autonomy: ConnectorAutonomy
): Promise<ConnectorCapabilityAssignmentRow> {
  const { data, error } = await supabase
    .from("connector_capability_assignments")
    .update({ autonomy, updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .select("*")
    .single();
  if (error) throw new Error(`updateCapabilityAssignmentAutonomy: ${error.message}`);

  const row = data as ConnectorCapabilityAssignmentRow;
  await recordConnectorAudit(supabase, {
    connectorKey: "capability_assignment",
    connectionId: row.connection_id,
    tenantId: row.tenant_id,
    actorKind: "admin",
    eventType: "permission_changed",
    capabilityKey: row.capability_key,
    status: "success",
    metadata: { autonomy },
  });

  return row;
}

export async function deleteCapabilityAssignment(supabase: ServiceClient, assignmentId: string): Promise<void> {
  const { data: assignment } = await supabase
    .from("connector_capability_assignments")
    .select("connection_id, capability_key, tenant_id")
    .eq("id", assignmentId)
    .single();

  const { error } = await supabase.from("connector_capability_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(`deleteCapabilityAssignment: ${error.message}`);

  if (assignment) {
    const a = assignment as { connection_id: string; capability_key: string; tenant_id: string | null };
    await recordConnectorAudit(supabase, {
      connectorKey: "capability_assignment",
      connectionId: a.connection_id,
      tenantId: a.tenant_id,
      actorKind: "admin",
      eventType: "permission_changed",
      capabilityKey: a.capability_key,
      status: "success",
      metadata: { deleted: true },
    });
  }
}
