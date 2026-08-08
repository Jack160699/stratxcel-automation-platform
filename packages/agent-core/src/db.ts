import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for agent-core.
 *
 * Follows the same per-package pattern as packages/whatsapp/src/db.ts,
 * packages/audit/src/db.ts, etc. — this repo deliberately does not share a
 * single "core" db client across packages (see packages/whatsapp/src/flags.ts
 * comment). Never import this from browser/client code.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("agent-core: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ServiceClient = ReturnType<typeof createServiceClient>;
