import { NextResponse, type NextRequest } from "next/server";
import { requireConnectorEligibleUser } from "@/lib/social/admin-guard";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { createSignedState } from "@/lib/social/oauth-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/social/oauth/:provider/connect
 *
 * Canonical OAuth entry point for all social connectors (Admin + Onboarding).
 * Uses the canonical registered redirect URI (/api/social/oauth/:provider/callback).
 *
 * - Onboarding (redirectTo=/app): allows any authenticated user.
 * - Admin (/admin/social): enforces requireConnectorEligibleUser.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const redirectTo = req.nextUrl.searchParams.get("redirectTo") ?? "/admin/social";
  const isOnboarding = redirectTo.startsWith("/app");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isOnboarding) {
    const authUser = await requireConnectorEligibleUser(tenantId);
    if (!authUser.ok) {
      return NextResponse.json({ error: authUser.error, code: authUser.code }, { status: authUser.status });
    }
  }

  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

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
    console.error("social_oauth_states insert failed:", error.message);
    return NextResponse.json({ error: "Could not start OAuth flow" }, { status: 500 });
  }

  const redirectUri = new URL(
    `/api/social/oauth/${provider}/callback`,
    req.nextUrl.origin
  ).toString();

  const authUrl = getProvider(provider).getAuthorizationUrl(token, redirectUri);

  return NextResponse.redirect(authUrl);
}

export const dynamic = "force-dynamic";
