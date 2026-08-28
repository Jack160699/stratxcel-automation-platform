import { requireOwnerContext } from "@/lib/social/db-context";
import { runHealthChecks, type HealthStatus } from "@/lib/social/health";
import { listAuditEvents } from "@/lib/social/repositories/system";
import { listJobs } from "@/lib/social/repositories/publishing";
import { runWorkerNowAction, runTenantContentBackfillAction } from "../actions";

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

  const [health, jobs, auditEvents] = await Promise.all([runHealthChecks(ctx), listJobs(ctx, 30), listAuditEvents(ctx, 30)]);

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

      {(["core", "workers", "social", "webhooks", "ai", "media"] as const).map((group) => (
        <section key={group} className="space-y-3">
          <h2 className="saut-section-title capitalize">{group}</h2>
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
