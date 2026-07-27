import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import { isValidProvider, getProvider } from "@/lib/social/providers";
import { createSignedState } from "@/lib/social/oauth-state";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/social/oauth/:provider/connect
 * Admin-only. Issues a signed, single-use, expiring state token and
 * redirects the browser to the Meta authorization dialog for that provider.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const redirectTo = req.nextUrl.searchParams.get("redirectTo") ?? "/admin/social";
  const { token, hash, expiresAt } = createSignedState(provider, redirectTo);

  const service = createSupabaseServiceClient();
  const { error } = await service.from("social_oauth_states").insert({
    provider,
    state_hash: hash,
    redirect_to: redirectTo,
    created_by: admin.userId,
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
