/**
 * In-app Feedback (mission item 5) — replaces the old "Send Feedback" flow
 * that redirected out to the public /contact form. Writes straight into the
 * existing `stratxcel_contact_messages` table, the same table the public
 * contact form (app/actions/contact.ts) and the admin Leads inbox
 * (app/admin/(shell)/leads/page.tsx) already use — no new table, no new
 * admin UI, no redirect. Rows land with source "customer_app_feedback" so
 * they're distinguishable from website contact-form submissions but still
 * show up in the existing admin inbox immediately.
 */
import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { tenantId?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tenantId = typeof body.tenantId === "string" ? body.tenantId : null;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });
  if (message.length < 3 || message.length > 5000) {
    return Response.json({ error: "Tell us a little more before sending." }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();

  const { data: tenantRow } = await ctx.supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const tenantName = (tenantRow?.name as string | undefined) ?? null;
  const email = user?.email ?? null;

  const service = createSupabaseServiceClient();
  const { error } = await service.from("stratxcel_contact_messages").insert({
    name: tenantName ?? email ?? "StratXcel App user",
    email: email ?? "unknown@stratxcel.in",
    company: tenantName,
    message,
    source: "customer_app_feedback",
  });

  if (error) {
    console.error("feedback insert failed:", error.message);
    return Response.json({ error: "Something broke on our side — try again in a minute." }, { status: 500 });
  }

  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
