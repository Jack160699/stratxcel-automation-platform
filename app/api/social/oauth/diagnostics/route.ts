import { NextResponse, type NextRequest } from "next/server";
import { getProviderConfigDiagnostics } from "@/lib/social/oauth-diagnostics";

/**
 * GET /api/social/oauth/diagnostics
 *
 * Exposes safe, non-sensitive provider configuration facts for all social connectors
 * (e.g. clientIdPresent, clientSecretPresent, canonicalRedirectUri, oauthMode, requiredScopes).
 * Strictly NEVER exposes secrets, tokens, or auth codes.
 */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") ?? undefined;
  const diagnostics = getProviderConfigDiagnostics(provider);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    providers: diagnostics,
  });
}

export const dynamic = "force-dynamic";
