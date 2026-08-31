import { NextResponse } from "next/server";
import { runGoLiveSystemHealthCheck, evaluateLaunchGate, getSchedulerHealthStatus } from "@stratxcel/search-discovery";
import { getTenantServiceContext } from "@/lib/tenants/tenant-context";

/**
 * Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
 * search_strategy_states (and 6 sibling tables from the same set of
 * migrations) do not exist in the real production database. A cheap,
 * real probe query, not an assumption -- Postgres reports a missing
 * relation with SQLSTATE 42P01.
 */
async function checkRequiredSearchTablesPresent(): Promise<boolean> {
  const { supabase } = getTenantServiceContext();
  const { error } = await supabase.from("search_strategy_states").select("tenant_id").limit(1);
  if (!error) return true;
  if (error.code === "42P01") return false;
  // A different error (permissions, network) doesn't prove the table is
  // missing -- don't claim FAIL on the strength of an unrelated failure.
  return true;
}

/**
 * Internal Production Readiness & Launch Health Endpoint
 * GET /api/platform/search/health
 */
export async function GET() {
  try {
    const requiredTablesPresent = await checkRequiredSearchTablesPresent();
    const health = runGoLiveSystemHealthCheck({ requiredTablesPresent });
    const gate = evaluateLaunchGate();
    const scheduler = getSchedulerHealthStatus();

    return NextResponse.json({
      success: true,
      platform: "StratXcel Search Growth OS",
      environment: process.env.NODE_ENV || "production",
      launchGate: gate.state,
      summary: gate.summary,
      coreBlockersCount: gate.coreBlockersCount,
      optionalEnhancementsCount: gate.optionalEnhancementsCount,
      healthReport: health,
      scheduler,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_HEALTH_CHECK_FAILED",
        details: err?.message || "Unknown error during health check",
      },
      { status: 500 }
    );
  }
}
