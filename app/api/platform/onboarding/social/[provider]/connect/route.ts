import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /api/platform/onboarding/social/[provider]/connect
 *
 * Backward-compatible trampoline that forwards to the canonical OAuth connect route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  return NextResponse.redirect(
    new URL(`/api/social/oauth/${provider}/connect?redirectTo=/app`, req.nextUrl.origin),
    307
  );
}

export const dynamic = "force-dynamic";
