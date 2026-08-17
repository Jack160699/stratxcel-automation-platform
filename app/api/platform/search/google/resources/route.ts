import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createDevEncryptedVault } from "@stratxcel/byok";
import {
  getGoogleConnection,
  getLiveGoogleAccessToken,
  listSearchConsoleSites,
  listGa4Properties,
  GoogleNotConnectedError,
  GooglePermissionLostError,
} from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/search/google/resources?tenantId=...
 * Doubles as the connection-status read for the Search & Discovery UI
 * (status + currently-selected properties are always returned) and, only
 * once a real connection exists, the live property lists an admin/owner
 * picks from. Gated by integration:configure — this list can reveal a
 * customer's other Google properties, so it is not shown to lower roles.
 * Search Console and GA4 are listed independently: one failing (e.g. that
 * specific scope was not granted) never blocks the other from returning
 * real data.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");

  let connection: any = null;
  let accessToken: string | null = null;
  let accessError: string | null = null;

  if (tenantId) {
    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    try {
      requirePermission(ctx.role, "integration:configure");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
      throw err;
    }

    const { supabase } = getTenantServiceContext();
    connection = await getGoogleConnection(supabase, tenantId);

    if (connection && connection.status === "connected") {
      const vault = createDevEncryptedVault(supabase);
      try {
        accessToken = await getLiveGoogleAccessToken(supabase, vault, tenantId);
      } catch (err) {
        accessError =
          err instanceof GoogleNotConnectedError
            ? "not_connected"
            : err instanceof GooglePermissionLostError
              ? "permission_required"
              : "token_refresh_failed";
      }
    }
  } else {
    // Onboarding pre-workspace context
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabaseUserClient = await createSupabaseServerClient();
    const { data: { user } } = await supabaseUserClient.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const metadata = (user.user_metadata ?? {}) as Record<string, any>;
    const oauthConns = (metadata.onboarding_oauth_connections ?? {}) as Record<string, any>;
    const googleSearch = oauthConns.google_search;

    if (googleSearch && googleSearch.status === "connected") {
      connection = {
        status: "connected",
        search_console_site_url: googleSearch.searchConsoleSiteUrl ?? null,
        ga4_property_id: googleSearch.ga4PropertyId ?? null,
        ga4_property_display_name: googleSearch.ga4PropertyDisplayName ?? null,
      };

      if (googleSearch.refreshToken) {
        try {
          const { createGoogleSearchTokenAdapter } = await import("@stratxcel/search-discovery");
          const tokenAdapter = createGoogleSearchTokenAdapter();
          const refreshed = await tokenAdapter.refreshAccessToken(googleSearch.refreshToken);
          accessToken = refreshed.accessToken;
        } catch {
          accessError = "token_refresh_failed";
        }
      }
    }
  }

  const base = {
    status: connection?.status ?? "disconnected",
    searchConsoleSiteUrl: connection?.search_console_site_url ?? null,
    searchConsoleLastSyncedAt: connection?.search_console_last_synced_at ?? null,
    ga4PropertyId: connection?.ga4_property_id ?? null,
    ga4PropertyDisplayName: connection?.ga4_property_display_name ?? null,
    ga4LastSyncedAt: connection?.ga4_last_synced_at ?? null,
    // Raw provider failures remain server-side. They can contain property or
    // upstream response details that are unnecessary in a browser payload.
    lastError: connection?.status === "error" ? "SEARCH_GOOGLE_CONNECTION_ERROR" : null,
  };

  if (!connection || connection.status !== "connected") {
    return Response.json(
      { ...base, searchConsoleSites: [], searchConsoleError: null, ga4Properties: [], ga4Error: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (accessError || !accessToken) {
    return Response.json(
      {
        ...base,
        status: accessError === "not_connected" ? "disconnected" : "error",
        searchConsoleSites: [],
        searchConsoleError: accessError || "token_missing",
        ga4Properties: [],
        ga4Error: accessError || "token_missing",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const [searchConsoleResult, ga4Result] = await Promise.allSettled([
    listSearchConsoleSites(accessToken),
    listGa4Properties(accessToken),
  ]);

  return Response.json(
    {
      ...base,
      searchConsoleSites: searchConsoleResult.status === "fulfilled" ? searchConsoleResult.value : [],
      searchConsoleError: searchConsoleResult.status === "rejected" ? "SEARCH_CONSOLE_LIST_FAILED" : null,
      ga4Properties: ga4Result.status === "fulfilled" ? ga4Result.value : [],
      ga4Error: ga4Result.status === "rejected" ? "GA4_LIST_FAILED" : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
