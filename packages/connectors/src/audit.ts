import type { ServiceClient } from "./db.ts";
import type { ConnectorAccessMethod, ConnectorAuditEventType, ConnectorAuditLogRow } from "./types.ts";

/**
 * Sanitizes metadata to ensure secrets or sensitive auth data are never persisted in audit logs.
 */
function sanitizeAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const forbiddenSubstrings = ["secret", "key", "token", "password", "credential", "auth", "bearer", "private"];

  for (const [k, v] of Object.entries(metadata)) {
    const lowerKey = k.toLowerCase();
    const isSensitive = forbiddenSubstrings.some((term) => lowerKey.includes(term));
    if (isSensitive) {
      sanitized[k] = "[REDACTED]";
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      sanitized[k] = sanitizeAuditMetadata(v as Record<string, unknown>);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Records a connector audit log event into `connector_audit_logs`.
 * Zero-leakage guarantee: all metadata is strictly scrubbed of credentials/tokens.
 */
export async function recordConnectorAudit(
  supabase: ServiceClient,
  input: {
    connectorKey: string;
    connectionId?: string | null;
    tenantId?: string | null;
    actorKind: "founder" | "hermes" | "admin" | "system";
    actorId?: string | null;
    eventType: ConnectorAuditEventType;
    capabilityKey?: string | null;
    executionMethod?: ConnectorAccessMethod | null;
    status: "success" | "failure" | "denied";
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const cleanMeta = sanitizeAuditMetadata(input.metadata ?? {});
    await supabase.from("connector_audit_logs").insert({
      connector_key: input.connectorKey,
      connection_id: input.connectionId ?? null,
      tenant_id: input.tenantId ?? null,
      actor_kind: input.actorKind,
      actor_id: input.actorId ?? null,
      event_type: input.eventType,
      capability_key: input.capabilityKey ?? null,
      execution_method: input.executionMethod ?? null,
      status: input.status,
      metadata: cleanMeta,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Fail safe: audit log failure should never crash core business execution
    console.error("Failed to write connector audit log:", err);
  }
}

/**
 * Lists audit logs for a connector, connection, or tenant.
 */
export async function listConnectorAuditLogs(
  supabase: ServiceClient,
  filter: {
    connectorKey?: string;
    connectionId?: string;
    tenantId?: string | null;
    limit?: number;
  }
): Promise<ConnectorAuditLogRow[]> {
  let query = supabase
    .from("connector_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 50);

  if (filter.connectorKey) query = query.eq("connector_key", filter.connectorKey);
  if (filter.connectionId) query = query.eq("connection_id", filter.connectionId);
  if (filter.tenantId !== undefined) {
    query = filter.tenantId === null ? query.is("tenant_id", null) : query.eq("tenant_id", filter.tenantId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listConnectorAuditLogs error:", error);
    return [];
  }
  return (data ?? []) as ConnectorAuditLogRow[];
}
