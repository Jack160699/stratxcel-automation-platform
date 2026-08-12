"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentRunEventRow, AgentRunRow } from "@/lib/social/repositories/agent-runs";
import { activeStageKey, currentActionLabel, groupEventsIntoStages, type ExecutionStage, type StageStatus } from "./execution-stages";

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

function StageRow({
  stage,
  open,
  onToggle,
  rowRef,
}: {
  stage: ExecutionStage;
  open: boolean;
  onToggle: (open: boolean) => void;
  rowRef: (node: HTMLDetailsElement | null) => void;
}) {
  // The stage's headline reflects its FINAL outcome only — a failed attempt
  // that a later retry recovered from stays visible below, but never turns
  // the whole stage red (see Section 3 of the live-progress cleanup brief).
  const failedEvent = stage.events.find((event) => event.type === "TOOL_FAILED" && event.status === "FAILED");
  const showFailureReason = stage.status === "failed" && typeof failedEvent?.meta?.reason === "string";
  const durationLabel = stage.durationMs !== null ? `${(stage.durationMs / 1000).toFixed(1)}s` : stage.status === "running" ? "Working…" : null;
  return (
    <details
      ref={rowRef}
      className="saut-stage-accordion"
      open={open}
      onToggle={(event) => onToggle((event.target as HTMLDetailsElement).open)}
    >
      <summary className="saut-stage-summary">
        <StageGlyph status={stage.status} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: stage.status === "failed" ? "var(--saut-danger)" : "var(--saut-text)" }}>
          {stage.title}
          {stage.recovered && (
            <span className="saut-mono ml-1.5 font-normal" style={{ color: "var(--saut-text-subtle)" }}>
              · completed after retry
            </span>
          )}
        </span>
        {durationLabel && (
          <span className="saut-mono shrink-0 text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
            {durationLabel}
          </span>
        )}
      </summary>
      <div className="saut-stage-body">
        {showFailureReason && (
          <p className="mb-2 text-[11.5px]" style={{ color: "var(--saut-danger)" }}>
            {String(failedEvent!.meta.reason)}
          </p>
        )}
        {stage.recovered && (
          <p className="mb-2 text-[10.5px]" style={{ color: "var(--saut-text-subtle)" }}>
            An earlier attempt in this stage failed and was automatically retried — see the failed attempt below.
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

function buildCompactLines(stages: ExecutionStage[], events: AgentRunEventRow[]): string[] {
  const completedStages = stages.filter((stage) => stage.status === "success" || stage.status === "pending");
  const postCount = events.filter((event) => event.tool_name === "schedule_post" && event.type === "TOOL_COMPLETED").length;
  if (completedStages.length === 0) {
    return ["Run complete"];
  }
  const lines = completedStages.map((stage) => stage.title);
  if (postCount > 0) {
    const publishingIndex = lines.findIndex((line) => line === "Publishing");
    const postLine = `${postCount} ${postCount === 1 ? "post" : "posts"} prepared`;
    if (publishingIndex >= 0) lines[publishingIndex] = postLine;
    else lines.push(postLine);
  }
  return lines;
}

export function ExecutionTrace({
  run,
  events,
  waitingForApproval = false,
  compactByDefault = false,
}: {
  run: AgentRunRow | null;
  events: AgentRunEventRow[];
  /** Session is WAITING_FOR_CHOICE — the mission is still open even though the run itself finished executing. */
  waitingForApproval?: boolean;
  /** Prefer a compact summary over the full stage accordion (e.g. when awaiting approval). */
  compactByDefault?: boolean;
}) {
  const [now, setNow] = useState(0);
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const [showFullTrace, setShowFullTrace] = useState(false);
  const stageRefs = useRef(new Map<string, HTMLDetailsElement>());
  const stageListRef = useRef<HTMLDivElement>(null);

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

  const hasActiveStages = stages.some((stage) => stage.status === "running" || stage.status === "pending" || stage.status === "failed");
  const runSettled = run?.status !== "RUNNING" && run?.status !== "FAILED";
  const preferCompact = compactByDefault || waitingForApproval || (runSettled && !hasActiveStages && stages.length > 0);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const showFullStages = preferCompact ? detailsExpanded : true;

  const compactLines = useMemo(() => buildCompactLines(stages, events), [stages, events]);

  // Auto-follow: scroll only when the ACTIVE stage identity changes (a new
  // stage starts, one fails, or one starts waiting for approval) — never on
  // every raw event, so the live console doesn't jitter (Section 11).
  const activeKey = useMemo(() => activeStageKey(stages), [stages]);
  useEffect(() => {
    if (!activeKey || !showFullStages) return;
    const viewport = stageListRef.current;
    const row = stageRefs.current.get(activeKey);
    if (!viewport || !row) return;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const visibleTop = viewport.scrollTop;
    const visibleBottom = visibleTop + viewport.clientHeight;
    if (rowTop < visibleTop) viewport.scrollTo({ top: rowTop, behavior: "smooth" });
    else if (rowBottom > visibleBottom) viewport.scrollTo({ top: rowBottom - viewport.clientHeight, behavior: "smooth" });
    // Intentionally depend on activeKey only — auto-follow must not re-fire on every event.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showFullStages is a gate, not a follow trigger
  }, [activeKey]);

  if (!run || events.length === 0) {
    return <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Real operations appear here as they happen.</p>;
  }

  const elapsedMs = (run.completed_at ? new Date(run.completed_at).getTime() : now || new Date(run.started_at).getTime()) - new Date(run.started_at).getTime();

  return (
    <div className="saut-exec-trace flex h-full min-h-0 flex-col">
      {currentAction && (
        <div className="saut-current-action mb-2 shrink-0" role="status" aria-live="polite">
          <span className="saut-section-title">Currently</span>
          <span className={`saut-mono block text-[11.5px] ${running || waitingForApproval ? "saut-pulse" : ""}`} style={{ color: "var(--saut-ai)" }}>
            {currentAction}
          </span>
        </div>
      )}
      <div className="saut-mono mb-2 shrink-0 text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
        {running ? "Working" : "Worked"} for {Math.max(0, Math.round(elapsedMs / 1000))}s
      </div>

      {!showFullStages && preferCompact ? (
        <div className="saut-exec-compact shrink-0" aria-label="Run summary">
          <ul className="saut-exec-compact-list">
            {compactLines.map((line) => (
              <li key={line} className="saut-exec-compact-line">
                <span aria-hidden style={{ color: "var(--saut-success)" }}>✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="saut-exec-compact-expand saut-mono text-[10px]"
            onClick={() => setDetailsExpanded(true)}
          >
            View run details
          </button>
        </div>
      ) : (
        <>
          {preferCompact && (
            <button
              type="button"
              className="saut-exec-compact-collapse saut-mono mb-2 shrink-0 text-[10px]"
              onClick={() => setDetailsExpanded(false)}
              style={{ color: "var(--saut-text-subtle)" }}
            >
              Hide run details
            </button>
          )}
          <div ref={stageListRef} className="saut-stage-list space-y-1.5" aria-label="Execution stages">
            {stages.map((stage, index) => {
              const isLast = index === stages.length - 1;
              // Active (running/pending-approval) or failed stages open by
              // default; a recovered/completed stage collapses on its own
              // unless the user pinned it open (see Section 10).
              const defaultOpen = stage.status === "failed" || stage.status === "pending" || (stage.status === "running" && isLast);
              const open = pinned[stage.key] ?? defaultOpen;
              return (
                <StageRow
                  key={stage.key}
                  stage={stage}
                  open={open}
                  onToggle={(nextOpen) => setPinned((current) => ({ ...current, [stage.key]: nextOpen }))}
                  rowRef={(node) => {
                    if (node) stageRefs.current.set(stage.key, node);
                    else stageRefs.current.delete(stage.key);
                  }}
                />
              );
            })}
          </div>
        </>
      )}

      {run.status === "FAILED" && run.error_reason && (
        <p className="mt-2 shrink-0 text-xs" style={{ color: "var(--saut-danger)" }}>
          {run.error_reason}
        </p>
      )}

      <details className="saut-full-trace mt-2 shrink-0" open={showFullTrace} onToggle={(event) => setShowFullTrace((event.target as HTMLDetailsElement).open)}>
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
