import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { verifyOAuthState, createGoogleTokenRefreshAdapter, upsertConnectionStatus, createServiceClient } from "@stratxcel/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/platform/storage/drive/callback?code=...&state=...
 * Not exercised live tonight (no real Google consent flow has run), but
 * the full path is real: verify state (CSRF + expiry), re-confirm the
 * current session still belongs to that tenant with permission to
 * configure integrations, exchange the code for tokens, vault the refresh
 * token (never store it in a plain table), and mark the connection
 * 'connected'. Any failure marks the connection 'error' with a
 * human-readable reason rather than leaving it silently 'connecting'.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) return Response.json({ error: "Missing code or state" }, { status: 400 });

  const verified = verifyOAuthState(state);
  if (!verified.ok) return Response.json({ error: `Invalid OAuth state: ${verified.reason}` }, { status: 400 });

  const ctx = await requireTenantContext(verified.tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const supabase = createServiceClient();
  const redirectUri = new URL("/api/platform/storage/drive/callback", request.url).toString();

  try {
    const tokenAdapter = createGoogleTokenRefreshAdapter();
    const tokens = await tokenAdapter.exchangeCodeForTokens(code, redirectUri);

    const vault = createDevEncryptedVault(supabase);
    const ref = await vault.store(tokens.refreshToken);

    await upsertConnectionStatus(supabase, {
      tenantId: verified.tenantId,
      provider: "google_drive",
      status: "connected",
      encryptedTokenRef: ref,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    return Response.json({ connected: true });
  } catch (err) {
    await upsertConnectionStatus(supabase, {
      tenantId: verified.tenantId,
      provider: "google_drive",
      status: "error",
      lastError: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Failed to complete Drive connection" }, { status: 500 });
  }
}
