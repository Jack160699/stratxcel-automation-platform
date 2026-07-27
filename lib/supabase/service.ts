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
