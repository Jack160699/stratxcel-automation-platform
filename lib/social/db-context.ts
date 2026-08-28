import { createSupabaseServerClient } from "../supabase/server.ts";
import { createSupabaseServiceClient } from "../supabase/service.ts";

/**
 * Two data-access postures, matching the stratxcel schema's own RLS design:
 *
 * OWNER CONTEXT — the authenticated admin's own session (anon key + cookies).
 * RLS enforces `owner_id = auth.uid() AND EXISTS(stratxcel_admins)` on every
 * owner-scoped table (accounts, campaigns, brand profile, content, agent
 * sessions, inbox, provider configs, automation settings). Real DB-level
 * security, not just an application-level check — use this for every
 * user-initiated read/write.
 *
 * SERVICE CONTEXT — service-role key, bypasses RLS. Reserved for background
 * processes with no user session: the publishing worker, the OAuth token
 * exchange, webhook ingestion, and health/audit logging. This mirrors the
 * schema's own SELECT-only admin policies on social_publishing_jobs /
 * social_metrics / social_dead_letters / social_health_checks /
 * social_audit_events / social_webhook_events — those tables only accept
 * writes from a role that bypasses RLS by design.
 */

export interface OwnerContext {
  ok: true;
  ownerId: string;
  email: string | null;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

export interface OwnerContextError {
  ok: false;
  status: 401 | 403;
  error: string;
}

export async function requireOwnerContext(): Promise<OwnerContext | OwnerContextError> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, error: "Not authenticated" };

  const { data: adminRow } = await supabase
    .from("stratxcel_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) return { ok: false, status: 403, error: "Not authorized" };

  return { ok: true, ownerId: user.id, email: user.email ?? null, supabase };
}

export function getServiceContext() {
  return { supabase: createSupabaseServiceClient() };
}
