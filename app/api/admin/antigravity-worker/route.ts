import { requireAdmin } from "@/lib/social/admin-guard";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { getWorkerHealth } from "@stratxcel/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { supabase } = getTenantServiceContext();

  try {
    const healthReport = await getWorkerHealth(supabase as never, "antigravity-worker");

    // Fetch recent coding jobs from queue_jobs
    const { data: recentJobs, error: jobsErr } = await supabase
      .from("queue_jobs")
      .select("id, tenant_id, job_type, payload, status, created_at, completed_at, last_error")
      .eq("job_type", "mission.coding_task")
      .order("created_at", { ascending: false })
      .limit(10);

    const isOnline = healthReport.status === "healthy";
    const primaryInstance = healthReport.instances[0] ?? null;

    return Response.json({
      status: isOnline ? (primaryInstance?.status === "busy" ? "busy" : "online") : "offline",
      health: healthReport.status,
      reason: healthReport.reason ?? null,
      machineId: primaryInstance?.instanceId ?? "founder-win11",
      antigravityVersion: primaryInstance?.version ?? "1.107.0",
      capabilities: [
        "antigravity.code",
        "antigravity.run_task",
        "antigravity.workspace",
        "git.diff",
        "git.commit",
        "npm.test",
      ],
      authorizedWorkspaces: [
        {
          name: "StratXcel Platform",
          companyId: "stratxcel",
          rootPath: "D:\\c drive backup\\stratxcel-automation-platform",
          allowedBranches: ["main", "master", "develop", "feat/*", "fix/*", "mission/*"],
          status: "AUTHORIZED",
        },
        {
          name: "Isolated Sandbox",
          companyId: "sandbox",
          rootPath: "D:\\c drive backup\\stratxcel-automation-platform\\scratch\\antigravity-sandbox",
          allowedBranches: ["*"],
          status: "AUTHORIZED",
        },
      ],
      instances: healthReport.instances,
      recentJobs: recentJobs ?? [],
      lastCheckedAt: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        status: "error",
        error: (err as Error).message,
      },
      { status: 500 }
    );
  }
}
