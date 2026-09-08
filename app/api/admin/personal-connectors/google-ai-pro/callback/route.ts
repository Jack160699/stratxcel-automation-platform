import { NextResponse, type NextRequest } from "next/server";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  createConnectorConnection,
  resolveConnectorHealth,
  updateConnectorHealth,
  discoverConnectorCapabilities,
} from "@stratxcel/connectors";
import { getGoogleAiProRedirectUri } from "@/lib/admin/google-ai-pro-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/personal-connectors/google-ai-pro/callback
 * Handles Google OAuth callback:
 * 1. Exchanges code for tokens.
 * 2. Fetches Google UserInfo profile.
 * 3. Securely vaults credentials for the Founder Google AI Pro connector.
 * 4. Runs real health check & capability discovery.
 * 5. Redirects to /admin/personal-connectors?connected=google_ai_pro.
 *
 * redirect_uri passed to the token exchange MUST match exactly what was
 * sent in the authorization request. Both use getGoogleAiProRedirectUri()
 * so they are guaranteed consistent.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const baseUrl = new URL("/admin/personal-connectors", request.url);

  if (error) {
    baseUrl.searchParams.set("error", `Google authorization denied or failed: ${error}`);
    return NextResponse.redirect(baseUrl);
  }

  if (!code || !state) {
    baseUrl.searchParams.set("error", "Missing authorization code or state parameter");
    return NextResponse.redirect(baseUrl);
  }

  let stateObj: { userId?: string } = {};
  try {
    stateObj = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    // proceed with fallback
  }

  const clientId =
    process.env.GOOGLE_AI_PRO_CLIENT_ID ||
    process.env.GOOGLE_OWNER_BRAIN_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID;

  const clientSecret =
    process.env.GOOGLE_AI_PRO_CLIENT_SECRET ||
    process.env.GOOGLE_OWNER_BRAIN_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    baseUrl.searchParams.set(
      "error",
      "Google OAuth Client ID/Secret are not configured in environment"
    );
    return NextResponse.redirect(baseUrl);
  }

  // Use the same canonical redirect_uri that was sent in the authorization request.
  // This MUST match exactly — Google validates it on token exchange.
  const requestOrigin = new URL(request.url).origin;
  const redirectUri = getGoogleAiProRedirectUri(requestOrigin);

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => "");
      baseUrl.searchParams.set(
        "error",
        `Google token exchange failed (HTTP ${tokenRes.status}): ${errBody.slice(0, 100)}`
      );
      return NextResponse.redirect(baseUrl);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
    };

    // 2. Fetch UserInfo
    let userEmail: string | null = null;
    let userName: string | null = null;
    let userPicture: string | null = null;

    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userRes.ok) {
        const userInfo = (await userRes.json()) as {
          email?: string;
          name?: string;
          picture?: string;
        };
        userEmail = userInfo.email ?? null;
        userName = userInfo.name ?? null;
        userPicture = userInfo.picture ?? null;
      }
    } catch {
      // Userinfo best effort
    }

    // 3. Vault secret into connector_connections
    // Store refresh_token if available (or access_token if token refresh was already established)
    const secretToVault = tokens.refresh_token || tokens.access_token;
    const { supabase } = getTenantServiceContext();

    const connection = await createConnectorConnection(supabase as never, {
      connectorKey: "google_ai_pro",
      tenantId: null, // Founder personal platform scope
      rawSecret: secretToVault,
      connectedByUserId: stateObj.userId ?? null,
    });

    // 4. Run real health check & entitlement probe
    const health = await resolveConnectorHealth(supabase as never, "google_ai_pro", connection, null);

    const mergedDetails = {
      ...(health.details ?? {}),
      google_account_email: userEmail ?? (health.details?.google_account_email as string) ?? null,
      google_account_name: userName ?? (health.details?.google_account_name as string) ?? null,
      google_account_picture: userPicture ?? (health.details?.google_account_picture as string) ?? null,
    };

    await updateConnectorHealth(supabase as never, {
      connectionId: connection.id,
      status: health.status,
      discoveredCapabilities: health.discoveredCapabilities,
      lastError: health.lastError,
      lastVerifiedAt: health.lastVerifiedAt,
      metadata: mergedDetails,
    });

    // 5. Discover capabilities and record audit event
    if (health.status === "healthy" || health.status === "connected") {
      await discoverConnectorCapabilities(supabase as never, {
        connectionId: connection.id,
        connectorKey: "google_ai_pro",
        tenantId: null,
        actorKind: "founder",
        actorId: stateObj.userId ?? null,
      });
    }

    baseUrl.searchParams.set("connected", "google_ai_pro");
    return NextResponse.redirect(baseUrl);
  } catch (err) {
    baseUrl.searchParams.set("error", err instanceof Error ? err.message : "OAuth completion failed");
    return NextResponse.redirect(baseUrl);
  }
}
