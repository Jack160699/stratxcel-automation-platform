import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";
import { getTenantServiceContext } from "../../../../lib/tenants/tenant-context.ts";
import { requirePlatformStaff } from "../../../../lib/platform-staff/auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Platform Admin visibility for Public Audit Requests.
 * Requires platform-staff authorization (platform_owner / platform_admin /
 * audit_reviewer) — this table holds prospect PII (name, email, phone,
 * goals, internal notes) for every visitor who ever submitted the public
 * free-audit form, so a plain "is logged in" check would let any customer
 * account read and edit every other lead. See also the matching RLS/grant
 * fix in supabase/migrations for the direct-PostgREST path.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const staffAuth = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin", "audit_reviewer"]);
  if (!staffAuth.ok) {
    return Response.json({ error: staffAuth.error }, { status: staffAuth.status });
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  const { data: requests, error } = await serviceDb
    .from("public_audit_requests")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ requests }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const staffAuth = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin", "audit_reviewer"]);
  if (!staffAuth.ok) {
    return Response.json({ error: staffAuth.error }, { status: staffAuth.status });
  }

  const body = await request.json().catch(() => ({}));
  const { id, status, internalNotes } = body;

  if (!id || !status) {
    return Response.json({ error: "id and status are required" }, { status: 400 });
  }

  const validStatuses = [
    "new",
    "contacted",
    "qualified",
    "paid",
    "audit_in_progress",
    "completed",
    "converted",
    "rejected",
  ];

  if (!validStatuses.includes(status)) {
    return Response.json({ error: `Invalid status: ${status}` }, { status: 400 });
  }

  const { supabase: serviceDb } = getTenantServiceContext();

  const updates: Record<string, unknown> = {
    status,
    ...(status === "contacted" ? { contacted_at: new Date().toISOString() } : {}),
    ...(internalNotes !== undefined ? { internal_notes: internalNotes } : {}),
  };

  const { data: updated, error } = await serviceDb
    .from("public_audit_requests")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ request: updated });
}
