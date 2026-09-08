import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/social/admin-guard";
import {
  getGoogleAiProRedirectUri,
  buildGoogleAiProOAuthDiagnostics,
} from "@/lib/admin/google-ai-pro-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/personal-connectors/google-ai-pro/connect
 * Initiates the Google OAuth authorization flow for the Founder's Google AI Pro account.
 * Redirects to Google's consent screen requesting offline access.
 *
 * redirect_uri is derived from getGoogleAiProRedirectUri() — always the canonical
 * production domain (https://www.stratxcel.in) rather than request.url, which on
 * Vercel may resolve to a preview-deployment hostname and cause redirect_uri_mismatch.
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

  // Derive origin from request only to detect local development.
  // In production we always use the canonical stratxcel.in domain.
  const requestOrigin = new URL(request.url).origin;
  const redirectUri = getGoogleAiProRedirectUri(requestOrigin);

  // Safe diagnostic log — no secrets
  const env = process.env.NODE_ENV ?? "unknown";
  console.log(buildGoogleAiProOAuthDiagnostics(clientId, redirectUri, env));

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
