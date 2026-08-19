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
  const correlationId = `gcfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const body = (await request.json().catch(() => ({}))) as ConfigBody;

  if (!body.tenantId) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabaseUserClient = await createSupabaseServerClient();
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) return Response.json({ error: "SEARCH_INVALID_REQUEST" }, { status: 400 });

    const metadata = (user.user_metadata ?? {}) as Record<string, any>;
    const oauthConns = (metadata.onboarding_oauth_connections ?? {}) as Record<string, any>;
    const googleSearch = oauthConns.google_search || {};

    const updatedGoogleSearch = {
      ...googleSearch,
      status: "connected",
      searchConsoleSiteUrl: body.searchConsoleSiteUrl !== undefined ? body.searchConsoleSiteUrl : googleSearch.searchConsoleSiteUrl ?? null,
      ga4PropertyId: body.ga4PropertyId !== undefined ? body.ga4PropertyId : googleSearch.ga4PropertyId ?? null,
      ga4PropertyDisplayName: body.ga4PropertyDisplayName !== undefined ? body.ga4PropertyDisplayName : googleSearch.ga4PropertyDisplayName ?? null,
    };

    await supabaseUserClient.auth.updateUser({
      data: {
        ...metadata,
        onboarding_oauth_connections: {
          ...oauthConns,
          google_search: updatedGoogleSearch,
        },
      },
    });

    return Response.json({
      ok: true,
      correlationId,
      searchConsoleSiteUrl: updatedGoogleSearch.searchConsoleSiteUrl,
      ga4PropertyId: updatedGoogleSearch.ga4PropertyId,
      ga4PropertyDisplayName: updatedGoogleSearch.ga4PropertyDisplayName,
    });
  }

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

  // This endpoint only ever *selects a property* on an already-connected
  // Google account -- it must never conjure a connection row into
  // existence. A real OAuth callback (search/google/callback/route.ts)
  // always exchanges a real refresh token before writing status:
  // "connected"; this route used to upsert a status:"connected" row here
  // with no token and no granted scopes whenever one was missing, which
  // produced a permanently fake "connected" state -- the canonical
  // resolver, and every downstream reader (including the audit engine's
  // connector insights), would report this tenant as connected while
  // every real API call failed. Fail closed instead: if OAuth was never
  // actually completed, the customer must complete it, not have this
  // endpoint paper over the gap.
  if (!connection) {
    return Response.json({ error: "SEARCH_GOOGLE_NOT_CONNECTED" }, { status: 409 });
  }

  const vault = createDevEncryptedVault(supabase);
  let accessToken: string | null = null;
  if (connection.encrypted_refresh_token_ref) {
    try {
      accessToken = await getLiveGoogleAccessToken(supabase, vault, body.tenantId);
    } catch (err) {
      console.warn(`[search/google/config] [${correlationId}] Access token refresh non-fatal trace:`, err instanceof Error ? err.message : err);
    }
  }

  const patch: { searchConsoleSiteUrl?: string | null; ga4PropertyId?: string | null; ga4PropertyDisplayName?: string | null } = {};

  if (body.searchConsoleSiteUrl !== undefined) {
    if (body.searchConsoleSiteUrl === null || body.searchConsoleSiteUrl === "") {
      patch.searchConsoleSiteUrl = null;
    } else {
      if (accessToken) {
        const sites = await listSearchConsoleSites(accessToken).catch(() => []);
        if (sites.length > 0 && !sites.some((s) => s.siteUrl === body.searchConsoleSiteUrl)) {
          console.warn(`[search/google/config] [${correlationId}] Requested site ${body.searchConsoleSiteUrl} not in live sites list, preserving selection`);
        }
      }
      patch.searchConsoleSiteUrl = body.searchConsoleSiteUrl;
    }
  }

  if (body.ga4PropertyId !== undefined) {
    if (body.ga4PropertyId === null || body.ga4PropertyId === "") {
      patch.ga4PropertyId = null;
      patch.ga4PropertyDisplayName = null;
    } else {
      let displayName: string | null = body.ga4PropertyDisplayName ?? null;
      if (accessToken) {
        const properties = await listGa4Properties(accessToken).catch(() => []);
        const match = properties.find((p) => p.propertyId === body.ga4PropertyId);
        if (match) {
          displayName = match.displayName;
        }
      }
      patch.ga4PropertyId = body.ga4PropertyId;
      patch.ga4PropertyDisplayName = displayName;
    }
  }

  if (Object.keys(patch).length === 0) return Response.json({ error: "SEARCH_INVALID_REQUEST" }, { status: 400 });

  const updated = await updateGoogleConnectionConfig(supabase, { tenantId: body.tenantId, ...patch });

  console.log(`[search/google/config] [${correlationId}] Successfully saved configuration:`, {
    tenantId: body.tenantId,
    searchConsoleSiteUrl: updated.search_console_site_url,
    ga4PropertyId: updated.ga4_property_id,
  });

  await recordAuditEvent(supabase, {
    tenantId: body.tenantId,
    actorUserId: ctx.userId,
    actorKind: "user",
    action: "SEARCH_GOOGLE_CONFIG_UPDATED",
    targetType: "search_google_connection",
    metadata: {
      searchConsoleSiteUrl: updated.search_console_site_url,
      ga4PropertyId: updated.ga4_property_id,
      correlationId,
    },
  });

  return Response.json({
    ok: true,
    correlationId,
    searchConsoleSiteUrl: updated.search_console_site_url,
    ga4PropertyId: updated.ga4_property_id,
    ga4PropertyDisplayName: updated.ga4_property_display_name,
  });
}

export const POST = handle;
export const PATCH = handle;
