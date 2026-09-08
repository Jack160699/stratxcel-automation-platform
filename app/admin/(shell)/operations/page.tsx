"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import { AdminUniversalDrawer, AdminDrawerSection, AdminDrawerRow } from "@/components/admin/ui/AdminUniversalDrawer";
import { AdminSegmentedControl } from "@/components/admin/ui/AdminSegmentedControl";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { ErrorState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";
import { Inbox, RotateCcw, ArrowRight, ShieldAlert, CheckCircle2, RefreshCw } from "lucide-react";

interface QueueJob {
  id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
  last_error: Record<string, unknown> | null;
}

interface Mission {
  id: string;
  goal_text: string;
  state: string;
  created_at: string;
  updated_at: string;
}

interface Handoff {
  id: string;
  mission_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}

interface Approval {
  id: string;
  kind: string;
  created_at: string;
}

interface OperationsSnapshot {
  jobs: QueueJob[];
  deadLetter: QueueJob[];
  missions: Mission[];
  handoffs: Handoff[];
  approvals: Approval[];
}

function age(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

type TabKey = "all" | "jobs" | "missions" | "handoffs" | "approvals";

export default function OperationsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [selectedItem, setSelectedItem] = useState<{
    type: string;
    id: string;
    title: string;
    status: string;
    ageText: string;
    details: Record<string, unknown>;
  } | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const encoded = encodeURIComponent(tenantId);
      const [queueRes, missionsRes, handoffsRes, approvalsRes] = await Promise.all([
        fetch(`/api/platform/queue?tenantId=${encoded}`),
        platformFetch(`/api/platform/missions?tenantId=${encoded}`),
        fetch(`/api/platform/handoffs?tenantId=${encoded}`),
        platformFetch(`/api/platform/approvals?tenantId=${encoded}`),
      ]);
      const [queue, missions, handoffs, approvals] = await Promise.all([
        queueRes.json(),
        missionsRes.json(),
        handoffsRes.json(),
        approvalsRes.json(),
      ]);
      const failed = [queueRes, missionsRes, handoffsRes, approvalsRes].find((response) => !response.ok);
      if (failed) throw new Error(`Could not load all operational signals (HTTP ${failed.status}).`);
      setSnapshot({
        jobs: queue.jobs ?? [],
        deadLetter: queue.deadLetter ?? [],
        missions: missions.missions ?? [],
        handoffs: handoffs.handoffs ?? [],
        approvals: approvals.approvals ?? [],
      });
    } catch (loadError) {
      setSnapshot({ jobs: [], deadLetter: [], missions: [], handoffs: [], approvals: [] });
      setError(loadError instanceof Error ? loadError.message : "Could not load operations.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    setSnapshot(null);
    void load();
  }, [load]);

  async function requeue(job: QueueJob) {
    if (!tenantId) return;
    const reason = window.prompt("Why is this job safe to retry?");
    if (!reason?.trim()) return;
    setActingId(job.id);
    setError(null);
    try {
      const response = await fetch("/api/platform/admin/queue/dead-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, jobId: job.id, reason: reason.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not requeue the job.");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not requeue the job.");
    } finally {
      setActingId(null);
    }
  }

  const failedMissions = useMemo(() => {
    return snapshot?.missions.filter((mission) => ["FAILED", "BLOCKED", "HUMAN_HANDOFF"].includes(mission.state)) ?? [];
  }, [snapshot]);

  const deadLetterJobs = snapshot?.deadLetter ?? [];
  const openHandoffs = snapshot?.handoffs ?? [];
  const pendingApprovals = snapshot?.approvals ?? [];

  const totalExceptions = deadLetterJobs.length + failedMissions.length + openHandoffs.length + pendingApprovals.length;

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Header */}
      <AdminPageHeader
        breadcrumb="Operations / Queue"
        title={active ? `Operations — ${active.name}` : "Operations Queue"}
        description="Exceptions-first command center: failed jobs, blocked work, and approvals requiring intervention."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/audit-requests"
              className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-1"
            >
              <span>Audit Delivery</span>
              <ArrowRight size={12} />
            </Link>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-sx-text hover:bg-sx-surface-1 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {!tenantId && <NoClientSelected what="operational exceptions" />}

      {tenantId && snapshot && (
        <div className="flex flex-col gap-5">
          {/* Top Status Banner */}
          <div className="flex items-center justify-between rounded-xl border border-sx-border/70 bg-sx-surface-1 p-4 shadow-xs">
            <div className="flex items-center gap-3">
              {totalExceptions === 0 ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 size={18} />
                </div>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <ShieldAlert size={18} />
                </div>
              )}
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">
                  Operational Health Status
                </h2>
                <p className="mt-0.5 text-sm font-semibold text-sx-text">
                  {totalExceptions === 0 ? "All queues and workers operating normally" : `${totalExceptions} exceptions require attention`}
                </p>
              </div>
            </div>
            <AdminStatusDot
              status={totalExceptions === 0 ? "connected" : "needs_attention"}
              customLabel={totalExceptions === 0 ? "Operational" : "Action Required"}
            />
          </div>

          {/* Navigation Filter Tabs */}
          <AdminSegmentedControl
            value={activeTab}
            onChange={(t) => setActiveTab(t)}
            options={[
              { value: "all", label: "All Items", badge: totalExceptions },
              { value: "jobs", label: "Failed Jobs", badge: deadLetterJobs.length },
              { value: "missions", label: "Blocked Work", badge: failedMissions.length },
              { value: "handoffs", label: "Handoffs", badge: openHandoffs.length },
              { value: "approvals", label: "Approvals", badge: pendingApprovals.length },
            ]}
          />

          {totalExceptions === 0 ? (
            <AdminEmptyState
              icon={<Inbox size={22} />}
              title="No operational exceptions"
              description="No failed jobs, blocked missions, pending handoffs, or stalled approvals."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {/* Failed Jobs */}
              {(activeTab === "all" || activeTab === "jobs") &&
                deadLetterJobs.map((job) => (
                  <AdminEntityRow
                    key={job.id}
                    icon={<RotateCcw size={15} className="text-rose-400" />}
                    title={`Failed job · ${job.job_type}`}
                    subtitle={`Attempts ${job.attempt_count}/${job.max_attempts} · Queued work paused`}
                    timestamp={age(job.scheduled_at)}
                    status={<AdminStatusDot status="error" customLabel="Failed" />}
                    primaryAction={
                      <button
                        type="button"
                        disabled={actingId === job.id}
                        onClick={() => void requeue(job)}
                        className="rounded-lg bg-sx-surface-2 px-3 py-1 text-xs font-medium text-sx-text hover:bg-sx-surface-1 border border-sx-border/60"
                      >
                        {actingId === job.id ? "Requeuing…" : "Requeue"}
                      </button>
                    }
                    onOpenDetails={() =>
                      setSelectedItem({
                        type: "FAILED QUEUE JOB",
                        id: job.id,
                        title: job.job_type,
                        status: "Failed",
                        ageText: age(job.scheduled_at),
                        details: {
                          attemptCount: job.attempt_count,
                          maxAttempts: job.max_attempts,
                          lastError: job.last_error,
                        },
                      })
                    }
                    detailsAriaLabel={`Inspect job ${job.id}`}
                  />
                ))}

              {/* Blocked Missions */}
              {(activeTab === "all" || activeTab === "missions") &&
                failedMissions.map((m) => (
                  <AdminEntityRow
                    key={m.id}
                    icon={<ShieldAlert size={15} className="text-amber-400" />}
                    title={`Blocked work · ${m.goal_text}`}
                    subtitle={`State: ${m.state} · Outcome paused`}
                    timestamp={age(m.updated_at)}
                    status={<AdminStatusDot status="error" customLabel={m.state} />}
                    primaryAction={
                      <Link
                        href={`/admin/missions?tenantId=${tenantId}`}
                        className="rounded-lg bg-sx-surface-2 px-3 py-1 text-xs font-medium text-sx-text hover:bg-sx-surface-1 border border-sx-border/60"
                      >
                        Inspect
                      </Link>
                    }
                    onOpenDetails={() =>
                      setSelectedItem({
                        type: "BLOCKED WORK",
                        id: m.id,
                        title: m.goal_text,
                        status: m.state,
                        ageText: age(m.updated_at),
                        details: { state: m.state, createdAt: m.created_at, updatedAt: m.updated_at },
                      })
                    }
                    detailsAriaLabel={`Inspect mission ${m.id}`}
                  />
                ))}

              {/* Human Handoffs */}
              {(activeTab === "all" || activeTab === "handoffs") &&
                openHandoffs.map((h) => (
                  <AdminEntityRow
                    key={h.id}
                    icon={<Inbox size={15} className="text-amber-400" />}
                    title={`Human decision required · ${h.reason}`}
                    subtitle={`State: ${h.status} · Linked work paused`}
                    timestamp={age(h.created_at)}
                    status={<AdminStatusDot status="needs_attention" customLabel={h.status} />}
                    primaryAction={
                      <Link
                        href="/admin/handoffs"
                        className="rounded-lg bg-sx-surface-2 px-3 py-1 text-xs font-medium text-sx-text hover:bg-sx-surface-1 border border-sx-border/60"
                      >
                        Resolve
                      </Link>
                    }
                    onOpenDetails={() =>
                      setSelectedItem({
                        type: "HUMAN HANDOFF",
                        id: h.id,
                        title: h.reason,
                        status: h.status,
                        ageText: age(h.created_at),
                        details: { reason: h.reason, missionId: h.mission_id, createdAt: h.created_at },
                      })
                    }
                    detailsAriaLabel={`Inspect handoff ${h.id}`}
                  />
                ))}

              {/* Waiting Approvals */}
              {(activeTab === "all" || activeTab === "approvals") &&
                pendingApprovals.map((a) => (
                  <AdminEntityRow
                    key={a.id}
                    icon={<Inbox size={15} className="text-sx-accent" />}
                    title={`Approval waiting · ${a.kind}`}
                    subtitle="Consequential action remains paused pending review"
                    timestamp={age(a.created_at)}
                    status={<AdminStatusDot status="waiting" customLabel="Waiting Review" />}
                    primaryAction={
                      <Link
                        href="/admin/approvals"
                        className="rounded-lg bg-sx-surface-2 px-3 py-1 text-xs font-medium text-sx-text hover:bg-sx-surface-1 border border-sx-border/60"
                      >
                        Review
                      </Link>
                    }
                    onOpenDetails={() =>
                      setSelectedItem({
                        type: "APPROVAL REQUEST",
                        id: a.id,
                        title: a.kind,
                        status: "Waiting",
                        ageText: age(a.created_at),
                        details: { kind: a.kind, createdAt: a.created_at },
                      })
                    }
                    detailsAriaLabel={`Inspect approval ${a.id}`}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* Universal Drawer for Selected Exception */}
      {selectedItem && (
        <AdminUniversalDrawer
          open={Boolean(selectedItem)}
          onClose={() => setSelectedItem(null)}
          entityType={selectedItem.type}
          title={selectedItem.title}
          subtitle={`Identifier: ${selectedItem.id.slice(0, 8)}…`}
          statusBadge={<AdminStatusDot status="error" customLabel={selectedItem.status} />}
        >
          <AdminDrawerSection title="Details">
            <AdminDrawerRow label="ID" value={selectedItem.id} mono />
            <AdminDrawerRow label="Age" value={selectedItem.ageText} />
            <AdminDrawerRow label="Status" value={selectedItem.status} />
          </AdminDrawerSection>

          <AdminDrawerSection title="Raw Diagnostics">
            <pre className="max-h-60 overflow-x-auto rounded-md bg-sx-surface-1 p-2.5 font-sx-mono text-[10.5px] text-sx-text-muted">
              {JSON.stringify(selectedItem.details, null, 2)}
            </pre>
          </AdminDrawerSection>
        </AdminUniversalDrawer>
      )}
    </div>
  );
}
