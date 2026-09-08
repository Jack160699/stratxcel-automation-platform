import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  getConnectorConnection,
  updateConnectorHealth,
  recordConnectorAudit,
} from "@stratxcel/connectors";
import {
  parseFounderComputerSession,
  discoverFounderComputerCapabilities,
  toDiscoveredCapabilityKeys,
} from "@/lib/founder-computer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/personal-connectors/founder-computer/capabilities
 * Discovers and classifies capabilities reachable through the Founder Computer session.
 * Updates the connector_connections row with discovered capabilities.
 * Honest discovery: does not fabricate availability if the session is not authenticated.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();
  const connection = await getConnectorConnection(supabase as never, "founder_computer", null);

  if (!connection) {
    return NextResponse.json(
      {
        error: "Founder Computer is not configured. Run setup first.",
        status: "not_configured",
        capabilities: discoverFounderComputerCapabilities(null),
      },
      { status: 404 }
    );
  }

  const session = parseFounderComputerSession(connection.metadata as Record<string, unknown> | null);
  const capabilityEntries = discoverFounderComputerCapabilities(session);
  const discoveredKeys = toDiscoveredCapabilityKeys(capabilityEntries);

  // Update discovered capabilities on the connector connection
  await updateConnectorHealth(supabase as never, {
    connectionId: connection.id,
    status: connection.status,
    discoveredCapabilities: discoveredKeys,
    lastError: null,
    lastVerifiedAt: connection.last_verified_at,
    metadata: {
      ...((connection.metadata as Record<string, unknown>) ?? {}),
      lastCapabilitiesDiscoveredAt: new Date().toISOString(),
      discoveredCount: discoveredKeys.length,
    },
  });

  await recordConnectorAudit(supabase as never, {
    connectionId: connection.id,
    connectorKey: "founder_computer",
    tenantId: null,
    actorId: admin.userId ?? null,
    actorKind: "founder",
    eventType: "capability_discovered",
    status: "success",
    metadata: {
      discoveredKeys,
      authenticatedDomains: session?.authenticatedDomains ?? [],
      sessionStatus: session?.status ?? "unknown",
    },
  });

  return NextResponse.json({
    connectionId: connection.id,
    sessionStatus: session?.status ?? "unknown",
    authenticatedDomains: session?.authenticatedDomains ?? [],
    capabilities: capabilityEntries,
    discoveredKeys,
    totalDiscovered: discoveredKeys.length,
    discoveredAt: new Date().toISOString(),
  });
}

/**
 * GET /api/admin/personal-connectors/founder-computer/capabilities
 * Reads current capabilities without triggering a state update.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { supabase } = getTenantServiceContext();
  const connection = await getConnectorConnection(supabase as never, "founder_computer", null);

  const session = connection
    ? parseFounderComputerSession(connection.metadata as Record<string, unknown> | null)
    : null;

  const capabilityEntries = discoverFounderComputerCapabilities(session);
  const discoveredKeys = toDiscoveredCapabilityKeys(capabilityEntries);

  return NextResponse.json({
    connectionId: connection?.id ?? null,
    sessionStatus: session?.status ?? "not_configured",
    authenticatedDomains: session?.authenticatedDomains ?? [],
    capabilities: capabilityEntries,
    discoveredKeys,
    totalDiscovered: discoveredKeys.length,
  });
}
