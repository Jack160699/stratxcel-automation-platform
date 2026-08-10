"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentRunEventRow, AgentRunRow } from "@/lib/social/repositories/agent-runs";
import { currentActionLabel, groupEventsIntoStages, type ExecutionStage, type StageStatus } from "./execution-stages";

function StageGlyph({ status }: { status: StageStatus }) {
  const color =
    status === "failed" ? "var(--saut-danger)" : status === "running" ? "var(--saut-ai)" : status === "pending" ? "var(--saut-warning)" : "var(--saut-success)";
  const symbol = status === "failed" ? "✕" : status === "running" ? "●" : status === "pending" ? "○" : "✓";
  return (
    <span aria-hidden className={`saut-mono ${status === "running" ? "saut-pulse" : ""}`} style={{ color }}>
      {symbol}
    </span>
  );
}

function safeDetail(event: AgentRunEventRow) {
  return Object.entries(event.meta ?? {}).filter(
    ([key, value]) => key !== "durationMs" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
  );
}

function EventRow({ event }: { event: AgentRunEventRow }) {
  const duration = typeof event.meta?.durationMs === "number" ? `${(event.meta.durationMs / 1000).toFixed(1)}s` : null;
  const details = safeDetail(event);
  return (
    <li className="flex items-start gap-2 text-[11.5px] leading-relaxed">
      <span className="mt-px w-3.5 shrink-0 text-center saut-mono" style={{ color: event.status === "FAILED" ? "var(--saut-danger)" : "var(--saut-text-subtle)" }}>
        {event.status === "FAILED" ? "×" : event.status === "PENDING" ? "○" : "✓"}
      </span>
      <div className="min-w-0">
        <span style={{ color: event.status === "FAILED" ? "var(--saut-danger)" : "var(--saut-text-muted)" }}>{event.label}</span>
        {duration && (
          <span className="saut-mono ml-1 text-[9px]" style={{ color: "var(--saut-text-subtle)" }}>
            {duration}
          </span>
        )}
        {details.length > 0 && (
          <details className="text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
            <summary>View details</summary>
            {details.map(([key, value]) => (
              <div key={key}>
                {key.replaceAll("_", " ")}: {String(value)}
              </div>
            ))}
          </details>
        )}
      </div>
    </li>
  );
}

function StageRow({ stage, open, onToggle }: { stage: ExecutionStage; open: boolean; onToggle: (open: boolean) => void }) {
  const failureReason = stage.status === "failed" ? stage.events.find((event) => event.status === "FAILED")?.meta?.reason : undefined;
  const durationLabel = stage.durationMs !== null ? `${(stage.durationMs / 1000).toFixed(1)}s` : stage.status === "running" ? "Working…" : null;
  return (
    <details
      className="saut-stage-accordion"
      open={open}
      onToggle={(event) => onToggle((event.target as HTMLDetailsElement).open)}
    >
      <summary className="saut-stage-summary">
        <StageGlyph status={stage.status} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: stage.status === "failed" ? "var(--saut-danger)" : "var(--saut-text)" }}>
          {stage.title}
        </span>
        {durationLabel && (
          <span className="saut-mono shrink-0 text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
            {durationLabel}
          </span>
        )}
      </summary>
      <div className="saut-stage-body">
        {typeof failureReason === "string" && (
          <p className="mb-2 text-[11.5px]" style={{ color: "var(--saut-danger)" }}>
            {failureReason}
          </p>
        )}
        {stage.providerCalls > 0 && (
          <p className="mb-1.5 saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
            AI processing · {stage.providerCalls} call{stage.providerCalls === 1 ? "" : "s"} · {(stage.providerDurationMs / 1000).toFixed(1)}s
          </p>
        )}
        <ul className="space-y-1.5">
          {stage.events
            .filter((event) => event.type !== "PROVIDER_REQUEST_STARTED" && event.type !== "PROVIDER_RESPONSE_RECEIVED")
            .map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
        </ul>
      </div>
    </details>
  );
}

export function ExecutionTrace({
  run,
  events,
  waitingForApproval = false,
}: {
  run: AgentRunRow | null;
  events: AgentRunEventRow[];
  /** Session is WAITING_FOR_CHOICE — the mission is still open even though the run itself finished executing. */
  waitingForApproval?: boolean;
}) {
  const [now, setNow] = useState(0);
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const [showFullTrace, setShowFullTrace] = useState(false);

  useEffect(() => {
    if (run?.status !== "RUNNING") return;
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [run?.status]);

  const stages = useMemo(() => groupEventsIntoStages(events, run?.status), [events, run?.status]);
  const running = run?.status === "RUNNING";
  const currentAction = useMemo(
    () => currentActionLabel(events, running, waitingForApproval),
    [events, running, waitingForApproval]
  );

  if (!run || events.length === 0) {
    return <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Real operations appear here as they happen.</p>;
  }

  const elapsedMs = (run.completed_at ? new Date(run.completed_at).getTime() : now || new Date(run.started_at).getTime()) - new Date(run.started_at).getTime();

  return (
    <div>
      {currentAction && (
        <div className="saut-current-action mb-3" role="status" aria-live="polite">
          <span className="saut-section-title">Currently</span>
          <span className={`saut-mono block text-[11.5px] ${running || waitingForApproval ? "saut-pulse" : ""}`} style={{ color: "var(--saut-ai)" }}>
            {currentAction}
          </span>
        </div>
      )}
      <div className="saut-mono mb-3 text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
        {running ? "Working" : "Worked"} for {Math.max(0, Math.round(elapsedMs / 1000))}s
      </div>

      <div className="space-y-1.5" aria-label="Execution stages">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          const defaultOpen = stage.status === "failed" || (stage.status === "running" && isLast);
          const open = pinned[stage.key] ?? defaultOpen;
          return (
            <StageRow
              key={stage.key}
              stage={stage}
              open={open}
              onToggle={(nextOpen) => setPinned((current) => ({ ...current, [stage.key]: nextOpen }))}
            />
          );
        })}
      </div>

      {run.status === "FAILED" && run.error_reason && (
        <p className="mt-3 text-xs" style={{ color: "var(--saut-danger)" }}>
          {run.error_reason}
        </p>
      )}

      <details className="saut-full-trace mt-3" open={showFullTrace} onToggle={(event) => setShowFullTrace((event.target as HTMLDetailsElement).open)}>
        <summary className="saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
          View full technical trace ({events.length} event{events.length === 1 ? "" : "s"})
        </summary>
        <ul className="mt-2 space-y-1.5" aria-label="Full chronological execution trace">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ul>
      </details>
    </div>
  );
}
