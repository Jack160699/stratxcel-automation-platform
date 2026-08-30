import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. SERVER-ONLY — bypasses RLS entirely.
 * Never import this from a Client Component or anything that ships to the
 * browser bundle. Used only by: the OAuth callback (token persistence),
 * the publishing worker (job claim + token decrypt), and admin server
 * actions that must read/write social_* tables directly.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY — a server-only secret, distinct from
 * NEXT_PUBLIC_SUPABASE_ANON_KEY. Throws loudly if missing rather than
 * silently falling back to the anon key.
 *
 * STRATXCEL full-system closure brief, Section 6 (secrets sweep):
 * deliberately does NOT add `import "server-only"` here, unlike
 * lib/image-generation/service.ts. Tried it, reverted it live in this
 * pass: server-only's real published implementation throws
 * unconditionally on any import under plain Node (it relies entirely on a
 * bundler swapping package.json's "browser" field at build time; there is
 * no such swap under this repo's own `node --experimental-strip-types`
 * test runner) -- and this exact function is imported, directly or via
 * its ServiceClient type, by dozens of lib/social/**test files that run
 * that way. Confirmed via a real scan: zero Client Component currently
 * imports this function, so the theoretical risk this would guard against
 * is not a live leak today -- and a real, repo-wide test-suite breakage is
 * a materially worse outcome than that theoretical gap, the same real
 * tradeoff image-generation/service.ts's own header comment documents for
 * why IT uses a dynamic import instead of a static one from lib/social.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — required for Social Autopilot server operations"
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
