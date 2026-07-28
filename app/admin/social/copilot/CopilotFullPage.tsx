"use client";

import { useEffect, useRef, useState } from "react";
import { AgentMessage } from "../agent/AgentMessage";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { AgentSessionRow } from "@/lib/social/repositories/agent";
import type { EffectiveProviderIdentity } from "@/lib/social/agent/provider";
import { useCopilot } from "./CopilotContext";
import { useAgentSession } from "./useAgentSession";
import { ExecutionTrace } from "./ExecutionTrace";
import { groupSessionsByDay } from "./session-groups";
import { quickActionsForPath } from "./quick-actions";

interface VariantRow {
  id: string;
  platform: string;
  status: string;
  updated_at: string;
  content_master: { title: string; content_pillar: string } | null;
}

function SessionRail({
  sessions,
  activeId,
  onSelect,
  onNew,
}: {
  sessions: AgentSessionRow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="saut-agent-rail saut-agent-left p-3" aria-label="Copilot sessions">
      <button onClick={onNew} className="saut-btn saut-btn-secondary mb-4 w-full justify-center">+ New conversation</button>
      {groupSessionsByDay(sessions).map((group) => (
        <section key={group.label} className="mb-4">
          <div className="saut-section-title mb-1.5">{group.label}</div>
          {group.sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className="mb-1 block w-full rounded-lg px-2.5 py-2 text-left"
              style={session.id === activeId
                ? { background: "var(--saut-accent-muted)", color: "var(--saut-text)" }
                : { color: "var(--saut-text-muted)" }}
            >
              <span className="block truncate text-xs font-medium">{session.title || "Untitled session"}</span>
              <span className="saut-mono mt-1 block text-[9px] uppercase" style={{ color: "var(--saut-text-subtle)" }}>{session.status}</span>
            </button>
          ))}
        </section>
      ))}
      <section className="mt-5 border-t pt-4" style={{ borderColor: "var(--saut-border)" }}>
        <div className="saut-section-title mb-2">Shortcuts</div>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--saut-text-subtle)" }}>Quick prompts are available in the empty canvas.</p>
      </section>
    </aside>
  );
}

export function CopilotFullPage({
  initialSessions,
  initialVariants,
  provider,
}: {
  initialSessions: AgentSessionRow[];
  initialVariants: VariantRow[];
  provider: EffectiveProviderIdentity;
}) {
  const { sessionId, setSessionId, dockAndReturn } = useCopilot();
  const { messages, pending, loadingHistory, failedReason, run, runEvents, session, send, approve, reject } =
    useAgentSession(sessionId, setSessionId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, runEvents]);

  const submit = () => {
    const value = input.trim();
    if (!value) return;
    send(value);
    setInput("");
  };
  const brandUsed = runEvents.some((event) => event.tool_name === "inspect_brand");
  const accountsUsed = runEvents.some((event) => event.tool_name === "inspect_accounts");
  const missionTitle = session?.title || messages.find((message) => message.role === "user")?.content || "New conversation";

  return (
    <div className="saut-agent-workspace">
      <SessionRail sessions={initialSessions} activeId={sessionId} onSelect={setSessionId} onNew={() => setSessionId(null)} />

      <section className="saut-agent-canvas flex min-h-0 flex-col" aria-label="Agent work canvas">
        <header className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--saut-border)" }}>
          <div className="min-w-0">
            <div className="saut-section-title">Stratxcel Copilot</div>
            <h1 className="truncate text-sm font-semibold">{missionTitle}</h1>
          </div>
          <span className={`saut-chip ml-auto ${pending ? "saut-chip-ai" : "saut-chip-neutral"}`}>
            <span className={`saut-chip-dot ${pending ? "saut-pulse" : ""}`} />{pending ? "Working" : "Ready"}
          </span>
          <button onClick={dockAndReturn} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">Dock</button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {loadingHistory ? <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Loading session…</p> : null}
          {!loadingHistory && messages.length === 0 ? (
            <div className="mx-auto mt-16 max-w-lg space-y-4">
              <EmptyState hint="Give Copilot a mission and watch real operations appear in Progress.">What should we work on?</EmptyState>
              <div className="flex flex-wrap justify-center gap-2">
                {quickActionsForPath("/admin/social").map((action) => (
                  <button key={action} onClick={() => send(action)} className="saut-btn saut-btn-secondary text-xs">{action}</button>
                ))}
              </div>
            </div>
          ) : messages.map((message) => <AgentMessage key={message.id} message={message} onApprove={approve} onReject={reject} />)}
          {failedReason && <div className="saut-chip saut-chip-danger"><span className="saut-chip-dot" />Failed · {failedReason}</div>}
        </div>

        <div className="border-t p-3" style={{ borderColor: "var(--saut-border)" }}>
          <div className="mb-2 text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>Context · Social Autopilot</div>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Give Copilot a mission…"
              aria-label="Message Copilot"
              className="saut-input saut-agent-composer flex-1"
              disabled={pending}
            />
            <button onClick={submit} disabled={pending || !input.trim()} className="saut-btn saut-btn-primary">Send</button>
          </div>
        </div>
      </section>

      <aside className="saut-agent-rail saut-agent-right p-4" aria-label="Progress and context">
        <section>
          <div className="saut-section-title mb-2">Current mission</div>
          <p className="mb-4 text-sm font-medium leading-snug">{missionTitle}</p>
          <div className="saut-section-title mb-3">Progress</div>
          <ExecutionTrace run={run} events={runEvents} />
        </section>

        <section className="mt-6 border-t pt-4" style={{ borderColor: "var(--saut-border)" }}>
          <div className="saut-section-title mb-3">Context</div>
          {!brandUsed && !accountsUsed ? (
            <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Accessed context appears here during the run.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {brandUsed && <div className="saut-card-2 p-2.5">Brand Brain · Used in this run</div>}
              {accountsUsed && <div className="saut-card-2 p-2.5">Connected accounts · Checked</div>}
            </div>
          )}
        </section>

        <section className="mt-6 border-t pt-4" style={{ borderColor: "var(--saut-border)" }}>
          <div className="saut-section-title mb-3">Working with</div>
          <div className="space-y-2">
            {initialVariants.length === 0 ? <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No artifacts yet.</p> :
              initialVariants.slice(0, 4).map((variant) => (
                <a key={variant.id} href="/admin/social/create" className="saut-card-2 block p-2.5 text-xs">
                  <span className="block truncate">{variant.content_master?.title || `${variant.platform} draft`}</span>
                  <span className="mt-1 flex items-center gap-2"><StatusBadge label={variant.status} /></span>
                </a>
              ))}
          </div>
        </section>

        <section className="mt-6 border-t pt-4 text-xs" style={{ borderColor: "var(--saut-border)" }}>
          <div className="saut-section-title mb-3">Connected systems</div>
          <div className="space-y-2">
            <div className="flex justify-between gap-3"><span>Supabase</span><span style={{ color: "var(--saut-success)" }}>Available</span></div>
            <div className="flex justify-between gap-3"><span>AI Provider</span><span>{provider.provider}</span></div>
            <div className="flex justify-between gap-3"><span>Protocol</span><span>{provider.protocol}</span></div>
            <div className="truncate text-right" title={provider.model} style={{ color: "var(--saut-text-subtle)" }}>{provider.model}</div>
          </div>
        </section>
      </aside>
    </div>
  );
}
