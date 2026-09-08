import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  listConnectorDefinitions,
  getConnectorConnection,
  resolveConnectorHealth,
  type ConnectorHealthResult,
} from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/admin/connectors?tenantId=<id>
 *
 * The real Admin > Connectors list: every catalogue entry paired with its
 * real connection row (if any) and a freshly computed real health check --
 * never a cached/fabricated status. Omit tenantId for the platform-scoped
 * view (StratXcel's own AWS/GitHub/Supabase/OpenRouter/Gemini/browser);
 * pass a tenantId for a company's own view (vercel/whatsapp/meta/
 * google_workspace).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  const { supabase } = getTenantServiceContext();

  const definitions = listConnectorDefinitions();
  const rows = await Promise.all(
    definitions.map(async (def) => {
      const scopedTenantId = def.scopeLevel === "platform" ? null : tenantId;
      let connection = null;
      let health: ConnectorHealthResult = {
        status: "auth_required",
        discoveredCapabilities: [],
        lastError: "Authentication required to connect.",
        lastVerifiedAt: null,
      };

      try {
        connection = await getConnectorConnection(supabase as never, def.key, scopedTenantId);
        health = await resolveConnectorHealth(supabase as never, def.key, connection, scopedTenantId);
      } catch (err) {
        console.warn(`[connectors] DB query fallback for ${def.key}:`, (err as Error).message);
      }
      return {
        definition: def,
        connection: connection
          ? {
              id: connection.id,
              status: health.status,
              connectedAt: connection.connected_at,
              lastHealthCheckAt: connection.last_health_check_at,
              lastVerifiedAt: connection.last_verified_at ?? health.lastVerifiedAt ?? null,
              discoveredAt: connection.discovered_at ?? null,
              budgetLimitUsd: connection.budget_limit_usd ?? null,
              currentUsageUsd: connection.current_usage_usd ?? 0,
              rateLimitPerMinute: connection.rate_limit_per_minute ?? null,
              metadata: (connection.metadata as Record<string, unknown> | null) ?? null,
            }
          : null,
        health,
      };
    })
  );

  return Response.json({ connectors: rows });
}
