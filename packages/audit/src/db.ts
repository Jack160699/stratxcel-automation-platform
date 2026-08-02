import { createClient } from "@supabase/supabase-js";

/**
 * Each Phase 3 workspace package owns its own tiny service-role client
 * factory rather than importing the main app's lib/supabase/service.ts —
 * that file lives inside the Next.js app and pulling it in would make
 * standalone apps (whatsapp-worker, mission-worker) depend on the
 * dashboard app itself just to talk to Postgres. This ~10-line factory is
 * deliberately duplicated per package instead.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ServiceClient = ReturnType<typeof createServiceClient>;
