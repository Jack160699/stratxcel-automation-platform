import { requireAdmin } from "@/lib/social/admin-guard";
import {
  CANONICAL_MCP_REGISTRY,
  CANONICAL_PROVIDER_MAPPINGS,
  REMOTE_BRIDGE_SPECIFICATIONS,
  CORE_SIX_FLEET,
  type McpServerDefinition,
} from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/admin/mcps
 *
 * Exposes the canonical MCP Registry, multi-layer provider mappings, and
 * remote bridge specifications across Windows, AWS Linux, and Vercel environments.
 * Explicitly distinguishes Native Service Connectors vs. MCP Servers.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return Response.json({ error: admin.error }, { status: admin.status });
  }

  const mcps = CANONICAL_MCP_REGISTRY;

  const total = mcps.length;
  const verified = mcps.filter((m) => m.status === "healthy" || m.status === "authorized").length;
  const authRequired = mcps.filter((m) => m.status === "auth_required").length;
  const noNativeMcp = mcps.filter((m) => m.classification === "no_native_mcp").length;

  const environmentCounts = {
    WINDOWS: mcps.filter((m) => m.executionEnvironment === "windows").length,
    AWS_LINUX: mcps.filter((m) => m.executionEnvironment === "aws_linux").length,
    MULTI_ENVIRONMENT: mcps.filter((m) => m.executionEnvironment === "multi_environment").length,
    REMOTE: mcps.filter((m) => m.executionEnvironment === "remote").length,
  };

  const transportCounts = {
    stdio: mcps.filter((m) => m.transport === "stdio").length,
    streamable_http: mcps.filter((m) => m.transport === "streamable_http").length,
    sse: mcps.filter((m) => m.transport === "sse").length,
    websocket: mcps.filter((m) => m.transport === "websocket").length,
  };

  return Response.json({
    ok: true,
    mcps,
    coreFleet: CORE_SIX_FLEET,
    providerMappings: CANONICAL_PROVIDER_MAPPINGS,
    bridges: REMOTE_BRIDGE_SPECIFICATIONS,
    summary: {
      total,
      verified,
      authRequired,
      noNativeMcp,
      environmentCounts,
      transportCounts,
    },
  });
}
