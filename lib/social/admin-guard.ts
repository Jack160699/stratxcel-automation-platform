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

/**
 * Server-side connector authorization check. Allows platform staff/admins,
 * allowlisted test users, or tenant members with owner/admin role.
 */
export async function requireConnectorEligibleUser(tenantId?: string | null): Promise<
  | { ok: true; userId: string; email: string | null; isTestUser: boolean }
  | { ok: false; status: 401 | 403; error: string; code?: "TESTING_ACCESS_REQUIRED" }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, status: 401, error: "Not authenticated" };

  const email = (user.email ?? "").trim().toLowerCase();

  // 1. Platform admin check
  const { data: adminRow } = await supabase
    .from("stratxcel_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminRow) {
    return { ok: true, userId: user.id, email: user.email ?? null, isTestUser: true };
  }

  // 2. Allowlisted test users
  const testEmails = (process.env.CONNECTOR_TEST_USER_EMAILS ?? process.env.TEST_USER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (email && testEmails.includes(email)) {
    return { ok: true, userId: user.id, email: user.email ?? null, isTestUser: true };
  }

  // 3. Workspace owner/admin role check
  if (tenantId) {
    const { data: member } = await supabase
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (member && (member.role === "owner" || member.role === "admin")) {
      return { ok: true, userId: user.id, email: user.email ?? null, isTestUser: true };
    }
  }

  return { ok: false, status: 403, error: "Testing access required for this connector.", code: "TESTING_ACCESS_REQUIRED" };
}
