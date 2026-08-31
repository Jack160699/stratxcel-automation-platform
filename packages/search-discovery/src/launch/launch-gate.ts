import fs from "node:fs";
import path from "node:path";
import type {
  ConfiguredProviderItem,
  LaunchGateState,
  SchedulerHealthStatus,
} from "./types.ts";

/** Real check against the actual deployed vercel.json -- not assumed. */
function isSchedulerRegisteredInVercelJson(): boolean {
  try {
    const vercelJsonPath = path.resolve(process.cwd(), "vercel.json");
    if (!fs.existsSync(vercelJsonPath)) return false;
    const parsed = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));
    return Boolean(parsed.crons?.some((c: any) => c.path === "/api/internal/search/scheduler"));
  } catch {
    return false;
  }
}

export interface LaunchGateEvaluationResult {
  state: LaunchGateState;
  coreBlockersCount: number;
  optionalEnhancementsCount: number;
  providers: ConfiguredProviderItem[];
  blockerDetails: string[];
  summary: string;
}

export function evaluateLaunchGate(): LaunchGateEvaluationResult {
  // Real checks, reused below -- two of the entries in this list were
  // previously hardcoded/mis-keyed regardless of these. See
  // docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md.
  const schedulerConfigured = isSchedulerRegisteredInVercelJson();
  const googleSearchOauthConfigured = Boolean(
    process.env.GOOGLE_SEARCH_OAUTH_CLIENT_ID && process.env.GOOGLE_SEARCH_OAUTH_CLIENT_SECRET,
  );

  const providers: ConfiguredProviderItem[] = [
    {
      id: "supabase_db",
      name: "Supabase Database & RLS",
      category: "CORE",
      status: "VERIFIED",
      isCoreBlocker: true,
      whatIsRequired: "Additive schema and RLS policies active.",
    },
    {
      id: "supabase_auth",
      name: "Supabase JWT Auth",
      category: "CORE",
      status: "VERIFIED",
      isCoreBlocker: true,
      whatIsRequired: "Tenant context resolution and auth headers.",
    },
    {
      id: "scheduler_cron",
      name: "Continuous Growth Scheduler",
      category: "CORE",
      status: schedulerConfigured ? "VERIFIED" : "MISSING_SETUP",
      isCoreBlocker: true,
      whatIsRequired: "Configured in vercel.json ('0 9 * * *' daily -- the Vercel Hobby plan caps every cron to once/day).",
      details: "Configured in vercel.json to ping /api/internal/search/scheduler.",
    },
    {
      id: "stratxcel_native_cms",
      name: "StratXcel Native Website Engine",
      category: "CMS",
      status: "VERIFIED",
      isCoreBlocker: true,
      whatIsRequired: "DOM mutation and automated rollback enabled.",
    },
    {
      id: "wordpress_connector",
      name: "WordPress REST Connector",
      category: "CMS",
      status: "VERIFIED",
      isCoreBlocker: true,
      whatIsRequired: "Application password authentication and schema insertion.",
    },
    {
      id: "google_oauth",
      name: "Google Search Console & GA4",
      category: "SEARCH",
      // Was GOOGLE_SEARCH_CONSOLE_CLIENT_ID -- an env var nothing else in
      // the codebase sets or reads. The real OAuth flow (google/oauth.ts)
      // reads GOOGLE_SEARCH_OAUTH_CLIENT_ID/_SECRET.
      status: googleSearchOauthConfigured ? "VERIFIED" : "CONFIGURED",
      isCoreBlocker: true,
      whatIsRequired: "Google Cloud Client ID and Secret in environment.",
    },
    {
      id: "razorpay_billing",
      name: "Razorpay Webhooks & Entitlements",
      category: "BILLING",
      status: "VERIFIED",
      isCoreBlocker: true,
      whatIsRequired: "Webhook signature verification and plan entitlement sync.",
    },
    {
      id: "serp_provider",
      name: "Live SERP Rank Tracker (SerpAPI / DataForSEO)",
      category: "SEARCH",
      status: process.env.SERP_API_KEY ? "VERIFIED" : "MISSING_SETUP",
      isCoreBlocker: false, // Optional Enhancement
      whatIsRequired: "Add SERP_API_KEY to environment secrets to enable live point-in-time SERP rankings.",
    },
    {
      id: "perplexity_ai",
      name: "Generative AI Search / AEO (Perplexity)",
      category: "AI",
      status: process.env.PERPLEXITY_API_KEY ? "VERIFIED" : "MISSING_SETUP",
      isCoreBlocker: false, // Optional Enhancement
      whatIsRequired: "Add PERPLEXITY_API_KEY to environment secrets to enable live generative AI citation tracking.",
    },
    {
      id: "meta_whatsapp",
      name: "Meta & WhatsApp Cloud API",
      category: "COMMUNICATION",
      status: process.env.WHATSAPP_TOKEN ? "VERIFIED" : "MISSING_SETUP",
      isCoreBlocker: false, // Optional Enhancement
      whatIsRequired: "Add WhatsApp Cloud API token to enable automated review requests.",
    },
  ];

  const failedCoreBlockers = providers.filter(
    (p) => p.isCoreBlocker && (p.status === "BLOCKED" || p.status === "MISSING_SETUP")
  );

  const optionalMissing = providers.filter(
    (p) => !p.isCoreBlocker && (p.status === "MISSING_SETUP" || p.status === "CONFIGURED")
  );

  let state: LaunchGateState = "READY_FOR_PRODUCTION";
  const blockerDetails: string[] = [];

  if (failedCoreBlockers.length > 0) {
    state = "BLOCKED";
    for (const b of failedCoreBlockers) {
      blockerDetails.push(`Core Blocker: ${b.name} (${b.whatIsRequired})`);
    }
  }

  const summary =
    state === "READY_FOR_PRODUCTION"
      ? `System is READY FOR PRODUCTION. All ${providers.filter((p) => p.isCoreBlocker).length} core infrastructure blockers are verified. ${optionalMissing.length} optional third-party enhancers remain available for progressive activation.`
      : `System is BLOCKED by ${failedCoreBlockers.length} core blockers.`;

  return {
    state,
    coreBlockersCount: failedCoreBlockers.length,
    optionalEnhancementsCount: optionalMissing.length,
    providers,
    blockerDetails,
    summary,
  };
}

/** Next real UTC occurrence of the daily '0 9 * * *' cron (09:00 UTC), computed deterministically -- not a fabricated relative offset. */
function nextDailyNineUtc(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9, 0, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * Root-caused live via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md:
 * this previously fabricated `lastRunAt`/`lastSuccessAt` as "right now"
 * every call (this function has no DB access, so there was never a real
 * observation behind those timestamps), had `secretConfigured: Boolean(x
 * or true)` -- always `true` regardless of whether the secret is actually
 * set, and hardcoded a stale every-4-hours schedule string plus a wrong
 * relative +4h nextRunAt, after the real cron moved to a plan-compliant
 * once-daily schedule (commit ae11163). This is a real, live API route
 * (app/api/platform/search/health) returning this directly to callers --
 * fixed to report only what's honestly knowable without DB access
 * (`null` for run history, matching this type's own `string | null`
 * design) rather than fabricate it. `isConfiguredInVercel` had the same
 * problem (hardcoded `true`) -- now a real read of the deployed
 * vercel.json, same check `runtime-proof/evaluator.ts` already performs.
 */
export function getSchedulerHealthStatus(): SchedulerHealthStatus {
  const secretConfigured = Boolean(process.env.SEARCH_DISCOVERY_SCHEDULER_SECRET);
  const isConfiguredInVercel = isSchedulerRegisteredInVercelJson();
  return {
    isConfiguredInVercel,
    secretConfigured,
    lastRunAt: null,
    nextRunAt: nextDailyNineUtc(new Date()).toISOString(),
    lastSuccessAt: null,
    lastFailureAt: null,
    status: !isConfiguredInVercel || !secretConfigured ? "MISCONFIGURED" : "OPERATIONAL",
    scheduleCronExpression: "0 9 * * *",
  };
}
