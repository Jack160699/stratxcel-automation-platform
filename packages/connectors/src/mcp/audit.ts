import type { McpToolAuditRecord } from "./types.ts";

export interface McpAuditRecorderClient {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

/**
 * Records an immutable audit log entry for every MCP tool invocation.
 * Zero secret or credential exposure.
 */
export async function recordMcpToolAudit(
  client: McpAuditRecorderClient | null,
  record: Omit<McpToolAuditRecord, "id" | "timestampIso">
): Promise<McpToolAuditRecord> {
  const fullRecord: McpToolAuditRecord = {
    ...record,
    id: `mcp-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestampIso: new Date().toISOString(),
  };

  if (client) {
    try {
      await client.from("audit_events").insert({
        actor_kind: fullRecord.actorKind,
        action: `mcp.tool_call.${fullRecord.toolName}`,
        target_type: "mcp_server",
        target_id: fullRecord.mcpId,
        tenant_id: fullRecord.tenantId,
        metadata: {
          provider: fullRecord.provider,
          environment: fullRecord.environment,
          status: fullRecord.status,
          confirmationReceived: fullRecord.confirmationReceived,
          durationMs: fullRecord.durationMs,
          missionId: fullRecord.missionId,
          error: fullRecord.error ?? null,
        },
      });
    } catch {
      // Audit recording must never throw to fail the primary caller
    }
  }

  return fullRecord;
}
