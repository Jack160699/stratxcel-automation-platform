import { createSupabaseServerClient } from "../supabase/server";

/**
 * The /app equivalent of lib/social/db-context.ts's requireOwnerContext() —
 * same session-client pattern, but deliberately does NOT check
 * stratxcel_admins. /app is the client workspace; an ordinary tenant member
 * has no admin row and must never be required to have one. This is the
 * literal enforcement point for "clients never see /admin and /admin never
 * silently exposes to a client account" cutting the other way: /app's own
 * gate never grants anything based on staff status either — the two tables
 * (stratxcel_admins, tenant_members) stay two independent checks, per
 * docs/product-design/ROLE_AND_PERMISSION_EXPERIENCE.md §1.
 */
export interface ClientContext {
  ok: true;
  userId: string;
  email: string | null;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

export interface ClientContextError {
  ok: false;
  status: 401;
  error: string;
}

export async function requireClientContext(): Promise<ClientContext | ClientContextError> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, error: "Not authenticated" };

  return { ok: true, userId: user.id, email: user.email ?? null, supabase };
}
