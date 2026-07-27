"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { sendAgentMessageAction, approveAgentActionAction, rejectAgentActionAction } from "./actions";

interface Message {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  parts: Array<{ type: string; actions?: Array<{ id: string; tool: string; input: Record<string, unknown> }> }>;
}

const QUICK_ACTIONS = ["Plan this week", "Check system health", "Analyze recent performance", "Create a campaign"];

export default function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Lets any page (e.g. Command Center's "Ask Autopilot" quick actions)
  // open this panel and submit a message without needing shared React state
  // across the layout boundary.
  useEffect(() => {
    function handleAsk(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      if (!text) return;
      setOpen(true);
      send(text);
    }
    window.addEventListener("saut:ask-agent", handleAsk);
    return () => window.removeEventListener("saut:ask-agent", handleAsk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, pending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: trimmed, parts: [] }]);
    setInput("");
    startTransition(async () => {
      const result = await sendAgentMessageAction(sessionId, trimmed);
      setSessionId(result.sessionId);
      if (result.blocked) {
        setBlockedReason(result.message ?? "Agent is blocked.");
        setMessages((prev) => [...prev, { id: `agent-${Date.now()}`, role: "agent", content: result.message ?? "Blocked.", parts: [] }]);
        return;
      }
      setBlockedReason(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-${Date.now()}`,
          role: "agent",
          content: result.text || "Done.",
          parts: result.proposedActions?.length ? [{ type: "proposed_actions", actions: result.proposedActions }] : [],
        },
      ]);
    });
  }

  function handleActionDecision(actionId: string, approve: boolean) {
    startTransition(async () => {
      if (approve) await approveAgentActionAction(actionId);
      else await rejectAgentActionAction(actionId);
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          parts: m.parts.map((p) =>
            p.type === "proposed_actions"
              ? { ...p, actions: p.actions?.filter((a) => a.id !== actionId) }
              : p
          ),
        }))
      );
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Autopilot Agent"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:brightness-110"
        style={{ background: "var(--saut-accent)", color: "var(--saut-accent-on)" }}
      >
        <span
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full saut-pulse"
          style={{ background: "var(--saut-ai)" }}
          aria-hidden
        />
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="10" cy="10" r="2.6" />
          <circle cx="10" cy="10" r="7" />
        </svg>
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l sm:w-[380px]"
      style={{ background: "var(--saut-surface-1)", borderColor: "var(--saut-border)" }}
      role="complementary"
      aria-label="Autopilot Agent"
    >
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--saut-border)" }}>
        <div className="flex items-center gap-2">
          <span
            className="h-[6px] w-[6px] rounded-full saut-pulse"
            style={{ background: pending ? "var(--saut-ai)" : "var(--saut-success)" }}
            aria-hidden
          />
          <span className="saut-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--saut-text-muted)" }}>
            {pending ? "Working…" : "Autopilot Agent"}
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close Agent panel"
          className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs"
        >
          Close
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--saut-text-muted)" }}>
              Ask me anything about your social operation — I understand the page you&apos;re on.
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((qa) => (
                <button key={qa} onClick={() => send(qa)} className="saut-btn saut-btn-secondary !h-7 !px-2.5 text-[11px]">
                  {qa}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={
                m.role === "user"
                  ? { background: "var(--saut-accent-muted)", marginLeft: "20%" }
                  : { background: "var(--saut-surface-2)", border: "1px solid var(--saut-border)" }
              }
            >
              {m.content}
            </div>
            {m.parts.map((part, i) =>
              part.type === "proposed_actions" && part.actions?.length ? (
                <div key={i} className="space-y-2">
                  {part.actions.map((a) => (
                    <div key={a.id} className="saut-card-2 p-3 text-xs">
                      <div className="saut-mono mb-1 uppercase tracking-wide" style={{ color: "var(--saut-warning)" }}>
                        Needs approval · {a.tool}
                      </div>
                      <pre className="mb-2 overflow-x-auto whitespace-pre-wrap break-all" style={{ color: "var(--saut-text-muted)" }}>
                        {JSON.stringify(a.input, null, 2)}
                      </pre>
                      <div className="flex gap-2">
                        <button onClick={() => handleActionDecision(a.id, true)} className="saut-btn saut-btn-primary !h-7 !px-2.5 text-[11px]">
                          Approve
                        </button>
                        <button onClick={() => handleActionDecision(a.id, false)} className="saut-btn saut-btn-ghost !h-7 !px-2.5 text-[11px]">
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </div>
        ))}
        {blockedReason && (
          <div className="saut-chip saut-chip-warning">
            <span className="saut-chip-dot" /> Agent blocked
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t p-3"
        style={{ borderColor: "var(--saut-border)" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Autopilot…"
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
