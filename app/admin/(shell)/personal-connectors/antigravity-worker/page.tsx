"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { platformFetch } from "@/lib/admin/platform-fetch";

interface WorkerData {
  status: "online" | "busy" | "offline" | "error";
  health: "healthy" | "degraded" | "unavailable";
  reason: string | null;
  machineId: string;
  antigravityVersion: string;
  capabilities: string[];
  authorizedWorkspaces: Array<{
    name: string;
    companyId: string;
    rootPath: string;
    allowedBranches: string[];
    status: string;
  }>;
  instances: Array<{
    instanceId: string;
    status: string;
    lastHeartbeatAt: string;
    staleForSeconds: number;
    version: string | null;
    lastError: Record<string, unknown> | null;
  }>;
  recentJobs: Array<{
    id: string;
    tenant_id: string;
    job_type: string;
    payload: Record<string, unknown>;
    status: string;
    created_at: string;
    completed_at: string | null;
    last_error: Record<string, unknown> | null;
  }>;
  lastCheckedAt: string;
}

export default function AntigravityWorkerAdminPage() {
  const [data, setData] = useState<WorkerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await platformFetch("/api/admin/antigravity-worker");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load worker status");
      setData(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(true), 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const isOnline = data?.status === "online" || data?.status === "busy";
  const primaryInstance = data?.instances?.[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/personal-connectors"
              className="text-xs text-sx-text-muted hover:text-white transition-colors"
            >
              ← Back to Personal Connectors
            </Link>
          </div>
          <AdminPageHeader
            title="Antigravity Local Worker"
            description="Autonomous coding execution bridge running on Founder Windows workstation. Secure outbound polling with zero inbound ports."
          />
        </div>

        <div className="flex items-center gap-3">
          <StatusChip
            state={data?.status === "busy" ? "accent" : isOnline ? "success" : "danger"}
            pulse={isOnline}
          >
            {data?.status === "busy" ? "Busy (Executing)" : isOnline ? "Online & Polling" : "Worker Offline"}
          </StatusChip>
          <button
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="rounded-sx-md border border-sx-border bg-sx-surface-2 px-3 py-1.5 text-xs font-medium text-white hover:bg-sx-surface-3 transition-colors disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-sx-md border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          Error loading worker status: {error}
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-5">
          <CardHeading className="text-xs uppercase tracking-wider text-sx-text-muted">
            Execution Environment
          </CardHeading>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Host Machine:</span>
              <span className="font-mono text-white text-xs">{data?.machineId || "founder-win11"}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Antigravity IDE:</span>
              <span className="font-mono text-emerald-400 text-xs font-semibold">
                v{data?.antigravityVersion || "1.107.0"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Connection Type:</span>
              <span className="text-xs text-white">Outbound-Only HTTPS</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Inbound Ports:</span>
              <span className="text-xs text-emerald-400">Zero Open (Secure)</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeading className="text-xs uppercase tracking-wider text-sx-text-muted">
            Queue & Heartbeat Health
          </CardHeading>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Heartbeat State:</span>
              <span className="capitalize text-xs text-white">{data?.health || "checking..."}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Last Heartbeat:</span>
              <span className="font-mono text-xs text-white">
                {primaryInstance?.lastHeartbeatAt
                  ? new Date(primaryInstance.lastHeartbeatAt).toLocaleTimeString()
                  : "Never"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Heartbeat Age:</span>
              <span className="text-xs text-white">
                {primaryInstance?.staleForSeconds !== undefined ? `${primaryInstance.staleForSeconds}s ago` : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Job Channel:</span>
              <span className="font-mono text-xs text-cyan-400">mission.coding_task</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeading className="text-xs uppercase tracking-wider text-sx-text-muted">
            Founder Control Safety
          </CardHeading>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Active Session Protection:</span>
              <span className="text-xs text-emerald-400 font-semibold">Active & Enforced</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Uncommitted Diff Check:</span>
              <span className="text-xs text-white">Automatic Yield</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Founder Lockfile:</span>
              <span className="font-mono text-xs text-white">.founder-lock</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-sx-text-muted">Conflict Action:</span>
              <span className="text-xs text-amber-300">Wait in Queue (No Steal)</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Authorized Workspaces */}
      <Card className="p-6">
        <CardHeading className="text-sm font-semibold text-white mb-4">
          Company & Workspace Containment Allowlist
        </CardHeading>
        <p className="text-xs text-sx-text-muted mb-4">
          The local worker operates strictly within these explicit filesystem boundaries. Remote requests targeting any other path or repository are automatically rejected to preserve absolute company and multi-tenant isolation.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-sx-border text-sx-text-muted">
              <tr>
                <th className="pb-3 font-medium">Workspace Name</th>
                <th className="pb-3 font-medium">Company ID</th>
                <th className="pb-3 font-medium">Local Path</th>
                <th className="pb-3 font-medium">Branch Policy</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sx-border/40 font-mono">
              {(data?.authorizedWorkspaces ?? []).map((ws, i) => (
                <tr key={i} className="hover:bg-sx-surface-2/40">
                  <td className="py-3 font-sans font-medium text-white">{ws.name}</td>
                  <td className="py-3 text-cyan-400">{ws.companyId}</td>
                  <td className="py-3 text-sx-text-muted">{ws.rootPath}</td>
                  <td className="py-3 text-sx-text-muted">{ws.allowedBranches.join(", ")}</td>
                  <td className="py-3">
                    <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                      {ws.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent Coding Missions */}
      <Card className="p-6">
        <CardHeading className="text-sm font-semibold text-white mb-4">
          Recent Coding Task Executions
        </CardHeading>
        {(!data?.recentJobs || data.recentJobs.length === 0) ? (
          <div className="py-8 text-center text-xs text-sx-text-muted">
            No recent coding tasks found in the execution queue.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-sx-border text-sx-text-muted">
                <tr>
                  <th className="pb-3 font-medium">Job ID</th>
                  <th className="pb-3 font-medium">Objective</th>
                  <th className="pb-3 font-medium">Tenant</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sx-border/40 font-mono">
                {data.recentJobs.map((job) => {
                  const payload = job.payload as any;
                  return (
                    <tr key={job.id} className="hover:bg-sx-surface-2/40">
                      <td className="py-3 text-sx-text-muted">{job.id.slice(0, 8)}...</td>
                      <td className="py-3 font-sans font-medium text-white max-w-md truncate">
                        {payload?.objective || "Execute coding task"}
                      </td>
                      <td className="py-3 text-cyan-400">{job.tenant_id.slice(0, 8)}...</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            job.status === "SUCCEEDED"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : job.status === "LEASED"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : job.status === "FAILED"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="py-3 text-sx-text-muted">
                        {new Date(job.created_at).toLocaleTimeString()}
                      </td>
                      <td className="py-3 text-sx-text-muted">
                        {job.completed_at ? new Date(job.completed_at).toLocaleTimeString() : "In flight"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
