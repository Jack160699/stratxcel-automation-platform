import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/personal-connectors/google-ai-pro/connect
 * Initiates the Google OAuth authorization flow for the Founder's Google AI Pro account.
 * Redirects to Google's consent screen requesting offline access.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const clientId =
    process.env.GOOGLE_AI_PRO_CLIENT_ID ||
    process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "Google OAuth Client ID is not configured (set GOOGLE_AI_PRO_CLIENT_ID or GOOGLE_CLIENT_ID in platform environment). You can also enter a Google OAuth token directly in Admin.",
      },
      { status: 503 }
    );
  }

  const redirectUri = new URL(
    "/api/admin/personal-connectors/google-ai-pro/callback",
    request.url
  ).toString();

  const statePayload = {
    userId: admin.userId,
    timestamp: Date.now(),
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.file",
  ];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: scopes.join(" "),
    state,
  });

  const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(authorizeUrl);
}
