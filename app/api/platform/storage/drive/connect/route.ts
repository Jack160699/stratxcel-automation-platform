import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { generateOAuthState, buildGoogleAuthorizeUrl } from "@stratxcel/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/storage/drive/connect?tenantId=...
 * Redirects to Google's consent screen (drive.file scope only). Not
 * exercised live tonight — do not attempt OAuth login tonight — but the
 * code path is real and typechecked: it requires GOOGLE_DRIVE_CLIENT_ID
 * and DRIVE_OAUTH_STATE_SECRET to actually redirect, and fails closed
 * (500, not a silent no-op) if either is missing.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const state = generateOAuthState({ tenantId, userId: ctx.userId });
  const redirectUri = new URL("/api/platform/storage/drive/callback", request.url).toString();

  let authorizeUrl: string;
  try {
    authorizeUrl = buildGoogleAuthorizeUrl({ state, redirectUri });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Drive OAuth is not configured" }, { status: 500 });
  }

  return Response.redirect(authorizeUrl);
}
