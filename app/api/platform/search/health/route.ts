import { NextResponse } from "next/server";
import { runGoLiveSystemHealthCheck, evaluateLaunchGate, getSchedulerHealthStatus } from "@stratxcel/search-discovery";

/**
 * Internal Production Readiness & Launch Health Endpoint
 * GET /api/platform/search/health
 */
export async function GET() {
  try {
    const health = runGoLiveSystemHealthCheck();
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
