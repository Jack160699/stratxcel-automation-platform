import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  listConnectorDefinitions,
  getConnectorConnection,
  resolveConnectorHealth,
  type ConnectorDefinition,
  type ConnectorHealthResult,
} from "@stratxcel/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Personal connectors ordered as specified in Founder Architecture (Section 14)
// Google AI Pro is strictly the FIRST premier card.
const PERSONAL_CONNECTOR_KEYS_ORDER = [
  "google_ai_pro", // Premier Founder AI Subscription
  "gemini",        // Founder AI
  "claude",        // Founder AI
  "openrouter",    // Founder AI
  "github",        // Developer
  "vercel",        // Developer
  "supabase",      // Developer
  "aws",           // Developer / Sandbox
  "whatsapp",      // Communication
  "telegram",      // Communication
  "meta",          // Communication
  "apollo",        // Research & Sales
  "google",        // Research & Sales / Services
  "s3",            // Storage
  "payments",      // Payments (Razorpay / Stripe)
  "browser",       // Browser / Computer
] as const;

const PERSONAL_CATEGORIES: Record<string, string> = {
  google_ai_pro: "ai",
  gemini: "ai",
  claude: "ai",
  openrouter: "ai",
  github: "developer",
  vercel: "developer",
  supabase: "developer",
  aws: "developer",
  whatsapp: "communication",
  telegram: "communication",
  meta: "communication",
  apollo: "research",
  google: "research",
  s3: "storage",
  payments: "payments",
  browser: "browser",
};

/**
 * GET /api/platform/admin/personal-connectors
 * Dedicated endpoint for Founder Personal Connectors.
 * Returns personal connections (scoped strictly to Founder / tenantId=null),
 * real computed health checks, and verified capabilities.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { supabase } = getTenantServiceContext();
  const allDefinitions = listConnectorDefinitions();
  const defMap = new Map<string, ConnectorDefinition>(allDefinitions.map((d) => [d.key, d]));

  const rows = await Promise.all(
    PERSONAL_CONNECTOR_KEYS_ORDER.map(async (key) => {
      const def = defMap.get(key);
      if (!def) return null;

      // Personal connectors operate in the Founder's personal scope (tenantId = null)
      let connection = null;
      let health: ConnectorHealthResult = {
        status: "auth_required",
        discoveredCapabilities: [],
        lastError: "Authentication required to connect.",
        lastVerifiedAt: null,
      };

      try {
        connection = await getConnectorConnection(supabase as never, key, null);
        health = await resolveConnectorHealth(supabase as never, key, connection, null);
      } catch (err) {
        console.warn(`[personal-connectors] DB query fallback for ${key}:`, (err as Error).message);
      }

      const personalCategory = PERSONAL_CATEGORIES[key] ?? def.category;

      return {
        definition: {
          ...def,
          category: personalCategory,
          isPersonal: true,
        },
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

  const nonNullRows = rows.filter(Boolean);

  // Compute summary metrics
  const totalPersonalConnectors = nonNullRows.length;
  const connectedCount = nonNullRows.filter((r) => r && ["connected", "healthy"].includes(r.health.status)).length;
  const actionRequiredCount = nonNullRows.filter(
    (r) => r && ["auth_required", "auth_expired", "requires_reauth"].includes(r.health.status)
  ).length;
  const healthyCount = nonNullRows.filter((r) => r && r.health.status === "healthy").length;
  const degradedCount = nonNullRows.filter(
    (r) => r && ["degraded", "rate_limited", "quota_exhausted", "error"].includes(r.health.status)
  ).length;

  const verifiedTimestamps = nonNullRows
    .map((r) => r?.connection?.lastVerifiedAt || r?.health.lastVerifiedAt)
    .filter(Boolean) as string[];

  const lastGlobalVerifiedAt =
    verifiedTimestamps.length > 0
      ? verifiedTimestamps.sort().reverse()[0]
      : null;

  const allCapabilities = new Set<string>();
  for (const r of nonNullRows) {
    if (r) {
      r.health.discoveredCapabilities.forEach((c) => allCapabilities.add(c));
    }
  }

  return Response.json({
    connectors: nonNullRows,
    summary: {
      totalPersonalConnectors,
      connectedCount,
      actionRequiredCount,
      healthyCount,
      degradedCount,
      founderEmail: admin.email,
      lastGlobalVerifiedAt,
      verifiedCapabilitiesCount: allCapabilities.size,
    },
  });
}
