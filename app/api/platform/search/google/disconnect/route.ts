import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { getGoogleConnection, disconnectGoogleConnection, createGoogleSearchTokenAdapter } from "@stratxcel/search-discovery";
import { recordAuditEvent } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/platform/search/google/disconnect
 * Removes the tenant's local Google credential entirely: deletes the
 * vaulted refresh token (not merely unlinks it), clears the selected
 * properties, and best-effort revokes the grant at Google so it also
 * disappears from the user's "Third-party apps with account access" list.
 * Revocation failure never blocks the local disconnect — the tenant's
 * stored credential is gone either way.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { tenantId?: string };
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

  if (connection?.encrypted_refresh_token_ref) {
    const vault = createDevEncryptedVault(supabase);
    const refreshToken = await vault.retrieve(connection.encrypted_refresh_token_ref).catch(() => null);
    if (refreshToken) {
      const tokenAdapter = createGoogleSearchTokenAdapter();
      await tokenAdapter.revokeToken(refreshToken).catch(() => ({ revoked: false }));
    }
    await vault.revoke(connection.encrypted_refresh_token_ref).catch(() => undefined);
  }

  await disconnectGoogleConnection(supabase, body.tenantId);

  await recordAuditEvent(supabase, {
    tenantId: body.tenantId,
    actorUserId: ctx.userId,
    actorKind: "user",
    action: "SEARCH_GOOGLE_DISCONNECTED",
    targetType: "search_google_connection",
    metadata: {},
  });

  return Response.json({ disconnected: true });
}
