import "server-only";

import { requireClientContext } from "@/lib/tenants/client-context";
import { resolveCurrentTenant } from "@/lib/tenants/current-tenant";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function requireImageGenerationContext() {
  const auth = await requireClientContext();
  if (!auth.ok) return auth;
  const resolved = await resolveCurrentTenant(auth.supabase, auth.userId);
  if (!resolved.active) return { ok: false as const, status: 403, error: "Workspace membership is required" };
  return {
    ok: true as const,
    userId: auth.userId,
    tenantId: resolved.active.tenantId,
    supabase: auth.supabase,
    service: createSupabaseServiceClient(),
  };
}
