import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  schedulerCanRun,
  stableFingerprint,
  runContinuousGrowthLoop,
  evaluateGrowthCycleEligibility,
  type RuntimePlan,
} from "@stratxcel/search-discovery";
import { isPlanTier } from "@stratxcel/payments-and-wallet";
import { resolveAccessToken, refreshToken as refreshSocialToken } from "@/lib/social/audit-connector-insights";
import {
  googleBusinessProvider,
  isResolvedGbpLocationResourceName,
  listLocationReviews,
  replyToLocationReview,
  getAccountVerificationState,
  normalizeGoogleVerificationState,
} from "@/lib/social/providers/google-business";
import { mergeAccountMetadata } from "@/lib/social/repositories/accounts";
import { runReviewBotCycle } from "@/lib/google/review-bot-cycle";

/**
 * Review Bot is deliberately hosted on this existing, already-authenticated
 * daily cron rather than a new one (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
 * Update 12) — this route already sits outside the queue_jobs/Hermes job-
 * ownership matrix entirely (a bearer-secret Vercel cron, same pattern as
 * the audit worker), so extending it adds no new cron slot and violates no
 * job-ownership contract. Reviews get a daily cadence (this cron's own
 * frequency) independent of the 3-day search-growth cycle below — a
 * negative review waiting 3 days for a reply is a worse outcome than the
 * SEO/AEO/GEO cadence tolerates for its own work.
 */
async function runReviewBotForTenant(
  supabase: ReturnType<typeof getTenantServiceContext>["supabase"],
  input: { tenantId: string; businessName: string }
): Promise<
  | { status: "SKIPPED_NOT_CONNECTED" }
  | { status: "SKIPPED_UNRESOLVED_LOCATION" | "SKIPPED_TOKEN_UNAVAILABLE" }
  | { status: "COMPLETED"; discovered: number; autoReplied: number; escalated: number; alreadyProcessed: number; failed: number }
  | { status: "FAILED"; error: string }
> {
  const { data: gbpAccount } = await supabase
    .from("social_accounts")
    .select("id, provider_account_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("platform", "google_business")
    .maybeSingle();

  if (!gbpAccount || gbpAccount.status !== "CONNECTED") {
    return { status: "SKIPPED_NOT_CONNECTED" };
  }
  // Same guard as canonical-status.ts / gatherGoogleBusiness — a CONNECTED
  // row whose provider_account_id was never resolved to a real
  // accounts/{id}/locations/{id} resource must never reach a live Reviews
  // call. Real fix requires the customer to reconnect (Update 10); this
  // must never guess a resource name or attempt the doomed call.
  if (!isResolvedGbpLocationResourceName(gbpAccount.provider_account_id)) {
    return { status: "SKIPPED_UNRESOLVED_LOCATION" };
  }

  const tokens = await resolveAccessToken(supabase, gbpAccount.id);
  if (!tokens) return { status: "SKIPPED_TOKEN_UNAVAILABLE" };

  const attempt = async (accessToken: string) =>
    runReviewBotCycle(
      { db: supabase, listReviews: listLocationReviews, replyToReview: replyToLocationReview },
      {
        tenantId: input.tenantId,
        socialAccountId: gbpAccount.id,
        locationResourceName: gbpAccount.provider_account_id,
        accessToken,
        businessName: input.businessName,
      }
    );

  try {
    return await attempt(tokens.accessToken);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401 && tokens.refreshToken) {
      const fresh = await refreshSocialToken(supabase, gbpAccount.id, tokens.refreshToken, googleBusinessProvider);
      if (fresh) {
        try {
          return await attempt(fresh);
        } catch (err2) {
          return { status: "FAILED", error: err2 instanceof Error ? err2.message : "Review bot cycle failed after token refresh." };
        }
      }
      return { status: "SKIPPED_TOKEN_UNAVAILABLE" };
    }
    return { status: "FAILED", error: err instanceof Error ? err.message : "Review bot cycle failed." };
  }
}

/**
 * Automatic Google Business verification recheck (STRATXCEL — GOOGLE
 * BUSINESS AUTONOMOUS SETUP brief, Sections 11/20: "the existing scheduled
 * growth system should periodically recheck verification state" / "do not
 * create another scheduler if the existing scheduler can perform this"). A
 * customer who completes Google's own verification
 * (business.google.com/locations, entirely outside StratXcel) has no
 * reason to ever run this codebase's OAuth flow again -- without this, the
 * google_verification_state captured once at connect-time
 * (google-business.ts's exchangeCodeForToken) would sit stale forever, and
 * canonical-status.ts would keep showing "Verification required" to a
 * customer Google has already verified. Hosted on this exact same
 * already-authenticated daily cron as the Review Bot above, for the same
 * reason (no new cron slot, no new job-ownership-matrix entry) -- and only
 * for tenants already in this route's tenant loop (real, pre-existing scope
 * limit this cron already accepts for the Review Bot; not a new one).
 * Never runs for a connection whose verification is already the terminal
 * VERIFIED state (nothing left to learn), whose location never resolved,
 * or that has no known account context to check.
 */
async function recheckGoogleVerificationForTenant(
  supabase: ReturnType<typeof getTenantServiceContext>["supabase"],
  tenantId: string
): Promise<
  | { status: "SKIPPED_NOT_CONNECTED" | "SKIPPED_UNRESOLVED_LOCATION" | "SKIPPED_NO_ACCOUNT_CONTEXT" | "SKIPPED_ALREADY_VERIFIED" | "SKIPPED_TOKEN_UNAVAILABLE" }
  | { status: "UNCHANGED" | "UPDATED"; state: string }
  | { status: "FAILED"; error: string }
> {
  const { data: gbpAccount } = await supabase
    .from("social_accounts")
    .select("id, provider_account_id, status, metadata")
    .eq("tenant_id", tenantId)
    .eq("platform", "google_business")
    .maybeSingle();

  if (!gbpAccount || gbpAccount.status !== "CONNECTED") return { status: "SKIPPED_NOT_CONNECTED" };
  if (!isResolvedGbpLocationResourceName(gbpAccount.provider_account_id)) return { status: "SKIPPED_UNRESOLVED_LOCATION" };

  const meta = (gbpAccount.metadata ?? {}) as Record<string, unknown>;
  const currentState = normalizeGoogleVerificationState(meta.google_verification_state);
  if (currentState === "VERIFIED") return { status: "SKIPPED_ALREADY_VERIFIED" };

  // Real "accounts/{id}" resource this connection's own discovery already
  // resolved and stored (google-business.ts's exchangeCodeForToken / the
  // google-business probe route) -- never guessed or re-parsed from the
  // location resource name, which (per this file's own updated
  // isResolvedGbpLocationResourceName) can legitimately be a bare
  // "locations/{id}" with no account segment to extract at all.
  const accountName = typeof meta.account_name === "string" ? meta.account_name : null;
  if (!accountName) return { status: "SKIPPED_NO_ACCOUNT_CONTEXT" };

  const tokens = await resolveAccessToken(supabase, gbpAccount.id);
  if (!tokens) return { status: "SKIPPED_TOKEN_UNAVAILABLE" };

  const attempt = (accessToken: string) => getAccountVerificationState(accessToken, accountName);

  let raw: string | null;
  try {
    raw = await attempt(tokens.accessToken);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401 && tokens.refreshToken) {
      const fresh = await refreshSocialToken(supabase, gbpAccount.id, tokens.refreshToken, googleBusinessProvider);
      if (!fresh) return { status: "SKIPPED_TOKEN_UNAVAILABLE" };
      try {
        raw = await attempt(fresh);
      } catch (err2) {
        return { status: "FAILED", error: err2 instanceof Error ? err2.message : "Verification recheck failed after token refresh." };
      }
    } else {
      return { status: "FAILED", error: err instanceof Error ? err.message : "Verification recheck failed." };
    }
  }

  const newState = normalizeGoogleVerificationState(raw);
  if (newState === currentState) return { status: "UNCHANGED", state: newState };

  await mergeAccountMetadata(supabase, gbpAccount.id, { google_verification_state: raw });
  return { status: "UPDATED", state: newState };
}

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

    // Review Bot runs on this same daily tick, independent of the 3-day
    // search-growth eligibility check below — see runReviewBotForTenant's
    // own header comment for why this cron (not a new one) is the correct
    // host. Computed once here so every branch below (NOT_DUE,
    // state-lookup-failed, COMPLETED, FAILED) can report it without
    // silently dropping the outcome.
    const reviewBotResult = await runReviewBotForTenant(supabase, { tenantId: project.tenant_id, businessName: project.name });
    const verificationRecheckResult = await recheckGoogleVerificationForTenant(supabase, project.tenant_id);

    // 2. Fetch Last Completed Growth Cycle State
    //
    // Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
    // search_strategy_states does not exist in the real production
    // database (confirmed directly against the live schema -- its
    // migration, 20260820060000_search_growth_loop_and_aeo.sql, was never
    // applied). The query error was previously discarded, so a real query
    // failure looked identical to "this tenant has never run before",
    // which evaluateGrowthCycleEligibility treats as immediately DUE --
    // meaning the real, live, daily cron has been running the full
    // expensive AI/crawl/SERP growth cycle for every eligible paid tenant
    // EVERY DAY instead of the intended once-per-3-days, silently, with no
    // error surfaced anywhere. Fixed to fail toward the SAFE, cheap
    // direction (skip this tenant this run) on a real lookup error,
    // instead of the expensive direction (always due).
    const { data: strategyState, error: strategyStateError } = await supabase
      .from("search_strategy_states")
      .select("last_evaluated_at")
      .eq("tenant_id", project.tenant_id)
      .eq("project_id", project.id)
      .maybeSingle();

    if (strategyStateError) {
      results.push({
        tenantId: project.tenant_id,
        projectId: project.id,
        status: "SKIPPED_STATE_LOOKUP_FAILED",
        error: strategyStateError.message,
        reviewBot: reviewBotResult,
        verificationRecheck: verificationRecheckResult,
      });
      continue; // Fail safe: never treat an unreadable cadence state as "due" -- that's the expensive direction.
    }

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
        reviewBot: reviewBotResult,
        verificationRecheck: verificationRecheckResult,
      });
      continue; // Skip expensive crawler, LLM, and SERP operations
    }

    const plan: RuntimePlan = tier as RuntimePlan;
    const idempotencyKey = stableFingerprint([eligibility.cycleKey, tier]);

    // Real, cheap signal for entity-consistency analysis (see
    // packages/search-discovery/src/authority/entity-graph.ts) -- a
    // connected Google Business Profile row, not assumed. Query failure
    // (including "no such row") is treated as honestly unknown (false),
    // never fabricated as true.
    const { data: gbpAccount } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("tenant_id", project.tenant_id)
      .eq("platform", "google_business")
      .maybeSingle();

    try {
      const loopResult = await runContinuousGrowthLoop(
        { db: supabase },
        {
          tenantId: project.tenant_id,
          propertyUrl: project.property_url,
          propertyName: project.name,
          plan,
          idempotencyKey,
          hasGbp: Boolean(gbpAccount),
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
        reviewBot: reviewBotResult,
        verificationRecheck: verificationRecheckResult,
      });
    } catch (err) {
      results.push({
        tenantId: project.tenant_id,
        projectId: project.id,
        status: "FAILED",
        error: err instanceof Error ? err.message : "Growth loop run failed",
        reviewBot: reviewBotResult,
        verificationRecheck: verificationRecheckResult,
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
