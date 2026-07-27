import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server-side admin check shared by every Social Autopilot API route and
 * server action. Mirrors app/admin/page.tsx's gate (stratxcel_admins), but
 * as a reusable helper that returns a typed result instead of a redirect —
 * API routes need a 401/403, not a page redirect.
 */
export async function requireAdmin(): Promise<
  | { ok: true; userId: string; email: string | null }
  | { ok: false; status: 401 | 403; error: string }
> {
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

  return { ok: true, userId: user.id, email: user.email ?? null };
}
