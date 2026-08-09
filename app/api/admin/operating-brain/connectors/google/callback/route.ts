import { NextResponse, type NextRequest } from "next/server";
import { createDevEncryptedVault } from "@stratxcel/byok";
import { requireOwnerContext, getServiceContext } from "@/lib/owner-brain/db-context";
import { verifyOwnerBrainOAuthState } from "@/lib/owner-brain/connectors/oauth-state";
import { exchangeGoogleCode, scopeForGoogleSource } from "@/lib/owner-brain/connectors/google-oauth";
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
  if (!code || !state) return NextResponse.json({ error: "Missing code or state" }, { status: 400 });

  const verified = verifyOwnerBrainOAuthState(state);
  if (!verified.ok) return NextResponse.json({ error: `Invalid OAuth state: ${verified.reason}` }, { status: 400 });

  const ctx = await requireOwnerContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (ctx.ownerId !== verified.ownerId) {
    return NextResponse.json({ error: "Session does not match the OAuth flow that was started" }, { status: 403 });
  }

  const sourceKey = verified.sourceKey as SourceKey;
  const source = await getSourceByKey(ctx, sourceKey);
  if (!source) return NextResponse.json({ error: "Unknown source" }, { status: 400 });

  const redirectUri = new URL("/api/admin/operating-brain/connectors/google/callback", request.url).toString();

  try {
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const vault = createDevEncryptedVault(getServiceContext().supabase);
    const ref = await vault.store(tokens.refreshToken);
    await upsertConnection({ ownerId: ctx.ownerId, sourceId: source.id, encryptedTokenRef: ref, scopes: [scopeForGoogleSource(sourceKey)] });
    return NextResponse.redirect(new URL("/admin/operating-brain?connected=" + sourceKey, request.url));
  } catch (err) {
    await updateSourceStatus(ctx.ownerId, source.id, { status: "ERROR", last_error: err instanceof Error ? err.message : String(err) });
    return NextResponse.redirect(new URL("/admin/operating-brain?connect_error=" + sourceKey, request.url));
  }
}

export const dynamic = "force-dynamic";
