import { NextResponse, type NextRequest } from "next/server";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { verifySignedState } from "@/lib/social/oauth-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/platform/onboarding/social/[provider]/callback
 *
 * Handles the OAuth callback during onboarding. Reuses the canonical
 * provider token exchange but stores the authorized connection metadata
 * in the user's Supabase auth metadata (pre-tenant). When the workspace
 * is created later, this data seeds the tenant's social_accounts.
 *
 * Tokens are NOT stored in user metadata for security. Only the proof
 * of successful authorization and the provider identity are kept. The user
 * will re-authorize from their workspace dashboard when StratXcel needs to
 * actually manage their accounts (publish, read insights, etc.).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const origin = req.nextUrl.origin;
  const failRedirect = (reason: string) =>
    NextResponse.redirect(`${origin}/app?connect_error=${encodeURIComponent(reason)}`);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failRedirect("not_authenticated");

  if (!isValidProvider(provider)) return failRedirect("unknown_provider");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) return failRedirect(`provider_error:${oauthError}`);
  if (!code || !state) return failRedirect("missing_code_or_state");

  const verified = verifySignedState(state);
  if (!verified.valid) return failRedirect(`bad_state:${verified.reason}`);
  if (verified.payload.provider !== provider) return failRedirect("provider_mismatch");

  const service = createSupabaseServiceClient();

  const { data: stateRow } = await service
    .from("social_oauth_states")
    .select("id, consumed_at, expires_at")
    .eq("state_hash", verified.hash)
    .maybeSingle();

  if (!stateRow) return failRedirect("state_not_found");
  if (stateRow.consumed_at) return failRedirect("state_already_used");
  if (new Date(stateRow.expires_at).getTime() < Date.now()) return failRedirect("state_expired");

  // Consume immediately to prevent replay
  await service
    .from("social_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", stateRow.id);

  const redirectUri = new URL(
    `/api/platform/onboarding/social/${provider}/callback`,
    origin
  ).toString();

  try {
    const result = await getProvider(provider).exchangeCodeForToken(code, redirectUri);

    // Store authorized connection metadata in user's auth metadata.
    // This is the proof of successful OAuth — NOT the tokens themselves.
    const existingMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const existingConnections = (existingMeta.onboarding_oauth_connections ?? {}) as Record<string, unknown>;

    await service.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...existingMeta,
        onboarding_oauth_connections: {
          ...existingConnections,
          [provider]: {
            providerAccountId: result.externalAccountId,
            username: result.username ?? result.displayName ?? result.externalAccountId,
            displayName: result.displayName ?? null,
            avatarUrl: result.profilePictureUrl ?? null,
            scopes: result.scopes,
            connectedAt: new Date().toISOString(),
          },
        },
      },
    });

    return NextResponse.redirect(`${origin}/app?connected=${provider}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error(`Onboarding ${provider} OAuth callback failed:`, message);
    return failRedirect("token_exchange_failed");
  }
}

export const dynamic = "force-dynamic";
