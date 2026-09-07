import { createDevEncryptedVault } from "@stratxcel/byok";
import type { ServiceClient } from "./db.ts";
import type { ConnectorAutonomy, ConnectorCapabilityAssignmentRow, ConnectorConnectionRow, ConnectorHealthStatus } from "./types.ts";
import { getConnectorDefinition } from "./registry.ts";

/**
 * Stores the raw secret in @stratxcel/byok's real, already-live vault
 * immediately and keeps only the resulting ref -- the plaintext never
 * touches connector_connections, matching tenant_provider_connections'
 * own established convention exactly (see packages/byok/src/repository.ts).
 *
 * A connection row can still be created WITHOUT a secret for any connector
 * (rawSecret: null) -- it exists purely as the real anchor for capability
 * assignments and cached health (Section 29's own example: "AWS: StratXcel
 * / Infrastructure Agent" needs somewhere real to record that assignment
 * even though AWS itself is mcp_managed with no product-stored credential).
 * What this function refuses is a rawSecret for a connector that must never
 * get a second, competing secret store: mcp_managed connectors (aws,
 * browser) and connectors whose real credential already lives in an
 * existing table this control plane deliberately reads instead of
 * duplicating (whatsapp, meta, google_workspace, vercel+company scope).
 */
export async function createConnectorConnection(
  supabase: ServiceClient,
  input: { connectorKey: string; tenantId: string | null; rawSecret: string | null; connectedByUserId: string | null }
): Promise<ConnectorConnectionRow> {
  const def = getConnectorDefinition(input.connectorKey);
  if (!def) throw new Error(`createConnectorConnection: unknown_connector:${input.connectorKey}`);

  const readOnlyAdapterConnectors = new Set(["whatsapp", "meta", "google_workspace"]);
  const secretForbidden = def.authMethod === "mcp_managed" || readOnlyAdapterConnectors.has(input.connectorKey) || (input.connectorKey === "vercel" && Boolean(input.tenantId));
  if (input.rawSecret && secretForbidden) {
    throw new Error(
      `createConnectorConnection: ${input.connectorKey}${input.tenantId ? " (company-scoped)" : ""} must never store a secret here -- ${def.authMethod === "mcp_managed" ? "it is mcp_managed" : "connect it through its own real flow instead"}`
    );
  }

  let ref: string | null = null;
  if (input.rawSecret) {
    const vault = createDevEncryptedVault(supabase as never);
    ref = await vault.store(input.rawSecret);
  }

  const { data, error } = await supabase
    .from("connector_connections")
    .upsert(
      {
        connector_key: input.connectorKey,
        tenant_id: input.tenantId,
        status: "connected",
        encrypted_secret_ref: ref,
        connected_by_user_id: input.connectedByUserId,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connector_key,tenant_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(`createConnectorConnection: ${error.message}`);
  return data as ConnectorConnectionRow;
}

export async function listConnectorConnections(supabase: ServiceClient, tenantId: string | null): Promise<ConnectorConnectionRow[]> {
  let query = supabase.from("connector_connections").select("*").order("created_at", { ascending: false });
  query = tenantId === null ? query.is("tenant_id", null) : query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error) throw new Error(`listConnectorConnections: ${error.message}`);
  return (data ?? []) as ConnectorConnectionRow[];
}

export async function getConnectorConnection(supabase: ServiceClient, connectorKey: string, tenantId: string | null): Promise<ConnectorConnectionRow | null> {
  let query = supabase.from("connector_connections").select("*").eq("connector_key", connectorKey);
  query = tenantId === null ? query.is("tenant_id", null) : query.eq("tenant_id", tenantId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`getConnectorConnection: ${error.message}`);
  return (data as ConnectorConnectionRow) ?? null;
}

export async function updateConnectorHealth(
  supabase: ServiceClient,
  input: { connectionId: string; status: ConnectorHealthStatus; discoveredCapabilities?: string[]; lastError?: string | null }
): Promise<void> {
  const patch: Record<string, unknown> = { status: input.status, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: input.lastError ?? null };
  if (input.discoveredCapabilities) patch.discovered_capabilities = input.discoveredCapabilities;
  const { error } = await supabase.from("connector_connections").update(patch).eq("id", input.connectionId);
  if (error) throw new Error(`updateConnectorHealth: ${error.message}`);
}

export async function setConnectorEnabled(supabase: ServiceClient, connectionId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("connector_connections")
    .update({ status: enabled ? "pending" : "disabled", updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) throw new Error(`setConnectorEnabled: ${error.message}`);
}

/**
 * Revocation removes the vaulted secret entirely (not just a status flag)
 * -- same reasoning as packages/byok/src/repository.ts's
 * revokeProviderConnection: an attacker with later DB access still can't
 * recover a revoked credential, because it no longer exists anywhere.
 */
export async function disconnectConnectorConnection(supabase: ServiceClient, connectionId: string): Promise<void> {
  const { data: connection, error: fetchError } = await supabase.from("connector_connections").select("encrypted_secret_ref").eq("id", connectionId).single();
  if (fetchError) throw new Error(`disconnectConnectorConnection: ${fetchError.message}`);

  const ref = (connection as { encrypted_secret_ref: string | null }).encrypted_secret_ref;
  if (ref) {
    const vault = createDevEncryptedVault(supabase as never);
    await vault.revoke(ref);
  }

  const { error } = await supabase
    .from("connector_connections")
    .update({ status: "disabled", encrypted_secret_ref: null, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
  if (error) throw new Error(`disconnectConnectorConnection: ${error.message}`);
}

/** Retrieves the vaulted secret for internal use only (a real live-health probe, or resolving an
 * effective platform API key) -- callers must never return this value to a browser/chat response. */
export async function retrieveConnectorSecret(supabase: ServiceClient, connectionId: string): Promise<string | null> {
  const { data, error } = await supabase.from("connector_connections").select("encrypted_secret_ref").eq("id", connectionId).maybeSingle();
  if (error) throw new Error(`retrieveConnectorSecret: ${error.message}`);
  const ref = (data as { encrypted_secret_ref: string | null } | null)?.encrypted_secret_ref;
  if (!ref) return null;
  const vault = createDevEncryptedVault(supabase as never);
  return vault.retrieve(ref);
}

export async function createCapabilityAssignment(
  supabase: ServiceClient,
  input: { connectionId: string; capabilityKey: string; tenantId: string | null; department?: string | null; agentDefinitionId?: string | null; autonomy: ConnectorAutonomy }
): Promise<ConnectorCapabilityAssignmentRow> {
  const { data, error } = await supabase
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
  if (error) throw new Error(`createCapabilityAssignment: ${error.message}`);
  return data as ConnectorCapabilityAssignmentRow;
}

export async function listCapabilityAssignments(supabase: ServiceClient, connectionId: string): Promise<ConnectorCapabilityAssignmentRow[]> {
  const { data, error } = await supabase.from("connector_capability_assignments").select("*").eq("connection_id", connectionId).order("created_at", { ascending: false });
  if (error) throw new Error(`listCapabilityAssignments: ${error.message}`);
  return (data ?? []) as ConnectorCapabilityAssignmentRow[];
}

export async function updateCapabilityAssignmentAutonomy(supabase: ServiceClient, assignmentId: string, autonomy: ConnectorAutonomy): Promise<ConnectorCapabilityAssignmentRow> {
  const { data, error } = await supabase
    .from("connector_capability_assignments")
    .update({ autonomy, updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .select("*")
    .single();
  if (error) throw new Error(`updateCapabilityAssignmentAutonomy: ${error.message}`);
  return data as ConnectorCapabilityAssignmentRow;
}

export async function deleteCapabilityAssignment(supabase: ServiceClient, assignmentId: string): Promise<void> {
  const { error } = await supabase.from("connector_capability_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(`deleteCapabilityAssignment: ${error.message}`);
}
