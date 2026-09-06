import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";

/**
 * Shared staff gate for the Local AI connection admin routes -- the exact
 * pattern app/api/admin/whatsapp-agent/pairing/route.ts already uses
 * (session -> platform_staff_users, never trusted from request input).
 * platform_owner/platform_admin only: pairing hands the caller a real
 * production credential, the same bar StratXcel's own staff pairing-code
 * generation route already holds itself to.
 */
export async function requireLocalAIAdmin(): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Not authenticated" };

  const staffAuth = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return { ok: false, status: staffAuth.status, error: staffAuth.error };

  return { ok: true, userId: user.id };
}

/** Same convention as /api/social/package-producer's isAuthorized: CRON_SECRET bearer, fails closed if unset. */
export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}`;
}
