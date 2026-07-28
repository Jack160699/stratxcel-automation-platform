"use client";

import { useEffect, useRef, useState } from "react";
import { AgentMessage } from "../agent/AgentMessage";
import { MissionCard } from "../components/MissionCard";
import { EmptyState } from "../components/EmptyState";
import { PlatformIcon, type Platform } from "../components/PlatformIcon";
import { StatusBadge } from "../components/StatusBadge";
import type { AgentSessionRow } from "@/lib/social/repositories/agent";
import { useCopilot } from "./CopilotContext";
import { useAgentSession } from "./useAgentSession";
import { ExecutionTrace } from "./ExecutionTrace";
import { groupSessionsByDay } from "./session-groups";
import { quickActionsForPath } from "./quick-actions";

interface VariantRow {
  id: string;
  master_id: string;
  platform: string;
  status: string;
  created_at: string;
  updated_at: string;
  content_master: { title: string; content_pillar: string } | null;
}

function fmt(iso: string) {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

function OutputCard({ variant }: { variant: VariantRow }) {
  const isScheduled = variant.status === "SCHEDULED" || variant.status === "PUBLISHED";
  const href = isScheduled ? "/admin/social/planner" : "/admin/social/create";
  return (
    <a
      href={href}
      className="saut-card-2 flex items-start gap-2.5 p-3 text-xs transition hover:border-[var(--saut-border-strong)]"
    >
      <PlatformIcon platform={variant.platform as Platform} size={18} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium" style={{ color: "var(--saut-text)" }}>
          {variant.content_master?.title ?? "Untitled content"}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge label={variant.status} />
          <span className="saut-mono text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>
            Updated {fmt(variant.updated_at)}
          </span>
        </div>
      </div>
    </a>
  );
}

function SessionHistory({
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
  const groups = groupSessionsByDay(sessions);
  return (
    <div className="saut-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="saut-section-title">Sessions</span>
        <button onClick={onNew} className="saut-btn saut-btn-ghost !h-6 !px-2 text-[11px]">
          New
        </button>
      </div>
      {sessions.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
          No sessions yet.
        </p>
      ) : (
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="saut-mono mb-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--saut-text-subtle)" }}>
                {group.label}
              </div>
              <div className="space-y-1">
                {group.sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={
                      s.id === activeId
                        ? { background: "var(--saut-accent-muted)", color: "var(--saut-text)" }
                        : { color: "var(--saut-text-muted)" }
                    }
                  >
                    {s.title || "Untitled session"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CopilotFullPage({
  initialSessions,
  initialVariants,
}: {
  initialSessions: AgentSessionRow[];
  initialVariants: VariantRow[];
}) {
  const { sessionId, setSessionId, dockAndReturn } = useCopilot();
  const { messages, pending, loadingHistory, blockedReason, failedReason, run, runEvents, session, send, approve, reject } =
    useAgentSession(sessionId, setSessionId);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const pendingApprovals = messages.reduce((n, m) => n + m.parts.reduce((c, p) => c + (p.type === "proposed_actions" ? p.actions?.length ?? 0 : 0), 0), 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--saut-text)" }}>
            Stratxcel Copilot
          </h1>
          <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
            Your personal operations agent — plans, drafts, schedules, and analyzes with you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setHistoryOpen((v) => !v)} className="saut-btn saut-btn-secondary !h-8 text-xs">
            History
          </button>
          <button onClick={dockAndReturn} className="saut-btn saut-btn-secondary !h-8 text-xs">
            Dock Copilot
          </button>
        </div>
      </div>

      {historyOpen && (
        <SessionHistory
          sessions={initialSessions}
          activeId={sessionId}
          onSelect={(id) => {
            setSessionId(id);
            setHistoryOpen(false);
          }}
          onNew={() => {
            setSessionId(null);
            setHistoryOpen(false);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Conversation — the dominant workspace */}
        <div className="saut-card flex min-h-[520px] flex-col">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {loadingHistory ? (
              <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
                Loading session…
              </p>
            ) : messages.length === 0 ? (
              <div className="space-y-3">
                <EmptyState hint="Ask about your social operation, or try a quick action.">No conversation yet.</EmptyState>
                <div className="flex flex-wrap gap-2">
                  {quickActionsForPath("/admin/social").map((qa) => (
                    <button key={qa} onClick={() => send(qa)} className="saut-btn saut-btn-secondary !h-7 !px-2.5 text-[11px]">
                      {qa}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <AgentMessage key={m.id} message={m} onApprove={approve} onReject={reject} />)
            )}
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
            <button type="submit" disabled={pending || !input.trim()} className="saut-btn saut-btn-primary !px-4">
              Send
            </button>
          </form>
        </div>

        {/* Operations context */}
        <div className="flex flex-col gap-4">
          <div className="saut-card p-4">
            <div className="saut-section-title mb-3">Current mission</div>
            {session ? (
              <MissionCard status={session.status} title={session.title || "Untitled session"} createdAt={session.created_at} updatedAt={session.updated_at} />
            ) : (
              <EmptyState hint="Start a conversation to give Copilot something to work on.">No active mission.</EmptyState>
            )}
          </div>

          <div className="saut-card-ai p-4">
            <div className="saut-section-title mb-3">Live execution</div>
            <ExecutionTrace run={run} events={runEvents} />
          </div>

          {pendingApprovals > 0 && (
            <div className="saut-card p-4">
              <div className="saut-section-title mb-2">Waiting for your approval</div>
              <p className="text-xs" style={{ color: "var(--saut-text-muted)" }}>
                {pendingApprovals} action{pendingApprovals === 1 ? "" : "s"} queued in the conversation — review and approve or reject above.
              </p>
            </div>
          )}

          <div className="saut-card p-4">
            <div className="saut-section-title mb-3">Recent outputs</div>
            {initialVariants.length === 0 ? (
              <EmptyState>No content generated yet.</EmptyState>
            ) : (
              <div className="space-y-2">
                {initialVariants.map((v) => (
                  <OutputCard key={v.id} variant={v} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
