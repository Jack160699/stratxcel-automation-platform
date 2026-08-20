import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  schedulerCanRun,
  stableFingerprint,
  runContinuousGrowthLoop,
  evaluateGrowthCycleEligibility,
  type RuntimePlan,
} from "@stratxcel/search-discovery";
import { isPlanTier } from "@stratxcel/payments-and-wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleSchedulerInvocation(request: Request) {
  if (!schedulerCanRun()) {
    return Response.json({ error: "SEARCH_SCHEDULER_DISABLED" }, { status: 503 });
  }

  const secret = process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "SEARCH_SCHEDULER_UNAUTHORIZED" }, { status: 401 });
  }

  const { supabase } = getTenantServiceContext();
  const { data: projects, error } = await supabase
    .from("search_projects")
    .select("id,tenant_id,property_url,name")
    .eq("enabled", true)
    .limit(25);

  if (error) {
    return Response.json({ error: "SEARCH_SCHEDULER_PROJECTS_FAILED" }, { status: 500 });
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const results = [];

  for (const project of projects ?? []) {
    // 1. Fetch Subscription Tier
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("plan_tier, status")
      .eq("tenant_id", project.tenant_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tier = subscription?.plan_tier;

    // Free tiers and inactive subscriptions are strictly excluded from expensive growth cycles
    if (!tier || tier === "free" || !isPlanTier(tier) || subscription?.status !== "active") {
      continue;
    }

    // 2. Fetch Last Completed Growth Cycle State
    const { data: strategyState } = await supabase
      .from("search_strategy_states")
      .select("last_evaluated_at")
      .eq("tenant_id", project.tenant_id)
      .eq("project_id", project.id)
      .maybeSingle();

    // 3. CANONICAL 3-DAY CADENCE CHECK (Identical 3-day period across Starter, Growth, Business)
    const eligibility = evaluateGrowthCycleEligibility({
      tenantId: project.tenant_id,
      projectId: project.id,
      planTier: tier,
      lastCompletedRunAt: strategyState?.last_evaluated_at,
      currentTime: now,
    });

    if (!eligibility.isEligible) {
      results.push({
        tenantId: project.tenant_id,
        projectId: project.id,
        status: "NOT_DUE",
        daysSinceLastRun: eligibility.daysSinceLastRun,
        nextRunAt: eligibility.nextRunAt,
        reason: eligibility.reason,
      });
      continue; // Skip expensive crawler, LLM, and SERP operations
    }

    const plan: RuntimePlan = tier as RuntimePlan;
    const idempotencyKey = stableFingerprint([eligibility.cycleKey, tier]);

    try {
      const loopResult = await runContinuousGrowthLoop(
        { db: supabase },
        {
          tenantId: project.tenant_id,
          propertyUrl: project.property_url,
          propertyName: project.name,
          plan,
          idempotencyKey,
        }
      );

      results.push({
        tenantId: project.tenant_id,
        projectId: project.id,
        status: "COMPLETED",
        strategyMode: loopResult.strategyMode,
        movementStatus: loopResult.movementStatus,
        alertsCount: loopResult.alerts.length,
        nextDueAt: eligibility.nextRunAt,
      });
    } catch (err) {
      results.push({
        tenantId: project.tenant_id,
        projectId: project.id,
        status: "FAILED",
        error: err instanceof Error ? err.message : "Growth loop run failed",
      });
    }
  }

  return Response.json({
    growthCadence: "EVERY_3_DAYS",
    processedCount: results.length,
    executedCount: results.filter((r) => r.status === "COMPLETED").length,
    skippedNotDueCount: results.filter((r) => r.status === "NOT_DUE").length,
    date: dateStr,
    results,
  });
}

export async function GET(request: Request) {
  return handleSchedulerInvocation(request);
}

export async function POST(request: Request) {
  return handleSchedulerInvocation(request);
}
