import { requireOwnerContext, getServiceContext } from "@/lib/social/db-context";
import { runHealthChecks, type HealthStatus } from "@/lib/social/health";
import { listAuditEvents } from "@/lib/social/repositories/system";
import { listJobs } from "@/lib/social/repositories/publishing";
import { runWorkerNowAction, runTenantContentBackfillAction, forceRegeneratePackageItemImageAction, forcePublishQueueItemNowAction } from "../actions";
import { assessImageProviderHealth, type ImageProviderHealthStatus } from "@/lib/social/image-provider-health";
import { assessTenantSocialHealth } from "@/lib/social/tenant-social-health";
import { STRATXCEL_TENANT_ID } from "@/lib/social/stratxcel-tenant";

// STRATXCEL zero-waste image-spend brief Section 7: real, evidence-based
// image-provider fallback health -- distinct from the generic
// "media:image_generation" readiness probe below, which only answers "is
// the API reachable right now", not "has every real recent attempt
// actually been landing on the pricier fallback." Scoped to the real
// StratXcel tenant explicitly (this admin panel's only real, active
// tenant today -- see the mission brief's own repeated "use StratXcel
// only" constraint) rather than built as a tenant-picker UI in this pass.
// STRATXCEL_TENANT_ID now lives in lib/social/stratxcel-tenant.ts (a real,
// shared, explicitly-documented constant) -- see its own header comment
// for why re-deriving this via resolveCurrentTenant()/tenant_members is a
// real, confirmed-live bug trap: two distinct real tenants are both
// literally named "Stratxcel".

const PROVIDER_HEALTH_CHIP: Record<ImageProviderHealthStatus, string> = {
  PRIMARY_HEALTHY: "saut-chip-success",
  PRIMARY_DEGRADED: "saut-chip-warning",
  FALLBACK_ACTIVE: "saut-chip-danger",
  NO_RECENT_DATA: "saut-chip-neutral",
};

// Debug Silent Automation Failure mission: real root cause of "clicked
// Backfill/Run worker now, nothing happened" -- per Next.js's own docs
// (maxDuration.md: "If using Server Actions, set maxDuration at the PAGE
// level to change the default timeout of all Server Actions used on the
// page"), this page had no maxDuration at all, so runTenantContentBackfill
// Action's real AI generation work (confirmed live to need up to ~300s for
// even one tenant's near-term batch -- see package-producer/route.ts's own
// comment) was getting killed by Vercel's short platform default long
// before it could finish, or even write anything -- with zero visible
// error to the user (a killed Server Action just silently fails the
// request; "The destination stream closed early" is exactly what a killed
// mid-stream Server Action looks like from the server's own logs).
export const maxDuration = 300;

const STATUS_CHIP: Record<HealthStatus, string> = {
  OPERATIONAL: "saut-chip-success",
  DEGRADED: "saut-chip-warning",
  PAUSED: "saut-chip-info",
  FAILED: "saut-chip-danger",
  NOT_CONFIGURED: "saut-chip-neutral",
};

const COMPONENT_LABELS: Record<string, string> = {
  "webhooks:receiver": "Webhook receiver",
  "webhooks:meta_subscription": "Meta subscription",
  "webhooks:events_received": "Events received",
  "media:image_generation": "Media generation",
  "workers:publishing": "Publishing worker",
  "scheduler:cron": "Scheduler",
  publishing_mode: "Publishing mode",
};

function healthLabel(component: string, status: HealthStatus, message: string) {
  if (component === "webhooks:receiver" && status === "OPERATIONAL") return "ready";
  if (component === "webhooks:meta_subscription" && status === "NOT_CONFIGURED") return "pending setup";
  if (component === "webhooks:events_received" && message.startsWith("0 ")) return "0 events";
  return status.replace(/_/g, " ").toLowerCase();
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export default async function SystemPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const { supabase: service } = getServiceContext();
  const [health, jobs, auditEvents, imageProviderHealth, tenantSocialHealth] = await Promise.all([
    runHealthChecks(ctx),
    listJobs(ctx, 30),
    listAuditEvents(ctx, 30),
    assessImageProviderHealth(service as never, STRATXCEL_TENANT_ID, 24).catch(() => null),
    // STRATXCEL full-system closure brief Section 9: real fix for a
    // confirmed, live bug -- the "social"/"workers"/"webhooks" groups
    // below (from runHealthChecks) reflect the LOGGED-IN ADMIN'S OWN
    // connections (by design -- see lib/social/agent/tools.ts's own
    // comment), never this tenant's. Live-confirmed: the current staff
    // account has its own unrelated real accounts under a different real
    // tenant_id, and StratXcel's real shadow_mode (false / LIVE) was being
    // shown as the OPPOSITE (SHADOW) because of this. This section is the
    // real, correctly tenant_id-scoped replacement for what this page's
    // own framing ("S Stratxcel" workspace, tenant-specific actions right
    // above it) always implied it already was.
    assessTenantSocialHealth(service as never, STRATXCEL_TENANT_ID).catch(() => null),
  ]);

  const grouped = health.reduce<Record<string, typeof health>>((acc, h) => {
    (acc[h.group] ??= []).push(h);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
            Health, jobs, and the audit trail — computed live on this page load, from the stratxcel database.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form action={runTenantContentBackfillAction}>
            <button className="saut-btn saut-btn-secondary" title="Runs the real activate/resume plan+prepare functions for every ACTIVE/NEEDS_ATTENTION tenant — safe to re-run, never double-plans or double-prepares">
              Backfill existing tenant content
            </button>
          </form>
          <form action={runWorkerNowAction}>
            <button className="saut-btn saut-btn-secondary">Run worker now</button>
          </form>
        </div>
      </div>

      <div className="saut-card flex flex-col gap-3 p-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--saut-text-subtle)" }}>
          Target one queue item
        </p>
        <form action={forceRegeneratePackageItemImageAction} className="flex flex-wrap items-center gap-2">
          <input
            name="queueItemId"
            placeholder="social_autopilot_queue_items.id"
            className="h-9 min-w-[280px] flex-1 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-2.5 font-mono text-xs"
          />
          <button className="saut-btn saut-btn-secondary" title="Calls the real image-generation provider for this item and attaches a genuinely new asset — never falls back to an existing one. Fails closed on any generation error.">
            Force regenerate image (net-new)
          </button>
        </form>
        <form action={forcePublishQueueItemNowAction} className="flex flex-wrap items-center gap-2">
          <input
            name="queueItemId"
            placeholder="social_autopilot_queue_items.id"
            className="h-9 min-w-[280px] flex-1 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-2.5 font-mono text-xs"
          />
          <button className="saut-btn saut-btn-secondary" title="Pulls this exact item's schedule to now (only if PREPARED/SCHEDULED) then runs the real canonical publish batch — same path as the cron.">
            Force publish this item now
          </button>
        </form>
      </div>

      {imageProviderHealth && (
        <section className="space-y-3">
          <h2 className="saut-section-title">Image provider health (StratXcel, last 24h)</h2>
          <div className="saut-card flex items-start justify-between gap-3 p-3 text-sm">
            <span className="min-w-0">
              <span className="block text-xs font-medium">
                {imageProviderHealth.totalCalls} real image generation{imageProviderHealth.totalCalls === 1 ? "" : "s"}
                {imageProviderHealth.fallbackRate != null ? ` · ${Math.round(imageProviderHealth.fallbackRate * 100)}% on fallback` : ""}
                {imageProviderHealth.observedCostMultiplier != null ? ` · ~${imageProviderHealth.observedCostMultiplier.toFixed(1)}x cost` : ""}
              </span>
              <span className="mt-1 block text-[10px] leading-relaxed" style={{ color: "var(--saut-text-subtle)" }}>{imageProviderHealth.message}</span>
            </span>
            <span className={`saut-chip shrink-0 ${PROVIDER_HEALTH_CHIP[imageProviderHealth.status]}`}>
              <span className="saut-chip-dot" /> {imageProviderHealth.status.replace(/_/g, " ").toLowerCase()}
            </span>
          </div>
        </section>
      )}

      {tenantSocialHealth && (
        <section className="space-y-3">
          <h2 className="saut-section-title">StratXcel workspace status (real, tenant-scoped)</h2>
          <div className="saut-card flex flex-col gap-2 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs">Publishing mode</span>
              <span className={`saut-chip shrink-0 ${tenantSocialHealth.publishingMode.shadowMode === false ? "saut-chip-success" : tenantSocialHealth.publishingMode.shadowMode === true ? "saut-chip-info" : "saut-chip-neutral"}`}>
                <span className="saut-chip-dot" />
                {tenantSocialHealth.publishingMode.shadowMode === null
                  ? "unknown — no automation settings yet"
                  : tenantSocialHealth.publishingMode.shadowMode
                  ? `SHADOW — paused (${tenantSocialHealth.publishingMode.autonomyLevel ?? "unknown"})`
                  : `LIVE — publishing enabled (${tenantSocialHealth.publishingMode.autonomyLevel ?? "unknown"})`}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs">Connected platforms</span>
              <span className="text-xs" style={{ color: "var(--saut-text-muted)" }}>
                {tenantSocialHealth.connectedPlatforms.length === 0
                  ? "none connected"
                  : tenantSocialHealth.connectedPlatforms.map((p) => `${p.platform} (${p.status.toLowerCase()}${p.status === "CONNECTED" ? `, token ${p.tokenHealth.toLowerCase()}` : ""})`).join(" · ")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs">Publishing jobs</span>
              <span className="text-xs" style={{ color: "var(--saut-text-muted)" }}>
                {tenantSocialHealth.jobCounts.scheduled} scheduled · {tenantSocialHealth.jobCounts.running} running · {tenantSocialHealth.jobCounts.failed} failed · {tenantSocialHealth.jobCounts.published} published
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs">Webhook events (lifetime)</span>
              <span className="text-xs" style={{ color: "var(--saut-text-muted)" }}>{tenantSocialHealth.webhookEventCount}</span>
            </div>
          </div>
        </section>
      )}

      {(["core", "workers", "social", "webhooks", "ai", "media"] as const).map((group) => (
        <section key={group} className="space-y-3">
          <h2 className="saut-section-title capitalize">
            {group}
            {(group === "social" || group === "workers" || group === "webhooks") && (
              <span className="ml-2 text-[10px] font-normal normal-case" style={{ color: "var(--saut-text-subtle)" }}>
                (the logged-in admin account&apos;s own connections — see StratXcel workspace status above for this tenant&apos;s real state)
              </span>
            )}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(grouped[group] ?? []).map((h) => (
              <div key={h.component} className="saut-card flex items-start justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{COMPONENT_LABELS[h.component] ?? h.component}</span>
                  <span className="mt-1 block text-[10px] leading-relaxed" style={{ color: "var(--saut-text-subtle)" }}>{h.message}</span>
                </span>
                <span className={`saut-chip shrink-0 ${STATUS_CHIP[h.status]}`}>
                  <span className="saut-chip-dot" /> {healthLabel(h.component, h.status, h.message)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="saut-section-title">Jobs</h2>
        <div className="space-y-1.5">
          {jobs.map((j) => (
            <div key={j.id} className="flex items-center gap-2 text-xs">
              <span className="saut-mono" style={{ color: "var(--saut-text-subtle)" }}>{fmt(j.scheduled_at)}</span>
              <span className="saut-chip saut-chip-neutral">
                <span className="saut-chip-dot" /> {j.status.toLowerCase()}
              </span>
              <span style={{ color: "var(--saut-text-muted)" }}>
                attempt {j.attempts}/{j.max_attempts}
              </span>
              {j.last_error && <span style={{ color: "var(--saut-danger)" }}>{j.last_error}</span>}
            </div>
          ))}
          {jobs.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No jobs yet.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="saut-section-title">Audit trail</h2>
        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {auditEvents.map((e: Record<string, unknown>) => (
            <div key={e.id as string} className="flex items-center gap-2 text-xs">
              <span className="saut-mono" style={{ color: "var(--saut-text-subtle)" }}>{fmt(e.created_at as string)}</span>
              <span
                className="saut-mono rounded px-1.5 py-0.5 text-[9.5px] uppercase"
                style={{ background: "var(--saut-surface-2)", color: "var(--saut-text-subtle)" }}
              >
                {e.actor_type as string}
              </span>
              <span style={{ color: "var(--saut-text-muted)" }}>{e.summary as string}</span>
            </div>
          ))}
          {auditEvents.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No audit events yet.</p>}
        </div>
      </section>
    </div>
  );
}
