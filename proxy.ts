import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isStaleRefreshError(message: string | undefined): boolean {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("refresh_token_already_used") || normalized.includes("invalid refresh token");
}

/**
 * Keeps the Supabase auth session fresh for protected product requests.
 * Auth decisions live in the canonical server identity resolver.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let pendingCookies: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies = cookiesToSet;
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
        },
      },
    }
  );

  try {
    const { error } = await supabase.auth.getUser();
    if (error && isStaleRefreshError(error.message)) {
      await supabase.auth.signOut();
      pendingCookies = [];
      response = NextResponse.next({ request });
    }
  } catch {
    response = NextResponse.next({ request });
    pendingCookies = [];
  }

  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/admin", "/app/:path*", "/app"],
};
