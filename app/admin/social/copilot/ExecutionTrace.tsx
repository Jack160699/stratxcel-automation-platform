"use client";

import { useEffect, useState } from "react";
import type { AgentRunEventRow, AgentRunRow } from "@/lib/social/repositories/agent-runs";

function EventGlyph({ event, active }: { event: AgentRunEventRow; active: boolean }) {
  const color = event.status === "FAILED"
    ? "var(--saut-danger)"
    : active
      ? "var(--saut-ai)"
      : event.status === "PENDING"
        ? "var(--saut-warning)"
        : "var(--saut-success)";
  return <span aria-hidden className={`saut-mono ${active ? "saut-pulse" : ""}`} style={{ color }}>{event.status === "FAILED" ? "×" : active ? "●" : event.status === "PENDING" ? "○" : "✓"}</span>;
}

function safeDetail(event: AgentRunEventRow) {
  const entries = Object.entries(event.meta ?? {}).filter(([key, value]) =>
    key !== "durationMs" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
  );
  return entries;
}

export function ExecutionTrace({ run, events }: { run: AgentRunRow | null; events: AgentRunEventRow[] }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (run?.status !== "RUNNING") return;
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [run?.status]);

  if (!run || events.length === 0) {
    return <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Real operations appear here as they happen.</p>;
  }

  const running = run.status === "RUNNING";
  const elapsedMs = (run.completed_at ? new Date(run.completed_at).getTime() : now || new Date(run.started_at).getTime()) - new Date(run.started_at).getTime();
  return (
    <div>
      <div className="saut-mono mb-3 text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
        {running ? "Working" : "Worked"} for {Math.max(0, Math.round(elapsedMs / 1000))}s
      </div>
      <ul className="space-y-2" aria-label="Live execution trace">
        {events.map((event, index) => {
          const active = running && index === events.length - 1;
          const duration = typeof event.meta?.durationMs === "number" ? `${(event.meta.durationMs / 1000).toFixed(1)}s` : null;
          const details = safeDetail(event);
          return (
            <li key={event.id} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
              <span className="mt-px w-3.5 shrink-0 text-center"><EventGlyph event={event} active={active} /></span>
              <div className="min-w-0">
                <span style={{ color: event.status === "FAILED" ? "var(--saut-danger)" : "var(--saut-text)" }}>{event.label}</span>
                {duration && <span className="saut-mono ml-1 text-[9px]" style={{ color: "var(--saut-text-subtle)" }}>{duration}</span>}
                {details.length > 0 && (
                  <details className="text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
                    <summary>View details</summary>
                    {details.map(([key, value]) => <div key={key}>{key.replaceAll("_", " ")}: {String(value)}</div>)}
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {run.status === "FAILED" && run.error_reason && <p className="mt-3 text-xs" style={{ color: "var(--saut-danger)" }}>{run.error_reason}</p>}
    </div>
  );
}
