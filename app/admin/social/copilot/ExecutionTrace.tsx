"use client";

import type { AgentRunEventRow, AgentRunRow } from "@/lib/social/repositories/agent-runs";

// Renders the REAL execution trace for a run — only events that actually
// happened, in the order they happened. This is an operational trace, not a
// simulation: there is no "upcoming step" placeholder, because we don't
// fabricate steps that haven't occurred yet.

function EventGlyph({ event, isLast, running }: { event: AgentRunEventRow; isLast: boolean; running: boolean }) {
  if (event.status === "FAILED") {
    return (
      <span aria-hidden className="saut-mono text-[13px]" style={{ color: "var(--saut-danger)" }}>
        ✗
      </span>
    );
  }
  if (isLast && running) {
    return (
      <span
        aria-hidden
        className="saut-pulse saut-mono inline-block text-[13px]"
        style={{ color: "var(--saut-ai)" }}
      >
        ●
      </span>
    );
  }
  if (event.status === "PENDING") {
    return (
      <span aria-hidden className="saut-mono text-[13px]" style={{ color: "var(--saut-warning)" }}>
        ○
      </span>
    );
  }
  return (
    <span aria-hidden className="saut-mono text-[13px]" style={{ color: "var(--saut-success)" }}>
      ✓
    </span>
  );
}

function metaSuffix(event: AgentRunEventRow): string | null {
  const meta = event.meta ?? {};
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (key === "durationMs" || key === "reason") continue;
    if (typeof value === "number") parts.push(`${value} ${key}`);
  }
  if (parts.length) return parts.join(" · ");
  if (typeof meta.reason === "string") return meta.reason;
  return null;
}

export function ExecutionTrace({ run, events }: { run: AgentRunRow | null; events: AgentRunEventRow[] }) {
  if (!run || events.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
        No activity yet. Live execution steps appear here while Copilot is working.
      </p>
    );
  }

  const running = run.status === "RUNNING";

  return (
    <ul className="space-y-2" aria-label="Live execution trace">
      {events.map((event, i) => {
        const suffix = metaSuffix(event);
        return (
          <li key={event.id} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
            <span className="mt-[1px] w-3.5 shrink-0 text-center">
              <EventGlyph event={event} isLast={i === events.length - 1} running={running} />
            </span>
            <span style={{ color: event.status === "FAILED" ? "var(--saut-danger)" : "var(--saut-text)" }}>
              {event.label}
              {suffix ? <span style={{ color: "var(--saut-text-subtle)" }}> — {suffix}</span> : null}
            </span>
          </li>
        );
      })}
      {run.status === "FAILED" && run.error_reason ? (
        <li className="text-[12.5px]" style={{ color: "var(--saut-danger)" }}>
          {run.error_reason}
        </li>
      ) : null}
    </ul>
  );
}
