import Link from "next/link";
import { requireOwnerContext } from "@/lib/social/db-context";
import { listAccounts } from "@/lib/social/repositories/accounts";
import { listDeadLetters, listJobs } from "@/lib/social/repositories/publishing";
import { listAuditEvents } from "@/lib/social/repositories/system";
import { getCurrentMissionSession, getRecentMissionSessions } from "@/lib/social/repositories/agent";
import AskAutopilot from "./AskAutopilot";
import { MissionCard } from "./components/MissionCard";
import { EmptyState } from "./components/EmptyState";
import { StatusBadge } from "./components/StatusBadge";
import { ActivityItem, type ActivityActor } from "./components/ActivityItem";
import { PlatformAccountRow, type PlatformAccountRowData } from "./components/PlatformAccountRow";
import type { Platform } from "./components/PlatformIcon";

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

const PLATFORMS: Platform[] = ["instagram", "facebook", "threads", "linkedin", "youtube"];

export default async function CommandCenterPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [accounts, jobs, deadLetters, auditEvents, currentMission, recentMissions] = await Promise.all([
    listAccounts(ctx),
    listJobs(ctx, 50),
    listDeadLetters(ctx, 10),
    listAuditEvents(ctx, 10),
    getCurrentMissionSession(ctx),
    getRecentMissionSessions(ctx, 5),
  ]);

  const reauthAccounts = accounts.filter((a) => a.status === "RECONNECT_REQUIRED");
  const upcoming = jobs.filter((j) => j.status === "SCHEDULED").slice(0, 8);
  const publishedCount = jobs.filter((j) => j.status === "PUBLISHED").length;
  const failedCount = jobs.filter((j) => j.status === "FAILED").length;

  const needsAttention = [
    ...reauthAccounts.map((a) => ({
      key: `acct-${a.id}`,
      label: `${a.platform} needs reauthorization`,
      detail: "Token invalid or expired",
      href: "/admin/social/integrations",
      severity: "amber" as const,
    })),
    ...deadLetters.map((d) => ({
      key: `dl-${d.id}`,
      label: "A publish job failed permanently",
      detail: d.error ?? "Dead-lettered after exhausting retries",
      href: "/admin/social/system",
      severity: "red" as const,
    })),
  ];

  const platformRows: PlatformAccountRowData[] = PLATFORMS.map((platform) => {
    const account = accounts.find((a) => a.platform === platform);
    if (!account) {
      return { platform, handle: null, status: "NOT_CONNECTED", lastSyncAt: null };
    }
    return {
      platform,
      handle: account.username ?? null,
      status: account.status === "RECONNECT_REQUIRED" ? "RECONNECT_REQUIRED" : account.status === "CONNECTED" ? "CONNECTED" : "DISCONNECTED",
      tokenHealth: account.status === "CONNECTED" ? (account.token_health as "HEALTHY" | "DEGRADED" | "EXPIRED" | null) : null,
      lastSyncAt: account.last_sync_at,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Command Center</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          What your social operation is doing right now.
        </p>
      </div>

      <AskAutopilot />

      <section className="saut-card p-5">
        <h2 className="saut-section-title mb-3">Current mission</h2>
        {currentMission ? (
          <MissionCard
            status={currentMission.status}
            title={currentMission.title ?? "Untitled session"}
            createdAt={currentMission.created_at}
            updatedAt={currentMission.updated_at}
          />
        ) : (
          <EmptyState hint="Ask Autopilot something above to start one.">No mission is running right now.</EmptyState>
        )}
      </section>

      {recentMissions.length > 0 && (
        <section className="saut-card p-5">
          <h2 className="saut-section-title mb-3">Recent sessions</h2>
          <div className="space-y-4">
            {recentMissions.map((session) => (
              <div key={session.id} className="border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: "var(--saut-border)" }}>
                <MissionCard
                  status={session.status}
                  title={session.title ?? "Untitled session"}
                  createdAt={session.created_at}
                  updatedAt={session.updated_at}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="saut-card p-5">
        <h2 className="saut-section-title mb-3">Connected accounts</h2>
        <div className="divide-y" style={{ borderColor: "var(--saut-border)" }}>
          {platformRows.map((row) => (
            <div key={row.platform} className="py-1 first:pt-0 last:pb-0">
              <PlatformAccountRow data={row} />
            </div>
          ))}
        </div>
      </section>

      <section className="saut-card p-5">
        <h2 className="saut-section-title mb-3">Needs your attention</h2>
        {needsAttention.length === 0 ? (
          <EmptyState>No action required.</EmptyState>
        ) : (
          <div className="space-y-2">
            {needsAttention.map((n) => (
              <Link key={n.key} href={n.href} className="saut-attention-row">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--saut-text)" }}>
                    {n.label}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--saut-text-subtle)" }}>
                    {n.detail}
                  </p>
                </div>
                <StatusBadge label="Review" tone={n.severity} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="saut-card p-5">
          <h2 className="saut-section-title mb-3">Upcoming actions</h2>
          {upcoming.length === 0 ? (
            <EmptyState
              hint={
                <>
                  Ask Autopilot to <Link href="/admin/social/planner" className="underline">plan content or create a campaign</Link>.
                </>
              }
            >
              Nothing scheduled.
            </EmptyState>
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
          <div className="max-h-56 space-y-3 overflow-y-auto">
            {auditEvents.map((row: Record<string, unknown>) => (
              <ActivityItem
                key={row.id as string}
                createdAt={row.created_at as string}
                actor={row.actor_type as ActivityActor}
                title={row.summary as string}
              />
            ))}
            {auditEvents.length === 0 && <EmptyState>No activity yet.</EmptyState>}
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
