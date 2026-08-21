"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTenantAgentSession } from "./useTenantAgentSession";
import { listTenantSessionsAction } from "./tenant-actions";
import { PublishReviewCard, PublishReviewGroup } from "./PublishReviewCard";
import { SxAgentMarkdown } from "./SxAgentMarkdown";
import { sanitizeUserFacingText } from "@/lib/social/agent/user-facing-text";
import { PUBLISH_INTENT_TOOLS, platformLabel } from "@/lib/social/agent/publish-outcome-classify";
import { groupEventsIntoStages } from "../../../admin/(shell)/social/copilot/execution-stages";
import { groupSessionsByRecency } from "../../../admin/(shell)/social/copilot/session-groups";
import type { AgentSessionRow } from "@/lib/social/repositories/agent";

const QUICK_ACTIONS: { icon: React.ReactNode; tint: string; label: string; prompt: string }[] = [
  {
    tint: "rgba(27,95,227,0.06)",
    label: "Plan my content for this week",
    prompt: "Plan my social media content for this week",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B5FE3" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
    ),
  },
  {
    tint: "rgba(217,119,6,0.06)",
    label: "What should I post next?",
    prompt: "What should I post next?",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
    ),
  },
  {
    tint: "rgba(225,48,108,0.06)",
    label: "Write an Instagram caption",
    prompt: "Write an Instagram caption for my latest offer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E1306C" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
    ),
  },
  {
    tint: "rgba(22,163,74,0.06)",
    label: "How did my posts perform?",
    prompt: "How did my recent posts perform?",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
    ),
  },
  {
    // Real backing: list_content (available to tenants) — not inspect_jobs, which
    // is hard-blocked for tenant sessions and would always fail.
    tint: "rgba(100,116,139,0.06)",
    label: "What's my content status?",
    prompt: "What's the status of my recent content?",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    ),
  },
  {
    tint: "rgba(139,134,128,0.08)",
    label: "What is my brand voice?",
    prompt: "What is my brand voice and tone?",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5c5a56" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
    ),
  },
];

function BotAvatar({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sx-sm ${pulsing ? "sx-status-pulse" : ""}`}
      style={{ background: "linear-gradient(135deg, var(--sx-accent), #3b82f6)" }}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2L18 7v6l-8 5-8-5V7l8-5z" stroke="#fff" strokeWidth="1.5" /></svg>
    </span>
  );
}

/** Real, grouped "what's happening" progress — derived from actual run events (execution-stages.ts), never invented step text. */
function WorkingIndicator({ run, runEvents }: { run: { status: string } | null; runEvents: Parameters<typeof groupEventsIntoStages>[0] }) {
  const stages = useMemo(() => groupEventsIntoStages(runEvents, run?.status), [runEvents, run?.status]);
  const visible = stages.filter((s) => s.id !== "final");
  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-sx-md border border-sx-border bg-sx-surface-1 px-3.5 py-3">
        <span className="h-2 w-2 rounded-full bg-sx-accent sx-status-pulse" />
        <span className="text-[13px] text-sx-text-muted">Working on it…</span>
      </div>
    );
  }
  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5">
      <div className="flex flex-col gap-2.5">
        {visible.map((stage) => (
          <div key={stage.key} className="flex items-center gap-2.5">
            {stage.status === "success" ? (
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-sx-success">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
            ) : stage.status === "failed" ? (
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-sx-danger">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </span>
            ) : stage.status === "running" ? (
              <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-sx-accent sx-status-pulse" />
            ) : (
              <span className="h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-sx-border-strong" />
            )}
            <span className={`text-[14px] ${stage.status === "pending" ? "text-sx-text-subtle" : "font-semibold text-sx-text"}`}>{stage.title}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-sx-text-subtle">This usually takes a few seconds…</p>
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: { platform?: string; accountLabel?: string; permalink?: string; publishedAt?: string | null } }) {
  const when = receipt.publishedAt ? new Date(receipt.publishedAt) : null;
  return (
    <div className="overflow-hidden rounded-sx-lg border border-sx-success/25 bg-sx-surface-1">
      <div className="border-b border-sx-success/15 bg-sx-success/5 p-4 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sx-success/10">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
        <p className="mt-2.5 text-[16px] font-bold text-sx-text">Published successfully</p>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center gap-2.5">
          <div>
            <p className="text-[14px] font-semibold text-sx-text">{receipt.platform ? platformLabel(receipt.platform) : "Live"}</p>
            {receipt.accountLabel && <p className="text-xs text-sx-text-subtle">{receipt.accountLabel}</p>}
          </div>
          {when && !Number.isNaN(when.getTime()) && (
            <span className="ml-auto text-xs text-sx-text-subtle">{when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
          )}
        </div>
        {receipt.permalink && (
          <a
            href={receipt.permalink}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center justify-center gap-1.5 rounded-sx-sm border-[1.5px] border-sx-border text-[13px] font-semibold text-sx-accent"
          >
            View post
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Growth Assistant — real customer chat surface, StratXcel App reference
 * chrome. Same real data layer as before (useTenantAgentSession,
 * tenant-actions.ts) — only the presentation changed: a calm mobile-first
 * single-thread chat instead of the admin-shared saut-* three-pane
 * workspace, matching the approved "StratXcel Growth Assistant.dc.html"
 * reference screen-for-screen (Empty/Chat/Working/Draft/Publish/Multi/
 * Receipt/Error/Trust/History states).
 *
 * Deliberately NOT implemented: the reference's "Carousel" (multi-image
 * generation) state — generate_image is hard-blocked for tenant sessions
 * (lib/social/agent/tools.ts) and the reference itself labels that state
 * "Design preview · Image generation coming soon", so there is nothing
 * real to wire it to yet.
 */
export function GrowthAssistantChat({ tenantId, initialSessions }: { tenantId: string; initialSessions: AgentSessionRow[] }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<AgentSessionRow[]>(initialSessions);
  const { messages, pending, loadingHistory, blockedReason, failedReason, run, runEvents, send, approve, reject } = useTenantAgentSession(
    tenantId,
    sessionId,
    setSessionId
  );
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function openHistory() {
    setShowHistory(true);
    listTenantSessionsAction(tenantId, 30)
      .then(setSessions)
      .catch(() => undefined);
  }

  function submit(text: string) {
    const value = text.trim();
    if (!value) return;
    send(value);
    setInput("");
  }

  const groups = useMemo(() => groupSessionsByRecency(sessions), [sessions]);

  return (
    <div className="sx-customer-app flex h-[calc(100dvh-8.5rem)] min-h-[420px] flex-col overflow-hidden rounded-sx-lg border border-sx-border bg-sx-bg md:h-[calc(100vh-9.5rem)]">
      {/* Header */}
      {showHistory ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-sx-border bg-sx-surface-1 px-4 py-3">
          <button type="button" onClick={() => setShowHistory(false)} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-sx-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text)" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <p className="flex-1 text-[17px] font-bold text-sx-text">Conversations</p>
          <button
            type="button"
            onClick={() => {
              setSessionId(null);
              setShowHistory(false);
            }}
            className="text-[13px] font-semibold text-sx-accent"
          >
            New chat
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between border-b border-sx-border bg-sx-surface-1 px-4 py-3">
          <div>
            <p className="text-[17px] font-bold text-sx-text">Growth Assistant</p>
            <p className="mt-0.5 text-xs text-sx-text-subtle">व्यापार सहायक · Ask me to help grow your business</p>
          </div>
          <button
            type="button"
            onClick={openHistory}
            aria-label="Conversation history"
            className="flex h-9 w-9 items-center justify-center rounded-sx-sm bg-sx-accent-muted text-sx-accent"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h12" /></svg>
          </button>
        </div>
      )}

      {/* Body */}
      {showHistory ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {groups.length === 0 && <p className="text-sm text-sx-text-subtle">No conversations yet.</p>}
          {groups.map((group) => (
            <div key={group.label} className="mb-3.5">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-sx-text-subtle">{group.label}</p>
              <div className="flex flex-col gap-1.5">
                {group.sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSessionId(s.id);
                      setShowHistory(false);
                    }}
                    className="flex items-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 text-left transition-colors hover:border-sx-accent/40"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent-muted">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sx-accent)" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-sx-text">{s.title || "Untitled conversation"}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-sx-text-subtle">{new Date(s.updated_at).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          {loadingHistory && <p className="text-xs text-sx-text-subtle">Loading conversation…</p>}

          {!loadingHistory && messages.length === 0 && (
            <div className="flex flex-col items-center pt-4 text-center">
              <span
                className="flex h-[60px] w-[60px] items-center justify-center rounded-sx-lg shadow-lg"
                style={{ background: "linear-gradient(135deg, var(--sx-accent), #3b82f6)" }}
              >
                <svg width="28" height="28" viewBox="0 0 20 20" fill="none"><path d="M10 2L18 7v6l-8 5-8-5V7l8-5z" stroke="#fff" strokeWidth="1.5" /></svg>
              </span>
              <p className="mt-4 text-xl font-bold text-sx-text">How can I help your business grow today?</p>
              <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    type="button"
                    onClick={() => submit(qa.prompt)}
                    className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3 text-left transition-colors hover:border-sx-accent/40"
                  >
                    <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-sx-sm" style={{ background: qa.tint }}>
                      {qa.icon}
                    </span>
                    <span className="block text-[13px] font-semibold leading-snug text-sx-text">{qa.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-5 max-w-[260px] text-xs text-sx-text-subtle">
                Uses your Brand Brain and connected accounts to give you accurate, personalised help.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {messages.map((message) => {
              const isUser = message.role === "user";
              const proposedParts = message.parts.filter((p) => p.type === "proposed_actions" && p.actions?.length);
              const receiptParts = message.parts.filter((p) => p.type === "publish_receipt");
              return (
                <div key={message.id} className="flex flex-col gap-2">
                  <div className={`flex items-start gap-2 ${isUser ? "justify-end" : ""}`}>
                    {!isUser && <BotAvatar />}
                    <div
                      className={
                        isUser
                          ? "max-w-[260px] rounded-[14px_4px_14px_14px] bg-sx-accent px-3 py-2.5 text-[14px] leading-relaxed text-sx-accent-on"
                          : "max-w-[290px] rounded-[4px_14px_14px_14px] border border-sx-border bg-sx-surface-1 px-3 py-2.5"
                      }
                    >
                      {isUser ? message.content : <SxAgentMarkdown content={sanitizeUserFacingText(message.content)} />}
                    </div>
                  </div>
                  {proposedParts.map((part, idx) => {
                    const actions = (part.actions ?? []) as { id: string; tool: string; input: Record<string, unknown> }[];
                    const publishActions = actions.filter((a) => PUBLISH_INTENT_TOOLS.has(a.tool));
                    const otherActions = actions.filter((a) => !PUBLISH_INTENT_TOOLS.has(a.tool));
                    return (
                      <div key={idx} className="ml-9 flex flex-col gap-2">
                        {publishActions.length === 1 && (
                          <PublishReviewCard action={publishActions[0]} tenantId={tenantId} onApprove={approve} onReject={reject} />
                        )}
                        {publishActions.length > 1 && (
                          <PublishReviewGroup actions={publishActions} tenantId={tenantId} onApprove={approve} onReject={reject} />
                        )}
                        {otherActions.map((action) => (
                          <div key={action.id} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-sx-warning">Review required</p>
                            <p className="mt-1 text-[14px] font-semibold text-sx-text">{action.tool.replaceAll("_", " ")}</p>
                            <div className="mt-2.5 flex justify-end gap-2">
                              <button type="button" onClick={() => reject(action.id)} className="h-8 px-3 text-xs font-semibold text-sx-text-muted">Reject</button>
                              <button type="button" onClick={() => approve(action.id)} className="h-8 rounded-sx-sm bg-sx-accent px-3 text-xs font-semibold text-sx-accent-on">Approve</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {receiptParts.map((part, idx) => (
                    <div key={idx} className="ml-9">
                      <ReceiptCard receipt={part as { platform?: string; accountLabel?: string; permalink?: string; publishedAt?: string | null }} />
                    </div>
                  ))}
                </div>
              );
            })}

            {pending && (
              <div className="flex items-start gap-2">
                <BotAvatar pulsing />
                <div className="max-w-[280px] flex-1">
                  <WorkingIndicator run={run} runEvents={runEvents} />
                </div>
              </div>
            )}

            {(blockedReason || failedReason) && (
              <div className="flex items-start gap-2">
                <BotAvatar />
                <div className="max-w-[290px] rounded-[4px_14px_14px_14px] border-[1.5px] border-sx-danger/20 bg-sx-danger/[0.04] px-3 py-2.5">
                  <p className="text-[13px] font-semibold text-sx-danger">Something went wrong</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-sx-text-muted">{blockedReason || failedReason}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Composer */}
      {!showHistory && (
        <div className="shrink-0 border-t border-sx-border bg-sx-surface-1 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              placeholder="Ask Growth Assistant…"
              disabled={pending}
              className="h-11 flex-1 rounded-sx-pill bg-sx-surface-2 px-4 text-[14px] text-sx-text placeholder:text-sx-text-subtle focus:outline-none"
            />
            <button
              type="button"
              onClick={() => submit(input)}
              disabled={pending || !input.trim()}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sx-accent text-white disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
