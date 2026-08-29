"use client";

import { useEffect, useState } from "react";

/**
 * Mission D+ Section 7: the browser-side half of the hash-based session
 * bootstrap. `route.ts` in the parent `/auth/callback` segment redirects
 * any request that arrives with a URL fragment instead of `?code=` here
 * (a route.ts can never see the fragment itself -- browsers never send it
 * to any server), preserving the existing PKCE `?code=` path byte-for-byte
 * unchanged.
 *
 * This reads the real, already-issued `access_token`/`refresh_token` out of
 * `location.hash` (never sent over the network by the browser on its own),
 * POSTs them once, same-origin, to `/api/auth/session-bridge` so the real
 * server-side Supabase client can turn them into the real session cookie,
 * then hands off to the ORIGINAL `/auth/callback` route (now cookie-bearing,
 * `code`-less) so every existing post-login redirect rule
 * (`resolvePostLoginRedirect`, `finalizeAuthWorkspaceIntent`,
 * `sanitizeRedirectUrl`) runs completely unchanged.
 */
export default function AuthCallbackHashBridge() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;

    async function bootstrap() {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const hashError = params.get("error_description") ?? params.get("error");
      if (hashError) {
        window.location.replace(`/login?error=${encodeURIComponent(hashError)}`);
        return;
      }

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        // No real tokens to bootstrap from -- nothing this page can do.
        window.location.replace("/login");
        return;
      }

      try {
        const res = await fetch("/api/auth/session-bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
        });
        if (!res.ok) {
          setError("Could not complete sign-in. The link may have expired -- request a new one.");
          return;
        }
      } catch {
        setError("Network error while completing sign-in. Please try again.");
        return;
      }

      // Hand off to the real callback route -- code-less, but now cookie-bearing
      // -- so every existing redirect-resolution rule applies unchanged. The
      // marker tells the route the bridge already ran (its own tokens are
      // single-use and gone from the URL after this replace), so it must not
      // bounce this request back here again.
      const forward = new URLSearchParams(search);
      forward.set("__sx_hash_checked", "1");
      window.location.replace(`/auth/callback?${forward.toString()}`);
    }

    void bootstrap();
    // Intentionally run once on mount: location.hash/search are read at the
    // moment this page loads (the tokens are single-use) -- there is
    // nothing meaningful to react to on a later change, and everything
    // referenced above is either a module-level import or read fresh from
    // window inside the effect, so the dependency array is genuinely empty.
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
      <p className="font-sx-sans text-sm text-sx-text-muted">{error ?? "Completing sign-in…"}</p>
    </div>
  );
}
