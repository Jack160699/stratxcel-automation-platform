import { NextResponse, type NextRequest } from "next/server";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { requireOperatingBrainApiAccess } from "@/lib/release/operating-brain-api";
import { getServiceContext } from "@/lib/owner-brain/db-context";
import { verifyOwnerBrainOAuthState } from "@/lib/owner-brain/connectors/oauth-state";
import { exchangeGoogleCode, safeGoogleOAuthError, scopeForGoogleSource } from "@/lib/owner-brain/connectors/google-oauth";
import { getSourceByKey, upsertConnection, updateSourceStatus } from "@/lib/owner-brain/repositories/sources";
import type { SourceKey } from "@/lib/owner-brain/types";

/**
 * GET /api/admin/operating-brain/connectors/google/callback
 * Verifies the signed state (CSRF + expiry + ownerId match against the
 * live session — not just the state payload), exchanges the code, vaults
 * the refresh token (never stored in a plain table), and marks the
 * connection CONNECTED. Any failure marks it ERROR with a human-readable
 * reason rather than leaving it silently stuck.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");
  const googleErrorDescription = url.searchParams.get("error_description");

  const redirectToAdmin = (params: Record<string, string>) => {
    const target = new URL("/admin/operating-brain", request.url);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    return NextResponse.redirect(target);
  };

  if (!state) {
    return redirectToAdmin({ connect_error: "google", reason: googleError ? "invalid_state" : "missing_state" });
  }

  const verified = verifyOwnerBrainOAuthState(state);
  if (!verified.ok) return redirectToAdmin({ connect_error: "google", reason: `invalid_state_${verified.reason}` });

  const access = await requireOperatingBrainApiAccess();
  if (!access.ok) return access.response;
  const ctx = access.ctx;
  if (ctx.ownerId !== verified.ownerId) {
    return NextResponse.json({ error: "Session does not match the OAuth flow that was started" }, { status: 403 });
  }

  const sourceKey = verified.sourceKey as SourceKey;
  const source = await getSourceByKey(ctx, sourceKey);
  if (!source) return NextResponse.json({ error: "Unknown source" }, { status: 400 });

  if (googleError) {
    const safeError = safeGoogleOAuthError(googleError, googleErrorDescription);
    await updateSourceStatus(ctx.ownerId, source.id, { status: "ERROR", last_error: safeError.message });
    return redirectToAdmin({ connect_error: sourceKey, reason: safeError.code });
  }

  if (!code) {
    const message = "Google OAuth returned without an authorization code. Please try again.";
    await updateSourceStatus(ctx.ownerId, source.id, { status: "ERROR", last_error: message });
    return redirectToAdmin({ connect_error: sourceKey, reason: "missing_code" });
  }

  const redirectUri = new URL("/api/admin/operating-brain/connectors/google/callback", request.url).toString();

  try {
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const vault = createDevEncryptedVault(getServiceContext().supabase);
    const ref = await vault.store(tokens.refreshToken);
    await upsertConnection({ ownerId: ctx.ownerId, sourceId: source.id, encryptedTokenRef: ref, scopes: [scopeForGoogleSource(sourceKey)] });
    return redirectToAdmin({ connected: sourceKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google OAuth connection failed";
    await updateSourceStatus(ctx.ownerId, source.id, { status: "ERROR", last_error: message });
    return redirectToAdmin({ connect_error: sourceKey, reason: "token_exchange_failed" });
  }
}

export const dynamic = "force-dynamic";
