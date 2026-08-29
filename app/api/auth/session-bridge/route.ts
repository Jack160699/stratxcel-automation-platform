import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mission D+ Section 7: Supabase Admin-API / recovery / invite links redirect
 * with the session in the URL *hash* (`#access_token=...`), which browsers
 * never send to a server -- `app/auth/callback/route.ts` only ever
 * implemented the `?code=` PKCE exchange, so a hash-based link silently
 * never established a session. This is the missing half: a tiny,
 * same-origin bridge that the client-side hash bootstrap
 * (`app/auth/callback/hash/page.tsx`) POSTs the real, already-issued tokens
 * to, so the REAL `createSupabaseServerClient()` -- the same one every other
 * server-side auth path in this app uses -- can call the real
 * `supabase.auth.setSession()` and let its own cookie handler write the
 * real session cookie. No new session-issuance logic: this only lets an
 * already-valid Supabase-issued token pair reach the one function that
 * turns it into a cookie. `setSession` independently revalidates the tokens
 * against Supabase's own auth server, so a forged/expired token still fails
 * here exactly as it would in any other Supabase client. Tokens travel only
 * in a same-origin POST body (never the URL/query string) and are never
 * logged.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { access_token, refresh_token } = (body ?? {}) as Record<string, unknown>;
  if (typeof access_token !== "string" || !access_token || typeof refresh_token !== "string" || !refresh_token) {
    return NextResponse.json({ error: "missing_tokens" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
