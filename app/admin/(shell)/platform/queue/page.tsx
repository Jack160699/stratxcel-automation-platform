"use client";

import { useEffect, useState } from "react";
import { useCurrentTenant } from "../../CurrentTenantContext";
import { NoClientSelected } from "../NoClientSelected";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Card, CardHeading } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";

interface QueueJob {
  id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
  last_error: Record<string, unknown> | null;
}

const STATUS_CHIP: Record<string, { label: string; state: ChipState }> = {
  PENDING: { label: "Pending", state: "neutral" },
  LEASED: { label: "Leased", state: "accent" },
  RETRY_SCHEDULED: { label: "Retry scheduled", state: "warning" },
  SUCCEEDED: { label: "Succeeded", state: "success" },
  FAILED: { label: "Failed", state: "danger" },
  DEAD_LETTER: { label: "Dead letter", state: "danger" },
  CANCELLED: { label: "Cancelled", state: "neutral" },
};

export default function QueuePage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const [jobs, setJobs] = useState<QueueJob[] | null>(null);
  const [deadLetter, setDeadLetter] = useState<QueueJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      setError(null);
      const res = await fetch(`/api/platform/queue?tenantId=${encodeURIComponent(tenantId!)}`);
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

  const columns: DataTableColumn<QueueJob>[] = [
    { key: "type", header: "Type", render: (j) => j.job_type },
    {
      key: "status",
      header: "Status",
      mobilePrimary: true,
      render: (j) => {
        const chip = STATUS_CHIP[j.status] ?? { label: j.status, state: "neutral" as ChipState };
        return <StatusChip state={chip.state}>{chip.label}</StatusChip>;
      },
    },
    { key: "attempts", header: "Attempts", render: (j) => `${j.attempt_count}/${j.max_attempts}` },
    { key: "scheduled", header: "Scheduled", render: (j) => new Date(j.scheduled_at).toLocaleString() },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Operations Queue{active ? ` — ${active.name}` : ""}</h1>
      </header>
      {error && <ErrorState message={error} />}
      {!tenantId && <NoClientSelected what="queue status" />}

      {deadLetter && deadLetter.length > 0 && (
        <Card variant="alert">
          <CardHeading>
            <span className="text-[#FF8A90]">Dead letter ({deadLetter.length})</span>
          </CardHeading>
          <div className="flex flex-col gap-2">
            {deadLetter.map((j) => (
              <div key={j.id} className="rounded-sx-sm border border-[rgb(242_86_95_/_0.3)] bg-[rgb(242_86_95_/_0.06)] p-3 text-sm">
                <p className="font-medium text-[#FF8A90]">{j.job_type}</p>
                <p className="text-xs text-[#FF8A90]/80">
                  {j.attempt_count}/{j.max_attempts} attempts · {JSON.stringify(j.last_error)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {jobs && (
        <section className="flex flex-col gap-3">
          <h2 className="font-sx-sans text-base font-medium text-sx-text">Recent jobs ({jobs.length})</h2>
          {jobs.length === 0 && <p className="text-sm text-sx-text-subtle">No jobs yet.</p>}
          {jobs.length > 0 && <DataTable columns={columns} rows={jobs} />}
        </section>
      )}
    </div>
  );
}
