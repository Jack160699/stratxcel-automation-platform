"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { Button } from "@/components/ui/Button";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState, EmptyState } from "@/components/ui/Feedback";
import { platformFetch } from "@/lib/admin/platform-fetch";

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
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function evidence(id: string) {
  return id.slice(0, 8);
}

export default function OperationsPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
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
    }
  }, [tenantId]);

  useEffect(() => {
    setSnapshot(null);
    load();
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

  const failedMissions = snapshot?.missions.filter((mission) => ["FAILED", "BLOCKED", "HUMAN_HANDOFF"].includes(mission.state)) ?? [];
  const exceptionCount = (snapshot?.deadLetter.length ?? 0) + failedMissions.length + (snapshot?.handoffs.length ?? 0) + (snapshot?.approvals.length ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Operations{active ? ` — ${active.name}` : ""}</h1>
          <p className="mt-1 text-sm text-sx-text-muted">Exceptions first: what is blocked, its impact, and the safest next action.</p>
        </div>
        <Link href="/admin/audit-requests" className="text-xs font-semibold text-sx-accent hover:underline">
          Open Audit Delivery →
        </Link>
      </header>

      {error && <ErrorState message={error} onRetry={load} />}
      {!tenantId && <NoClientSelected what="operational exceptions" />}
      {tenantId && snapshot === null && !error && <p className="text-sm text-sx-text-subtle">Loading operational signals…</p>}

      {snapshot && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardHeading>Current exception load</CardHeading>
              <p className="mt-1 text-xs text-sx-text-muted">{exceptionCount} item{exceptionCount === 1 ? "" : "s"} need attention in this workspace.</p>
            </div>
            <StatusChip state={exceptionCount > 0 ? "warning" : "success"}>{exceptionCount > 0 ? "Action required" : "Clear"}</StatusChip>
          </Card>

          {exceptionCount === 0 && <EmptyState title="No operational exceptions" subtitle="No failed jobs, blocked work, open handoffs, or waiting approvals were found." />}

          {snapshot.deadLetter.map((job) => (
            <Card key={job.id} variant="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-sx-text">Failed job · {job.job_type}</p>
                <p className="mt-1 text-xs text-sx-text-muted">Impact: queued work cannot continue · age {age(job.scheduled_at)} · attempts {job.attempt_count}/{job.max_attempts}</p>
                <p className="mt-1 truncate font-sx-mono text-[11px] text-sx-text-subtle" title={job.id}>Evidence {evidence(job.id)} · {JSON.stringify(job.last_error ?? {})}</p>
              </div>
              <Button variant="secondary" size="sm" disabled={actingId === job.id} onClick={() => requeue(job)}>
                {actingId === job.id ? "Requeuing…" : "Review & requeue"}
              </Button>
            </Card>
          ))}

          {failedMissions.map((mission) => (
            <Card key={mission.id} variant="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sx-text">Blocked work · {mission.goal_text}</p>
                <p className="mt-1 text-xs text-sx-text-muted">Impact: customer outcome is paused · age {age(mission.updated_at)} · state {mission.state}</p>
                <p className="mt-1 font-sx-mono text-[11px] text-sx-text-subtle" title={mission.id}>Evidence {evidence(mission.id)}</p>
              </div>
              <Link href={`/admin/missions?tenantId=${tenantId}`} className="text-xs font-semibold text-sx-accent hover:underline">Inspect work →</Link>
            </Card>
          ))}

          {snapshot.handoffs.map((handoff) => (
            <Card key={handoff.id} variant="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-sx-text">Human decision needed · {handoff.reason}</p>
                <p className="mt-1 text-xs text-sx-text-muted">Impact: linked work is paused · age {age(handoff.created_at)} · state {handoff.status}</p>
                <p className="mt-1 font-sx-mono text-[11px] text-sx-text-subtle" title={handoff.id}>Evidence {evidence(handoff.id)}</p>
              </div>
              <Link href="/admin/handoffs" className="text-xs font-semibold text-sx-accent hover:underline">Resolve handoff →</Link>
            </Card>
          ))}

          {snapshot.approvals.map((approval) => (
            <Card key={approval.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-sx-text">Approval waiting · {approval.kind}</p>
                <p className="mt-1 text-xs text-sx-text-muted">Impact: consequential action remains paused · age {age(approval.created_at)}</p>
                <p className="mt-1 font-sx-mono text-[11px] text-sx-text-subtle" title={approval.id}>Evidence {evidence(approval.id)}</p>
              </div>
              <Link href="/admin/approvals" className="text-xs font-semibold text-sx-accent hover:underline">Review approval →</Link>
            </Card>
          ))}

          <p className="text-xs text-sx-text-subtle">{snapshot.jobs.length} recent queue job{snapshot.jobs.length === 1 ? "" : "s"} inspected.</p>
        </>
      )}
    </div>
  );
}
