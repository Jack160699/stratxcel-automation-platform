"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AgentMessage } from "../agent/AgentMessage";
import { useCopilot } from "./CopilotContext";
import { useAgentSession } from "./useAgentSession";
import { quickActionsForPath, contextChipForPath } from "./quick-actions";

export function CopilotDockPanel() {
  const { sessionId, setSessionId, minimize, close, openFullPage } = useCopilot();
  const pathname = usePathname();
  const { messages, pending, blockedReason, failedReason, run, runEvents, send, approve, reject } = useAgentSession(sessionId, setSessionId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handleAsk(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      if (text) send(text);
    }
    window.addEventListener("saut:ask-agent", handleAsk);
    return () => window.removeEventListener("saut:ask-agent", handleAsk);
  }, [send]);

  const latestEvent = runEvents[runEvents.length - 1];
  const activityLine = pending && latestEvent ? latestEvent.label : pending ? "Working…" : "Operations copilot";
  const contextChip = contextChipForPath(pathname);

  return (
    <aside
      className="saut-copilot-dock flex h-full min-h-0 flex-col border-l"
      style={{ background: "var(--saut-surface-1)", borderColor: "var(--saut-border)" }}
      role="complementary"
      aria-label="Stratxcel Copilot"
    >
      <div className="flex items-center gap-2.5 border-b px-4 py-3.5" style={{ borderColor: "var(--saut-border)" }}>
        <span
          className="h-[7px] w-[7px] shrink-0 rounded-full saut-pulse"
          style={{ background: pending ? "var(--saut-ai)" : "var(--saut-success)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="saut-mono text-[11.5px] uppercase tracking-[0.12em]" style={{ color: "var(--saut-text)" }}>
            Copilot
          </div>
          <div className="truncate text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>
            {activityLine}
          </div>
        </div>
        <button onClick={minimize} aria-label="Minimize Copilot" title="Minimize" className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
          Min
        </button>
        <button onClick={openFullPage} aria-label="Open Copilot full page" title="Open full page" className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
          Expand
        </button>
        <button onClick={close} aria-label="Close Copilot panel" title="Close" className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
          Close
        </button>
      </div>

      {contextChip && (
        <div className="border-b px-4 py-2" style={{ borderColor: "var(--saut-border)" }}>
          <span className="saut-chip saut-chip-info">
            <span className="saut-chip-dot" /> Context · {contextChip}
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed" style={{ color: "var(--saut-text-muted)" }}>
              Ask me anything about your social operation — I understand the page you&apos;re on.
            </p>
            <div className="flex flex-wrap gap-2">
              {quickActionsForPath(pathname).map((qa) => (
                <button key={qa} onClick={() => send(qa)} className="saut-btn saut-btn-secondary !h-7 !px-2.5 text-[11px]">
                  {qa}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <AgentMessage key={m.id} message={m} onApprove={approve} onReject={reject} />
        ))}
        {blockedReason && (
          <div className="saut-chip saut-chip-warning">
            <span className="saut-chip-dot" /> Agent blocked
          </div>
        )}
        {failedReason && (
          <div className="saut-chip saut-chip-danger">
            <span className="saut-chip-dot" /> Failed — {failedReason}
          </div>
        )}
        {run?.status === "RUNNING" && <p className="text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>{activityLine}…</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
          setInput("");
        }}
        className="flex gap-2 border-t p-3"
        style={{ borderColor: "var(--saut-border)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot…"
          aria-label="Message Copilot"
          className="saut-input flex-1"
          disabled={pending}
        />
        <button type="submit" disabled={pending || !input.trim()} className="saut-btn saut-btn-primary !px-3">
          Send
        </button>
      </form>
    </aside>
  );
}
