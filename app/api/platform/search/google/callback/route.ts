import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { CANONICAL_ORIGIN } from "@/lib/reporting/site";
import { createDevEncryptedVault } from "@stratxcel/byok";
import {
  verifyOAuthState,
  createGoogleSearchTokenAdapter,
  getGoogleConnection,
  upsertGoogleConnectionStatus,
} from "@stratxcel/search-discovery";
import { recordAuditEvent } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Always a same-origin, hardcoded relative path — never derived from any
// request input — so this callback can never be used as an open redirect.
const RETURN_PATH = "/app/search";

function safeRedirect(params: Record<string, string>) {
  const url = new URL(RETURN_PATH, CANONICAL_ORIGIN);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url.toString());
}

/**
 * GET /api/platform/search/google/callback?code=...&state=...
 * Verifies the signed, tenant-bound, expiring state; re-confirms the
 * current session is an authenticated member of that exact tenant with
 * permission to manage integrations (a request that reaches this route
 * without any of those must be rejected, not just have its state ignored);
 * exchanges the code for tokens; vaults the refresh token (never stored in
 * plaintext, never returned to the browser); and marks the connection
 * 'connected'. If Google does not return a refresh token on this
 * authorization (e.g. a re-consent that doesn't force prompt=consent for
 * some reason), an already-stored, still-valid refresh token is preserved
 * rather than being destroyed. Any failure marks the connection 'error'
 * with a human-readable, secret-free reason.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return safeRedirect({ googleConnectError: "denied" });
  if (!state) return safeRedirect({ googleConnectError: "missing_state" });

  const verified = verifyOAuthState(state);
  if (!verified.ok) return safeRedirect({ googleConnectError: `bad_state_${verified.reason}` });
  if (!code) return safeRedirect({ googleConnectError: "missing_code" });

  // Re-derive tenant membership from the CURRENT authenticated session —
  // the state's tenantId is never trusted on its own. A session that
  // doesn't belong to the tenant the state was issued for, or that lacks
  // permission, is rejected here even though the state itself verified.
  const ctx = await requireTenantContext(verified.tenantId);
  if (!ctx.ok) return safeRedirect({ googleConnectError: "not_authenticated" });
  if (ctx.userId !== verified.userId) return safeRedirect({ googleConnectError: "user_mismatch" });

  try {
    requirePermission(ctx.role, "integration:configure");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return safeRedirect({ googleConnectError: "forbidden" });
    throw err;
  }

  const { supabase } = getTenantServiceContext();
  const redirectUri = new URL("/api/platform/search/google/callback", CANONICAL_ORIGIN).toString();

  try {
    const tokenAdapter = createGoogleSearchTokenAdapter();
    const tokens = await tokenAdapter.exchangeCodeForTokens(code, redirectUri);

    const vault = createDevEncryptedVault(supabase);
    const existing = await getGoogleConnection(supabase, verified.tenantId);

    let refreshTokenRef: string | null | undefined;
    if (tokens.refreshToken) {
      // Fresh refresh token issued — vault it. If an older one existed,
      // it is simply superseded (not separately revoked here — Google
      // itself invalidates prior refresh tokens for the same client+user
      // combination in some cases, and superseding the stored ref is safe
      // either way since only the ref is ever readable back out).
      refreshTokenRef = await vault.store(tokens.refreshToken);
    } else if (existing?.encrypted_refresh_token_ref) {
      // No new refresh token this time (Google only guarantees one on a
      // prompt=consent authorization) — keep the already-valid one rather
      // than nulling it out and breaking a working connection.
      refreshTokenRef = undefined; // upsertGoogleConnectionStatus leaves the ref column untouched when undefined.
    } else {
      // No new token AND nothing stored previously — this is a genuine
      // failure to obtain offline access.
      await upsertGoogleConnectionStatus(supabase, {
        tenantId: verified.tenantId,
        status: "error",
        lastError: "Google did not return a refresh token and no prior connection exists. Reconnect and approve offline access.",
      });
      await recordAuditEvent(supabase, {
        tenantId: verified.tenantId,
        actorUserId: ctx.userId,
        actorKind: "user",
        action: "SEARCH_GOOGLE_CONNECT_FAILED",
        targetType: "search_google_connection",
        metadata: { reason: "no_refresh_token" },
      });
      return safeRedirect({ googleConnectError: "no_refresh_token" });
    }

    await upsertGoogleConnectionStatus(supabase, {
      tenantId: verified.tenantId,
      status: "connected",
      encryptedRefreshTokenRef: refreshTokenRef,
      grantedScopes: tokens.grantedScopes.length ? tokens.grantedScopes : existing?.granted_scopes ?? [],
      connectedByUserId: ctx.userId,
    });

    await recordAuditEvent(supabase, {
      tenantId: verified.tenantId,
      actorUserId: ctx.userId,
      actorKind: "user",
      action: "SEARCH_GOOGLE_CONNECTED",
      targetType: "search_google_connection",
      metadata: { scopes: tokens.grantedScopes },
    });

    return safeRedirect({ googleConnected: "1" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await upsertGoogleConnectionStatus(supabase, {
      tenantId: verified.tenantId,
      status: "error",
      lastError: message.slice(0, 500),
    });
    await recordAuditEvent(supabase, {
      tenantId: verified.tenantId,
      actorUserId: ctx.userId,
      actorKind: "user",
      action: "SEARCH_GOOGLE_CONNECT_FAILED",
      targetType: "search_google_connection",
      metadata: { reason: "exchange_failed" },
    });
    return safeRedirect({ googleConnectError: "connect_failed" });
  }
}
