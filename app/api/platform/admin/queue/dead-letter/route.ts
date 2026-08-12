import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { createPostgresQueueAdapter } from "@stratxcel/queue";
import { recordAuditEvent } from "@stratxcel/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dead-letter inspection and requeue for platform staff. requeueDeadLetter
 * is tenant-scoped and idempotent (see queue_internal.requeue_dead_letter_job)
 * — replaying this call never double-requeues or reaches into another
 * tenant's job, even if the caller supplies the wrong jobId.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase } = getTenantServiceContext();
  const queue = createPostgresQueueAdapter(supabase);
  const jobs = await queue.listDeadLetter(tenantId);
  return Response.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { tenantId, jobId, reason } = body as { tenantId?: string; jobId?: string; reason?: string };

  if (!tenantId || !jobId || !reason?.trim()) {
    return Response.json({ error: "tenantId, jobId, and reason are required" }, { status: 400 });
  }

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase } = getTenantServiceContext();
  const queue = createPostgresQueueAdapter(supabase);
  try {
    const job = await queue.requeueDeadLetter({ jobId, tenantId });
    await recordAuditEvent(supabase, {
      tenantId,
      actorUserId: ctx.userId,
      actorKind: "user",
      action: "queue.dead_letter_requeued",
      targetType: "queue_job",
      targetId: jobId,
      metadata: { reason: reason.trim(), previousStatus: "DEAD_LETTER" },
    });
    return Response.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to requeue job";
    const status = msg.includes("tenant_mismatch") ? 403 : 500;
    return Response.json({ error: msg }, { status });
  }
}
