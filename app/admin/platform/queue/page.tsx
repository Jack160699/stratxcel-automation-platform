"use client";

import { useEffect, useState } from "react";
import { useTenantId } from "../useTenantId";
import { TenantIdBar } from "../TenantIdBar";

interface QueueJob {
  id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
  last_error: Record<string, unknown> | null;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-600/20 text-slate-400",
  LEASED: "bg-sky-400/15 text-sky-300",
  RETRY_SCHEDULED: "bg-amber-400/15 text-amber-300",
  SUCCEEDED: "bg-emerald-400/15 text-emerald-300",
  FAILED: "bg-rose-400/15 text-rose-300",
  DEAD_LETTER: "bg-rose-500/20 text-rose-200",
  CANCELLED: "bg-slate-600/20 text-slate-500",
};

export default function QueuePage() {
  const [tenantId, setTenantId] = useTenantId();
  const [jobs, setJobs] = useState<QueueJob[] | null>(null);
  const [deadLetter, setDeadLetter] = useState<QueueJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      setError(null);
      const res = await fetch(`/api/platform/queue?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Failed to load queue (HTTP ${res.status})`);
        return;
      }
      setJobs(body.jobs);
      setDeadLetter(body.deadLetter);
    }
    load();
  }, [tenantId]);

  return (
    <div className="flex flex-col gap-6">
      <TenantIdBar tenantId={tenantId} onChange={setTenantId} />
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {!tenantId && <p className="text-sm text-slate-500">Set a tenant ID above to view queue status.</p>}

      {deadLetter && deadLetter.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-medium text-rose-300">Dead letter ({deadLetter.length})</h2>
          <ul className="flex flex-col gap-2">
            {deadLetter.map((j) => (
              <li key={j.id} className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-3 text-sm">
                <p className="font-medium text-rose-200">{j.job_type}</p>
                <p className="text-xs text-rose-400">
                  {j.attempt_count}/{j.max_attempts} attempts · {JSON.stringify(j.last_error)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {jobs && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-medium text-slate-200">Recent jobs ({jobs.length})</h2>
          {jobs.length === 0 && <p className="text-sm text-slate-500">No jobs yet.</p>}
          {jobs.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-slate-900/60 text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Attempts</th>
                    <th className="px-4 py-2 font-medium">Scheduled</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t border-slate-800">
                      <td className="px-4 py-3 text-slate-200">{j.job_type}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[j.status] ?? "bg-slate-600/20 text-slate-400"}`}>
                          {j.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {j.attempt_count}/{j.max_attempts}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{new Date(j.scheduled_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
