import { createSupabaseServiceClient } from "../supabase/service";
import { listAccountsService } from "./repositories/accounts";
import { recordHealthChecks } from "./repositories/system";

export type HealthStatus = "OPERATIONAL" | "DEGRADED" | "PAUSED" | "FAILED" | "NOT_CONFIGURED";

export interface HealthRecord {
  component: string;
  group: "social" | "ai" | "media" | "core" | "workers" | "webhooks";
  status: HealthStatus;
  message: string;
  latencyMs?: number;
}

const SOCIAL_PLATFORMS = ["instagram", "facebook", "threads", "linkedin", "youtube"] as const;

const AI_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

function effectiveOpenAIName() {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").toLocaleLowerCase();
  return base.includes("openrouter.ai") ? "openrouter" : "openai";
}

/**
 * Runs every health probe this product can honestly evaluate right now and
 * persists a snapshot row per component to social_health_checks. Nothing in
 * here fabricates a status — a provider with no credentials is reported
 * NOT_CONFIGURED, never OPERATIONAL.
 */
export async function runHealthChecks(): Promise<HealthRecord[]> {
  const service = createSupabaseServiceClient();
  const records: HealthRecord[] = [];

  // --- Core: database reachability ---
  const dbStart = Date.now();
  const { error: dbError } = await service.from("stratxcel_admins").select("user_id").limit(1);
  records.push({
    component: "database",
    group: "core",
    status: dbError ? "FAILED" : "OPERATIONAL",
    message: dbError ? dbError.message : "Supabase reachable",
    latencyMs: Date.now() - dbStart,
  });

  // --- Social accounts ---
  const accounts = await listAccountsService(service);
  for (const platform of SOCIAL_PLATFORMS) {
    const acct = accounts.find((a) => a.platform === platform);
    if (!acct) {
      records.push({ component: `social:${platform}`, group: "social", status: "NOT_CONFIGURED", message: "Not connected" });
      continue;
    }
    if (acct.status === "CONNECTED") {
      records.push({
        component: `social:${platform}`,
        group: "social",
        status: acct.token_health === "HEALTHY" ? "OPERATIONAL" : "DEGRADED",
        message: `Connected · token ${acct.token_health.toLowerCase()}`,
      });
    } else if (acct.status === "REAUTH_REQUIRED") {
      records.push({ component: `social:${platform}`, group: "social", status: "FAILED", message: "Reauthorization required" });
    } else {
      records.push({ component: `social:${platform}`, group: "social", status: "NOT_CONFIGURED", message: "Disconnected" });
    }
  }

  // --- AI providers: env-key presence only (never fabricate a live test) ---
  for (const [configuredProvider, envKey] of Object.entries(AI_ENV_KEYS)) {
    const configured = Boolean(process.env[envKey]);
    const provider = configuredProvider === "openai" && configured ? effectiveOpenAIName() : configuredProvider;
    records.push({
      component: `ai:${provider}`,
      group: "ai",
      status: configured ? "OPERATIONAL" : "NOT_CONFIGURED",
      message: configured ? "API key present" : `${envKey} not set`,
    });
  }

  // --- Media providers: same honesty rule, none wired yet ---
  records.push({
    component: "media:image_generation",
    group: "media",
    status: "NOT_CONFIGURED",
    message: "No image generation provider configured",
  });

  // --- Workers / queue ---
  const { data: jobCounts } = await service.from("social_publishing_jobs").select("status");
  const counts = (jobCounts ?? []).reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});
  const failed = counts.FAILED ?? 0;
  records.push({
    component: "workers:publishing",
    group: "workers",
    status: failed > 0 ? "DEGRADED" : "OPERATIONAL",
    message: `${counts.SCHEDULED ?? 0} scheduled, ${counts.RUNNING ?? 0} running, ${failed} failed`,
  });

  const cronConfigured = Boolean(process.env.CRON_SECRET);
  records.push({
    component: "scheduler:cron",
    group: "workers",
    status: cronConfigured ? "OPERATIONAL" : "NOT_CONFIGURED",
    message: cronConfigured ? "CRON_SECRET set — Vercel cron authorized" : "CRON_SECRET not set",
  });

  const { data: settingsRows } = await service.from("social_automation_settings").select("shadow_mode, autonomy_level");
  const anyLive = (settingsRows ?? []).some((s) => s.shadow_mode === false);
  records.push({
    component: "publishing_mode",
    group: "workers",
    status: anyLive ? "OPERATIONAL" : "PAUSED",
    message: anyLive ? "LIVE — at least one owner has shadow_mode off" : "SHADOW — every owner has shadow_mode on",
  });

  // --- Webhook receiver: verify token + per-provider signing secret presence,
  // plus whether anything has actually arrived (proves the Meta-side
  // subscription step, not just this app's own config) ---
  const verifyTokenConfigured = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN);
  records.push({
    component: "webhooks:receiver",
    group: "webhooks",
    status: verifyTokenConfigured ? "OPERATIONAL" : "NOT_CONFIGURED",
    message: verifyTokenConfigured ? "META_WEBHOOK_VERIFY_TOKEN set" : "META_WEBHOOK_VERIFY_TOKEN not set",
  });
  const { count: webhookEventCount } = await service.from("social_webhook_events").select("id", { count: "exact", head: true });
  records.push({
    component: "webhooks:events_received",
    group: "webhooks",
    status: webhookEventCount && webhookEventCount > 0 ? "OPERATIONAL" : "NOT_CONFIGURED",
    message: webhookEventCount && webhookEventCount > 0 ? `${webhookEventCount} event(s) received (lifetime)` : "No events received yet — Meta subscription likely not configured",
  });

  // Persist snapshot rows (best-effort; failure here shouldn't break the page)
  try {
    await recordHealthChecks(
      service,
      records.map((r) => ({ component: r.component, status: r.status, latencyMs: r.latencyMs, message: r.message }))
    );
  } catch {
    // non-fatal
  }

  return records;
}
