import { requireTenantContext, getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { requirePlatformStaff } from "@/lib/platform-staff/auth";
import { getWorkerHealth, type WorkerType } from "@stratxcel/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_TYPES: WorkerType[] = ["mission-worker", "whatsapp-worker", "hermes-gateway"];

/**
 * Cross-tenant operational visibility for staff — the same worker-health
 * report each app's own /health endpoint returns, aggregated here for
 * admin dashboards that can't reach the workers' own network directly.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId query param is required" }, { status: 400 });

  const ctx = await requireTenantContext(tenantId);
  if (!ctx.ok) return Response.json({ error: ctx.error }, { status: ctx.status });

  const staffAuth = await requirePlatformStaff(ctx.userId, ["platform_owner", "platform_admin"]);
  if (!staffAuth.ok) return Response.json({ error: staffAuth.error }, { status: staffAuth.status });

  const { supabase } = getTenantServiceContext();
  const reports = await Promise.all(WORKER_TYPES.map((type) => getWorkerHealth(supabase, type)));
  return Response.json({ workers: reports }, { headers: { "Cache-Control": "no-store" } });
}
