import { NextResponse, type NextRequest } from "next/server";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { requireOperatingBrainApiAccess } from "@/lib/release/operating-brain-api";
import { getServiceContext } from "@/lib/owner-brain/db-context";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { verifyOwnerBrainOAuthState } from "@/lib/owner-brain/connectors/oauth-state";
import { exchangeGoogleCode, safeGoogleOAuthError, scopeForGoogleSource } from "@/lib/owner-brain/connectors/google-oauth";
import {
  verifyGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  persistGoogleTokens,
  resolveGoogleOAuthRedirectUri,
} from "@/lib/connectors/google-oauth-service";
import { getSourceByKey, upsertConnection, updateSourceStatus } from "@/lib/owner-brain/repositories/sources";
import type { SourceKey } from "@/lib/owner-brain/types";

/**
 * GET /api/admin/operating-brain/connectors/google/callback
 * Handles Google OAuth callback for both:
 * 1. The Unified Google Connector Hub (/admin/connectors)
 * 2. The Operating Brain personal sources (/admin/operating-brain)
 *
 * Verifies signed state, exchanges code for tokens, vaults refresh token,
 * persists connection and capabilities, and redirects cleanly.
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

  // 1. Check if this is the Unified Google Connector Hub flow (/admin/connectors)
  const unifiedVerified = verifyGoogleOAuthState(state);
  if (unifiedVerified.ok) {
    const returnTarget = new URL(unifiedVerified.redirectTo, request.url);

    if (googleError) {
      const safeError = safeGoogleOAuthError(googleError, googleErrorDescription);
      returnTarget.searchParams.set("error", safeError.code);
      returnTarget.searchParams.set("error_description", safeError.message);
      return NextResponse.redirect(returnTarget);
    }

    if (!code) {
      returnTarget.searchParams.set("error", "missing_code");
      returnTarget.searchParams.set("error_description", "Google did not return an authorization code");
      return NextResponse.redirect(returnTarget);
    }

    const redirectUri = resolveGoogleOAuthRedirectUri(url.origin);
    try {
      const tokens = await exchangeGoogleAuthorizationCode(code, redirectUri);
      const { supabase } = getTenantServiceContext();

      await persistGoogleTokens(supabase, {
        tenantId: unifiedVerified.tenantId,
        userId: unifiedVerified.userId,
        tokens,
      });

      returnTarget.searchParams.set("connected", "google");
      returnTarget.searchParams.set("status", "success");
      return NextResponse.redirect(returnTarget);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token exchange failed";
      console.error("[google-oauth] Unified callback token exchange error:", message);
      returnTarget.searchParams.set("error", "token_exchange_failed");
      returnTarget.searchParams.set("error_description", message);
      return NextResponse.redirect(returnTarget);
    }
  }

  // 2. Legacy Operating Brain personal source flow
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
