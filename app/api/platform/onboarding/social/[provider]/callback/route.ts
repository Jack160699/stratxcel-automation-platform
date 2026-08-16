import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /api/platform/onboarding/social/[provider]/callback
 *
 * Backward-compatible trampoline that forwards to the canonical OAuth callback route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const target = new URL(`/api/social/oauth/${provider}/callback`, req.nextUrl.origin);
  req.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target, 307);
}

export const dynamic = "force-dynamic";
