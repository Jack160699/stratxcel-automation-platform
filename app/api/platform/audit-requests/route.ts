import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";
import { getTenantServiceContext } from "../../../../lib/tenants/tenant-context.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Platform Admin visibility for Public Audit Requests.
 * Requires user authentication.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
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
