import Link from "next/link";
import { requireOwnerContext } from "@/lib/social/db-context";
import { listAccounts } from "@/lib/social/repositories/accounts";
import { listDeadLetters, listJobs } from "@/lib/social/repositories/publishing";
import { listAuditEvents } from "@/lib/social/repositories/system";
import { getLatestSession } from "@/lib/social/repositories/agent";
import AskAutopilot from "./AskAutopilot";

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export default async function CommandCenterPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [accounts, jobs, deadLetters, auditEvents, latestSession] = await Promise.all([
    listAccounts(ctx),
    listJobs(ctx, 50),
    listDeadLetters(ctx, 10),
    listAuditEvents(ctx, 10),
    getLatestSession(ctx),
  ]);

  const reauthAccounts = accounts.filter((a) => a.status === "REAUTH_REQUIRED");
  const upcoming = jobs.filter((j) => j.status === "SCHEDULED").slice(0, 8);
  const publishedCount = jobs.filter((j) => j.status === "PUBLISHED").length;
  const failedCount = jobs.filter((j) => j.status === "FAILED").length;

  const needsAttention = [
    ...reauthAccounts.map((a) => ({
      key: `acct-${a.id}`,
      label: `${a.platform} needs reauthorization`,
      detail: "Token invalid or expired",
      href: "/admin/social/integrations",
    })),
    ...deadLetters.map((d) => ({
      key: `dl-${d.id}`,
      label: "A publish job failed permanently",
      detail: d.error ?? "Dead-lettered after exhausting retries",
      href: "/admin/social/system",
    })),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          What your social operation is doing right now.
        </p>
      </div>

      <AskAutopilot />

      <section className="saut-card p-5">
        <h2 className="saut-section-title mb-3">Current mission</h2>
        {latestSession ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="saut-chip saut-chip-ai">
              <span className="saut-chip-dot saut-pulse" />
              {latestSession.status.replace(/_/g, " ").toLowerCase()}
            </span>
            <span className="text-sm">{latestSession.title ?? "Untitled session"}</span>
            <span className="ml-auto text-xs" style={{ color: "var(--saut-text-subtle)" }}>
              updated {fmt(latestSession.updated_at)}
            </span>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>
            No active mission — ask Autopilot something above to start one.
          </p>
        )}
      </section>

      <section className="saut-card p-5">
        <h2 className="saut-section-title mb-3">Needs your attention</h2>
        {needsAttention.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>
            No action required.
          </p>
        ) : (
          <div className="space-y-2">
            {needsAttention.map((n) => (
              <Link
                key={n.key}
                href={n.href}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--saut-surface-2)" }}
              >
                <span>
                  <span className="font-medium">{n.label}</span>{" "}
                  <span style={{ color: "var(--saut-text-subtle)" }}>· {n.detail}</span>
                </span>
                <span className="saut-chip saut-chip-warning">
                  <span className="saut-chip-dot" /> review
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="saut-card p-5">
          <h2 className="saut-section-title mb-3">Upcoming actions</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>
              Nothing scheduled. <Link href="/admin/social/planner" className="underline">Plan something</Link>.
            </p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <span className="saut-mono" style={{ color: "var(--saut-text-muted)" }}>
                    {fmt(u.scheduled_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="saut-card p-5">
          <h2 className="saut-section-title mb-3">Live activity</h2>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {auditEvents.map((row) => (
              <div key={row.id} className="flex items-center gap-2 text-xs">
                <span className="saut-mono" style={{ color: "var(--saut-text-subtle)" }}>
                  {fmt(row.created_at)}
                </span>
                <span style={{ color: "var(--saut-text-muted)" }}>
                  {row.actor_type.toLowerCase()} · {row.summary}
                </span>
              </div>
            ))}
            {auditEvents.length === 0 && (
              <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
                No activity yet.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="saut-card p-5">
          <div className="saut-label">Published</div>
          <div className="saut-metric mt-2 text-3xl">{publishedCount}</div>
        </div>
        <div className="saut-card p-5">
          <div className="saut-label">Failed</div>
          <div className="saut-metric mt-2 text-3xl">{failedCount}</div>
        </div>
        <div className="saut-card p-5">
          <div className="saut-label">Open attention items</div>
          <div className="saut-metric mt-2 text-3xl">{needsAttention.length}</div>
        </div>
      </section>
    </div>
  );
}
