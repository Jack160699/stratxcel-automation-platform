import { NextResponse, type NextRequest } from "next/server";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { createSignedState } from "@/lib/social/oauth-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/platform/onboarding/social/[provider]/connect
 *
 * Initiates OAuth for any authenticated user during onboarding.
 * Reuses the canonical provider infrastructure (getProvider, createSignedState)
 * but relaxes the auth check from admin-only to any-authenticated-user,
 * because no tenant exists yet during onboarding.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const redirectTo = "/app";
  const { token, hash, expiresAt } = createSignedState(provider, redirectTo);

  const service = createSupabaseServiceClient();
  const { error } = await service.from("social_oauth_states").insert({
    provider,
    state_hash: hash,
    redirect_to: redirectTo,
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  });
  if (error) {
    console.error("onboarding social_oauth_states insert failed:", error.message);
    return NextResponse.json({ error: "Could not start OAuth flow" }, { status: 500 });
  }

  const redirectUri = new URL(
    `/api/platform/onboarding/social/${provider}/callback`,
    req.nextUrl.origin
  ).toString();

  const authUrl = getProvider(provider).getAuthorizationUrl(token, redirectUri);

  return NextResponse.redirect(authUrl);
}

export const dynamic = "force-dynamic";
