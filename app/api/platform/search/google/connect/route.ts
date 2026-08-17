import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { CANONICAL_ORIGIN } from "@/lib/reporting/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateOAuthState, buildGoogleAuthorizeUrl } from "@stratxcel/search-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/search/google/connect?tenantId=...&redirectTo=...
 * Redirects to Google's consent screen requesting the minimum read-only
 * scopes for Search Console + GA4 (see packages/search-discovery/src/google/oauth.ts
 * for the verified scope strings and endpoints). Requires the caller to be
 * an authenticated member of the tenant with integration:configure — the
 * same RBAC permission the existing Drive connect flow uses, per this
 * repo's established convention for "who may manage a tenant's third-party
 * connections" (see app/api/platform/storage/drive/connect/route.ts).
 * Fails closed (never silently no-ops) if the OAuth client or state secret
 * is not configured.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId");
  const rawRedirectTo = url.searchParams.get("redirectTo");
  const redirectTo = rawRedirectTo && (rawRedirectTo.startsWith("/app") || rawRedirectTo.startsWith("/admin")) ? rawRedirectTo : "/app/search";

  let userId: string;

  if (tenantId) {
    const ctx = await requireTenantContext(tenantId);
    if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

    try {
      requirePermission(ctx.role, "integration:configure");
    } catch (err) {
      if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
      throw err;
    }
    userId = ctx.userId;
  } else {
    // For pre-workspace onboarding
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
    userId = user.id;
  }

  const state = generateOAuthState({ tenantId: tenantId || null, userId, redirectTo });
  const redirectUri = new URL("/api/platform/search/google/callback", CANONICAL_ORIGIN).toString();

  let authorizeUrl: string;
  try {
    authorizeUrl = buildGoogleAuthorizeUrl({ state, redirectUri });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Google Search/GA4 OAuth is not configured" }, { status: 500 });
  }

  return Response.redirect(authorizeUrl);
}
