import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const staff = await requirePlatformStaff(user.id, ["platform_owner", "platform_admin", "audit_reviewer"]);
  if (!staff.ok) return Response.json({ error: staff.error }, { status: staff.status });

  const body = await request.json().catch(() => ({})) as { runId?: unknown; action?: unknown; reason?: unknown };
  if (body.action === "reset_eligibility") {
    if (!["platform_owner", "platform_admin"].includes(staff.staff.role)) {
      return Response.json({ error: "Owner or admin authorization is required." }, { status: 403 });
    }
    const service = getTenantServiceContext().supabase;
    const { data, error } = await service.rpc("reset_audit_product_eligibility_v1", {
      p_actor_user_id: user.id,
      p_reason: typeof body.reason === "string" ? body.reason : "product_reset",
    });
    if (error) {
      console.error("audit reset RPC failed", error.message);
      return Response.json({ error: "Could not reset Audit eligibility" }, { status: 500 });
    }
    const result = data as { success?: boolean; reason?: string; snapshot_id?: string; tenants_granted?: number } | null;
    if (result?.success !== true) {
      return Response.json({ error: `Reset rejected: ${result?.reason ?? "unknown_reason"}` }, { status: 409 });
    }
    return Response.json({ ok: true, snapshotId: result.snapshot_id, tenantsGranted: result.tenants_granted });
  }
  if (body.action !== "retry") {
    return Response.json({ error: "Unsupported recovery action" }, { status: 400 });
  }
  if (typeof body.runId !== "string" || !UUID.test(body.runId)) {
    return Response.json({ error: "A valid generation run is required" }, { status: 400 });
  }

  const service = getTenantServiceContext().supabase;
  const { data, error } = await service.rpc("retry_automatic_audit_generation_v1", {
    p_run_id: body.runId,
    p_actor_user_id: user.id,
  });
  if (error) {
    console.error("audit recovery RPC failed", error.message);
    return Response.json({ error: "Could not queue Audit recovery" }, { status: 500 });
  }
  const result = data as { success?: boolean; reason?: string; queue_job_id?: string } | null;
  if (result?.success !== true) {
    return Response.json(
      { error: `Audit recovery rejected: ${result?.reason ?? "unknown_reason"}` },
      { status: 409 },
    );
  }
  return Response.json(
    { ok: true, queueJobId: result.queue_job_id },
    { headers: { "Cache-Control": "no-store" } },
  );
}
