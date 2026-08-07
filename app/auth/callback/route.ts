import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePostLoginRedirect } from "@/app/actions/auth";
import { sanitizeRedirectUrl } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext = requestUrl.searchParams.get("next");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

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

  let destination = "/app";
  if (rawNext) {
    destination = sanitizeRedirectUrl(rawNext, "/app");
  } else {
    destination = await resolvePostLoginRedirect();
  }

  return NextResponse.redirect(new URL(destination, requestUrl.origin));
}
