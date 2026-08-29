import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePostLoginRedirect, finalizeAuthWorkspaceIntent } from "@/app/actions/auth";
import { sanitizeRedirectUrl } from "@/lib/auth/redirect";

// Mission D+ Section 7: Supabase Admin-API-generated magic links, password
// recovery links, and invite links redirect with the session in the URL
// *hash* (`#access_token=...`), never a `?code=` query param. A Route
// Handler can never see that hash -- browsers only send it to client-side
// JS, never to any server -- so a request that clearly carries a hash
// fragment intact (its `code`/`error` query params are both absent, which
// is exactly what a hash-only redirect looks like server-side; a genuine
// bare navigation to this path with nothing at all also matches, and
// harmlessly bounces through the same real "no tokens" fallback the bridge
// page already has) is forwarded, still carrying `next`/`mode`, to a small
// client component that can read the hash and complete the exchange. The
// `?code=` PKCE path below is completely unchanged.
const HASH_BRIDGE_MARKER = "__sx_hash_checked";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next");
  const rawMode = requestUrl.searchParams.get("mode");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  const bridged = requestUrl.searchParams.get(HASH_BRIDGE_MARKER) === "1";

  if (!code && !error && !bridged) {
    const bridgeUrl = new URL("/auth/callback/hash", requestUrl.origin);
    if (rawNext) bridgeUrl.searchParams.set("next", rawNext);
    if (rawMode) bridgeUrl.searchParams.set("mode", rawMode);
    return NextResponse.redirect(bridgeUrl);
  }

  if (error) {
    console.error("Supabase OAuth callback error:", error, errorDescription);
    const errorUrl = new URL("/login", requestUrl.origin);
    errorUrl.searchParams.set("error", errorDescription || error);
    return NextResponse.redirect(errorUrl);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Failed to exchange auth code for session:", exchangeError.message);
      const errorUrl = new URL("/login", requestUrl.origin);
      errorUrl.searchParams.set("error", exchangeError.message);
      return NextResponse.redirect(errorUrl);
    }
  }

  // A session now exists either via the `code` exchange just above, or (when
  // `bridged`) because `/auth/callback/hash` already turned the real hash
  // tokens into a real cookie via `/api/auth/session-bridge` before handing
  // off here -- both are a genuine completed sign-in, so both finalize the
  // same workspace intent.
  if (code || bridged) {
    await finalizeAuthWorkspaceIntent(rawMode);
  }

  let destination = "/app";
  if (rawNext) {
    destination = sanitizeRedirectUrl(rawNext, "/app");
  } else {
    destination = await resolvePostLoginRedirect();
  }

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
