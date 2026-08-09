import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createDevEncryptedVault } from "@stratxcel/byok";
import {
  getGoogleConnection,
  getLiveGoogleAccessToken,
  listSearchConsoleSites,
  listGa4Properties,
  updateGoogleConnectionConfig,
  GoogleNotConnectedError,
  GooglePermissionLostError,
} from "@stratxcel/search-discovery";
import { recordAuditEvent } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConfigBody {
  tenantId?: string;
  searchConsoleSiteUrl?: string | null;
  ga4PropertyId?: string | null;
  ga4PropertyDisplayName?: string | null;
}

/**
 * POST/PATCH /api/platform/search/google/config
 * Persists which Search Console property and/or GA4 property this tenant's
 * connected Google account should read from. Re-verifies each requested
 * property against a live list from Google before saving — a tenant client
 * cannot set a property the connected Google account does not actually
 * have access to, even though a mismatch would only ever surface as a
 * truthful permission_required on the next read (defense in depth, not the
 * only backstop).
 */
async function handle(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ConfigBody;
  if (!body.tenantId) return Response.json({ error: "SEARCH_INVALID_REQUEST" }, { status: 400 });

  const ctx = await requireTenantContext(body.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const connection = await getGoogleConnection(supabase, body.tenantId);
  if (!connection || connection.status !== "connected") {
    return Response.json({ error: "SEARCH_GOOGLE_NOT_CONNECTED" }, { status: 409 });
  }

  const vault = createDevEncryptedVault(supabase);
  let accessToken: string;
  try {
    accessToken = await getLiveGoogleAccessToken(supabase, vault, body.tenantId);
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return Response.json({ error: "SEARCH_GOOGLE_NOT_CONNECTED" }, { status: 409 });
    if (err instanceof GooglePermissionLostError) return Response.json({ error: "SEARCH_GOOGLE_PERMISSION_REQUIRED" }, { status: 409 });
    return Response.json({ error: "SEARCH_GOOGLE_TOKEN_FAILED" }, { status: 502 });
  }

  const patch: { searchConsoleSiteUrl?: string | null; ga4PropertyId?: string | null; ga4PropertyDisplayName?: string | null } = {};

  if (body.searchConsoleSiteUrl !== undefined) {
    if (body.searchConsoleSiteUrl === null) {
      patch.searchConsoleSiteUrl = null;
    } else {
      const sites = await listSearchConsoleSites(accessToken).catch(() => []);
      if (!sites.some((s) => s.siteUrl === body.searchConsoleSiteUrl)) {
        return Response.json({ error: "SEARCH_CONSOLE_PROPERTY_NOT_AUTHORIZED" }, { status: 422 });
      }
      patch.searchConsoleSiteUrl = body.searchConsoleSiteUrl;
    }
  }

  if (body.ga4PropertyId !== undefined) {
    if (body.ga4PropertyId === null) {
      patch.ga4PropertyId = null;
      patch.ga4PropertyDisplayName = null;
    } else {
      const properties = await listGa4Properties(accessToken).catch(() => []);
      const match = properties.find((p) => p.propertyId === body.ga4PropertyId);
      if (!match) return Response.json({ error: "GA4_PROPERTY_NOT_AUTHORIZED" }, { status: 422 });
      patch.ga4PropertyId = match.propertyId;
      patch.ga4PropertyDisplayName = match.displayName;
    }
  }

  if (Object.keys(patch).length === 0) return Response.json({ error: "SEARCH_INVALID_REQUEST" }, { status: 400 });

  const updated = await updateGoogleConnectionConfig(supabase, { tenantId: body.tenantId, ...patch });

  await recordAuditEvent(supabase, {
    tenantId: body.tenantId,
    actorUserId: ctx.userId,
    actorKind: "user",
    action: "SEARCH_GOOGLE_CONFIG_UPDATED",
    targetType: "search_google_connection",
    metadata: { searchConsoleSiteUrl: updated.search_console_site_url, ga4PropertyId: updated.ga4_property_id },
  });

  return Response.json({
    searchConsoleSiteUrl: updated.search_console_site_url,
    ga4PropertyId: updated.ga4_property_id,
    ga4PropertyDisplayName: updated.ga4_property_display_name,
  });
}

export const POST = handle;
export const PATCH = handle;
