import { NextResponse, type NextRequest } from "next/server";
import { requireConnectorEligibleUser } from "@/lib/social/admin-guard";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { createSignedState } from "@/lib/social/oauth-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getCanonicalSocialRedirectUri } from "@/lib/social/oauth-origin";
import { recordOAuthDiagnostic } from "@/lib/social/oauth-diagnostics";

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
    recordOAuthDiagnostic({
      provider,
      stage: "connect_url",
      status: "failure",
      reason: "not_authenticated",
    });
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isOnboarding) {
    const authUser = await requireConnectorEligibleUser(tenantId);
    if (!authUser.ok) {
      recordOAuthDiagnostic({
        provider,
        stage: "connect_url",
        status: "failure",
        reason: authUser.error,
      });
      return NextResponse.json({ error: authUser.error, code: authUser.code }, { status: authUser.status });
    }
  }

  if (!isValidProvider(provider)) {
    recordOAuthDiagnostic({
      provider,
      stage: "connect_url",
      status: "failure",
      reason: "unknown_provider",
    });
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
    recordOAuthDiagnostic({
      provider,
      stage: "connect_url",
      status: "failure",
      reason: `state_insert_failed:${error.message}`,
    });
    return NextResponse.json({ error: "Could not start OAuth flow" }, { status: 500 });
  }

  const redirectUri = getCanonicalSocialRedirectUri(provider, req.nextUrl.origin);

  try {
    const authUrl = getProvider(provider).getAuthorizationUrl(token, redirectUri);
    recordOAuthDiagnostic({
      provider,
      stage: "connect_url",
      status: "success",
      details: { redirectUri, redirectTo },
    });
    return NextResponse.redirect(authUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "authorization_url_failed";
    recordOAuthDiagnostic({
      provider,
      stage: "connect_url",
      status: "failure",
      reason: message,
      error: err,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
