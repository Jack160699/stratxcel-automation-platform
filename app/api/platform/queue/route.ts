import { requireTenantContext } from "@/lib/tenants/tenant-context";
import { requirePermission, PermissionDeniedError } from "@/lib/rbac/policy";
import { createPostgresQueueAdapter } from "@stratxcel/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Queue status for the admin dashboard's "queue status / failed and
 * dead-letter jobs" view — read-only, never exposes a mutation endpoint
 * (claim/complete/fail/cancel stay worker-only via the queue_internal
 * SQL functions, never reachable from a user-facing route). Covered by
 * queue_jobs_tenant_read RLS (see supabase/migrations/20260803130000_queue.sql)
 * — runs on the authenticated session client, not the service-role client.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  try {
    requirePermission(ctx.role, "mission:view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const queue = createPostgresQueueAdapter(ctx.supabase);

  const [jobs, deadLetter] = await Promise.all([queue.listForTenant(tenantId, 100), queue.listDeadLetter(tenantId, 50)]);

  return Response.json({ jobs, deadLetter }, { headers: { "Cache-Control": "no-store" } });
}
