import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { CANONICAL_ORIGIN } from "@/lib/reporting/site";
import {
  generateGoogleOAuthState,
  buildGoogleAuthorizeUrl,
  resolveGoogleOAuthCredentials,
  type GoogleServiceKey,
} from "@/lib/connectors/google-oauth-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/connectors/google/connect?tenantId=...&services=google_drive,search_console...
 * Initiates the unified Google OAuth consent flow for the Founder and agency.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const url = new URL(request.url);
  let tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    const { supabase } = getTenantServiceContext();
    const { data: tenant } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    tenantId = tenant?.id ?? "466e6195-a9f6-4576-8271-29fdae61c18a";
  }
  const resolvedTenantId: string = tenantId || "466e6195-a9f6-4576-8271-29fdae61c18a";

  const rawServices = url.searchParams.get("services");
  const requestedServices = rawServices
    ? (rawServices.split(",").map((s) => s.trim()) as GoogleServiceKey[])
    : undefined;

  const redirectTo = url.searchParams.get("redirectTo") || "/admin/connectors";

  const { isConfigured } = resolveGoogleOAuthCredentials();
  if (!isConfigured) {
    return Response.json(
      {
        error: "Google OAuth is not configured on the server. Please check Google OAuth Client ID and Secret in environment.",
        code: "GOOGLE_OAUTH_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const state = generateGoogleOAuthState({
    tenantId: resolvedTenantId,
    userId: admin.userId,
    redirectTo,
    requestedServices,
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || CANONICAL_ORIGIN || url.origin;
  const redirectUri = new URL("/api/platform/connectors/google/callback", origin).toString();

  let authorizeUrl: string;
  try {
    authorizeUrl = buildGoogleAuthorizeUrl({
      state,
      redirectUri,
      requestedServices,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to build Google authorize URL" },
      { status: 500 }
    );
  }

  return Response.redirect(authorizeUrl);
}
