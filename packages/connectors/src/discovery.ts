import type { ServiceClient } from "./db.ts";
import { getConnectorDefinition } from "./registry.ts";
import { resolveConnectorHealth } from "./health.ts";
import { getConnectorConnection, updateConnectorHealth } from "./repository.ts";
import { recordConnectorAudit } from "./audit.ts";

export interface DiscoveredCapabilityDetail {
  key: string;
  label: string;
  category: string;
  source: string;
  discoveredAt: string;
}

/**
 * Normalizes and validates discovered capability strings against known taxonomy.
 */
export function normalizeCapabilities(rawCapabilities: string[]): string[] {
  const set = new Set<string>();
  for (const cap of rawCapabilities) {
    const trimmed = cap.trim().toLowerCase();
    if (trimmed.length > 0) {
      set.add(trimmed);
    }
  }
  return Array.from(set).sort();
}

/**
 * Live inspects what capabilities a connected connector actually exposes,
 * normalizes them, updates the database connection row with discovered_capabilities
 * and discovered_at timestamp, and records an audit event.
 */
export async function discoverConnectorCapabilities(
  supabase: ServiceClient,
  input: {
    connectionId: string;
    connectorKey: string;
    tenantId: string | null;
    actorKind?: "founder" | "admin" | "hermes" | "system";
    actorId?: string | null;
  }
): Promise<{
  connectorKey: string;
  discoveredCapabilities: string[];
  discoveredAt: string;
  status: string;
}> {
  const def = getConnectorDefinition(input.connectorKey);
  if (!def) throw new Error(`discoverConnectorCapabilities: unknown connector ${input.connectorKey}`);

  const connection = await getConnectorConnection(supabase, input.connectorKey, input.tenantId);
  const health = await resolveConnectorHealth(supabase, input.connectorKey, connection, input.tenantId);

  const normalized = normalizeCapabilities(health.discoveredCapabilities);
  const discoveredAt = new Date().toISOString();

  await updateConnectorHealth(supabase, {
    connectionId: input.connectionId,
    status: health.status,
    discoveredCapabilities: normalized,
    lastError: health.lastError,
    discoveredAt,
    metadata: health.details,
  });

  await recordConnectorAudit(supabase, {
    connectorKey: input.connectorKey,
    connectionId: input.connectionId,
    tenantId: input.tenantId,
    actorKind: input.actorKind ?? "system",
    actorId: input.actorId ?? null,
    eventType: "capability_discovered",
    status: "success",
    metadata: {
      discoveredCount: normalized.length,
      capabilities: normalized,
    },
  });

  return {
    connectorKey: input.connectorKey,
    discoveredCapabilities: normalized,
    discoveredAt,
    status: health.status,
  };
}
