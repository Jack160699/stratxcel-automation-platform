import { requireOwnerContext } from "@/lib/social/db-context";
import { runHealthChecks, type HealthStatus } from "@/lib/social/health";
import { listAuditEvents } from "@/lib/social/repositories/system";
import { listJobs } from "@/lib/social/repositories/publishing";
import { runWorkerNowAction } from "../actions";

const STATUS_CHIP: Record<HealthStatus, string> = {
  OPERATIONAL: "saut-chip-success",
  DEGRADED: "saut-chip-warning",
  PAUSED: "saut-chip-info",
  FAILED: "saut-chip-danger",
  NOT_CONFIGURED: "saut-chip-neutral",
};

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export default async function SystemPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [health, jobs, auditEvents] = await Promise.all([runHealthChecks(), listJobs(ctx, 30), listAuditEvents(ctx, 30)]);

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
        <form action={runWorkerNowAction}>
          <button className="saut-btn saut-btn-secondary">Run worker now</button>
        </form>
      </div>

      {(["core", "workers", "social", "webhooks", "ai", "media"] as const).map((group) => (
        <section key={group} className="space-y-3">
          <h2 className="saut-section-title capitalize">{group}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(grouped[group] ?? []).map((h) => (
              <div key={h.component} className="saut-card flex items-center justify-between p-3 text-sm">
                <span className="saut-mono text-xs">{h.component}</span>
                <span className={`saut-chip ${STATUS_CHIP[h.status]}`}>
                  <span className="saut-chip-dot" /> {h.status.replace(/_/g, " ").toLowerCase()}
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
