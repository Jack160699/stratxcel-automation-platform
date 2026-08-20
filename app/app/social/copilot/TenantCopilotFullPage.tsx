"use client";

// Tenant-scoped mirror of app/admin/(shell)/social/copilot/CopilotFullPage.tsx.
// Reuses the same proven, presentational pieces as-is (AgentMessage,
// ExecutionTrace, ResizableWorkspace, CopilotProvider/useCopilot,
// session-groups, quick-actions, EmptyState/StatusBadge) — only the data
// layer (useTenantAgentSession instead of useAgentSession, tenant-scoped
// server actions) and the composer are different. The composer here is
// text-only: attachment upload and voice notes have no tenant-scoped
// storage path yet (see lib/social/agent-tenant-context.ts and the
// matching guards in lib/social/agent/tools.ts), so that UI is removed
// rather than left present-but-broken.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgentMessage } from "../../../admin/(shell)/social/agent/AgentMessage";
import { EmptyState } from "../../../admin/(shell)/social/components/EmptyState";
import { StatusBadge } from "../../../admin/(shell)/social/components/StatusBadge";
import type { AgentSessionRow } from "@/lib/social/repositories/agent";
import type { EffectiveProviderIdentity } from "@/lib/social/agent/provider";
import { useCopilot } from "../../../admin/(shell)/social/copilot/CopilotContext";
import { useTenantAgentSession } from "./useTenantAgentSession";
import { ExecutionTrace } from "../../../admin/(shell)/social/copilot/ExecutionTrace";
import { ResizableWorkspace } from "../../../admin/(shell)/social/copilot/ResizableWorkspace";
import { defaultOpenGroups, groupSessionsByRecency, type SessionGroupLabel } from "../../../admin/(shell)/social/copilot/session-groups";
import { quickActionsForPath } from "../../../admin/(shell)/social/copilot/quick-actions";

interface VariantRow {
  id: string;
  platform: string;
  status: string;
  updated_at: string;
  content_master: { title: string; content_pillar: string } | null;
}

function humanSessionStatus(status: string): string {
  switch (status) {
    case "READY":
      return "Ready for review";
    case "IDLE":
      return "Idle";
    case "RUNNING":
      return "Working";
    case "WAITING_FOR_CHOICE":
      return "Waiting for input";
    case "ATTENTION_REQUIRED":
    case "FAILED":
      return "Needs attention";
    default:
      return status
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
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
  const groups = useMemo(() => groupSessionsByRecency(sessions), [sessions]);
  const [openGroups, setOpenGroups] = useState<Set<SessionGroupLabel>>(() => defaultOpenGroups(groups, activeId));

  useEffect(() => {
    if (!activeId) return;
    const owner = groups.find((group) => group.sessions.some((session) => session.id === activeId));
    if (owner && !openGroups.has(owner.label)) {
      setOpenGroups((current) => new Set(current).add(owner.label));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, groups]);

  return (
    <aside className="saut-agent-rail saut-agent-left flex h-full min-h-0 flex-col" aria-label="Copilot sessions">
      <div className="shrink-0 p-2.5 pb-0">
        <button onClick={onNew} className="saut-btn saut-btn-secondary mb-2 w-full justify-center !h-8 text-xs">+ New conversation</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5 pt-0">
        {groups.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>No conversations yet.</p>
        )}
        {groups.map((group) => {
          const open = openGroups.has(group.label);
          return (
            <details
              key={group.label}
              className="mb-1"
              open={open}
              onToggle={(event) => {
                const next = (event.target as HTMLDetailsElement).open;
                setOpenGroups((current) => {
                  const updated = new Set(current);
                  if (next) updated.add(group.label);
                  else updated.delete(group.label);
                  return updated;
                });
              }}
            >
              <summary className="saut-session-group-summary">
                <span className="saut-section-title">{group.label}</span>
                <span className="text-[9px]" style={{ color: "var(--saut-text-subtle)" }}>{group.sessions.length}</span>
              </summary>
              <div className="mt-0.5">
                {group.sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSelect(session.id)}
                    aria-current={session.id === activeId ? "true" : undefined}
                    className="saut-session-row mb-0.5 block w-full rounded-md px-2 py-1 text-left"
                    style={session.id === activeId
                      ? { background: "var(--saut-accent-muted)", color: "var(--saut-text)" }
                      : { color: "var(--saut-text-muted)" }}
                  >
                    <span className="block truncate text-[12px] font-medium leading-snug">{session.title || "Untitled session"}</span>
                    <span className="mt-0.5 block truncate text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>{humanSessionStatus(session.status)}</span>
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </aside>
  );
}

function RailModule({
  title,
  defaultOpen,
  badge,
  className,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={`saut-rail-module${className ? ` ${className}` : ""}`}
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="saut-rail-module-summary">
        <span className="saut-section-title">{title}</span>
        {badge}
      </summary>
      <div className="saut-rail-module-body">{children}</div>
    </details>
  );
}

export function TenantCopilotFullPage({
  tenantId,
  initialSessions,
  initialVariants,
  provider,
}: {
  tenantId: string;
  initialSessions: AgentSessionRow[];
  initialVariants: VariantRow[];
  provider: EffectiveProviderIdentity;
}) {
  const { sessionId, setSessionId } = useCopilot();
  const { messages, pending, loadingHistory, failedReason, run, runEvents, session, send, approve, reject } =
    useTenantAgentSession(tenantId, sessionId, setSessionId);
  const activePublishActions = useMemo(() => messages.flatMap((message) => message.parts.flatMap((part) =>
    part.type === "proposed_actions" ? (part.actions ?? []).filter((action) => ["schedule_post", "execute_youtube_verification", "execute_private_youtube_verification"].includes(action.tool)) : []
  )), [messages]);
  const [input, setInput] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const sessionRail = (
    <SessionRail
      sessions={initialSessions}
      activeId={sessionId}
      onSelect={(id) => setSessionId(id)}
      onNew={() => setSessionId(null)}
    />
  );
  const waitingForApproval = session?.status === "WAITING_FOR_CHOICE";
  const preferCompactProgress = waitingForApproval || (!pending && activePublishActions.length > 0);
  const reviewMode = preferCompactProgress;
  const enteredReviewRef = useRef(false);

  useEffect(() => {
    if (reviewMode && !enteredReviewRef.current) {
      enteredReviewRef.current = true;
      const timer = setTimeout(() => setFocusMode(true), 0);
      return () => clearTimeout(timer);
    }
    if (!reviewMode) enteredReviewRef.current = false;
  }, [reviewMode]);

  const canvas = (
    <section className="saut-agent-canvas flex min-h-0 flex-col" aria-label="Agent work canvas">
      <header className="saut-canvas-header flex items-center gap-2.5 border-b px-3" style={{ borderColor: "var(--saut-border)" }}>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{missionTitle}</h1>
        <span className={`saut-chip shrink-0 ${pending ? "saut-chip-ai" : "saut-chip-neutral"}`}>
          <span className={`saut-chip-dot ${pending ? "saut-pulse" : ""}`} />{pending ? "Working" : "Ready"}
        </span>
        <button
          type="button"
          onClick={() => setFocusMode((value) => !value)}
          className={`saut-btn saut-btn-ghost !h-7 !px-2 text-xs${focusMode ? " saut-focus-active" : ""}`}
          aria-pressed={focusMode}
          aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
          title={focusMode ? "Exit focus mode" : "Focus mode — maximize artifact"}
        >
          Focus
        </button>
        <button onClick={() => setSessionId(null)} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">New</button>
      </header>

      <div ref={scrollRef} className="saut-history-compact min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loadingHistory ? <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Loading session…</p> : null}
        {!loadingHistory && messages.length === 0 ? (
          <div className="mx-auto mt-16 max-w-lg space-y-4">
            <EmptyState hint="Give Copilot a mission and watch real operations appear in Progress.">What should we work on?</EmptyState>
            <div className="flex flex-wrap justify-center gap-2">
              {quickActionsForPath("/app/social/copilot").map((action) => (
                <button key={action} onClick={() => send(action)} className="saut-btn saut-btn-secondary text-xs">{action}</button>
              ))}
            </div>
          </div>
        ) : messages.map((message) => (
          <AgentMessage
            key={message.id}
            message={message}
            onApprove={approve}
            onReject={reject}
            compactSources={reviewMode}
            tenantId={tenantId}
          />
        ))}
        {failedReason && <div className="saut-chip saut-chip-danger"><span className="saut-chip-dot" />Failed · {failedReason}</div>}
      </div>

      <div id="saut-review-dock" className="saut-review-dock" data-sticky-review-dock-host="true" />

      <div className="saut-composer-shell border-t" style={{ borderColor: "var(--saut-border)" }}>
        <div className={`saut-unified-composer${input.includes("\n") ? " is-expanded" : " is-idle"}`} data-busy={pending}>
          <div className="saut-composer-row">
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
              }}
              placeholder="Message Copilot…"
              aria-label="Message Copilot"
              className="saut-composer-textarea"
              disabled={pending}
            />
            <button onClick={submit} disabled={pending || !input.trim()} className="saut-composer-send" aria-label="Send message">↑</button>
          </div>
        </div>
      </div>
    </section>
  );
  const contextAccessed = brandUsed || accountsUsed;

  const progress = (
    <div className="saut-progress-rail">
      <RailModule title="Current mission" defaultOpen>
        <p className="text-sm font-medium leading-snug">{missionTitle}</p>
      </RailModule>
      <RailModule title="Progress" defaultOpen className="saut-progress-module">
        <ExecutionTrace
          run={run}
          events={runEvents}
          waitingForApproval={waitingForApproval}
          compactByDefault={preferCompactProgress}
        />
      </RailModule>
    </div>
  );
  const context = reviewMode ? (
    <div className="saut-ready-context-quiet" aria-hidden />
  ) : (
    <div>
      <RailModule title="Context" defaultOpen={contextAccessed}>
        {!contextAccessed ? (
          <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Accessed context appears here during the run.</p>
        ) : (
          <div className="space-y-2 text-xs">
            {brandUsed && <div className="saut-card-2 p-2.5">Brand Brain · Used in this run</div>}
            {accountsUsed && <div className="saut-card-2 p-2.5">Connected accounts · Checked</div>}
          </div>
        )}
      </RailModule>

      <RailModule title="Working with" defaultOpen={false}>
        <div className="space-y-2">
          {activePublishActions.length > 0 ? activePublishActions.map((action) => {
            const platform = typeof action.input.platform === "string" ? action.input.platform : action.tool.includes("youtube") ? "YouTube" : "Platform";
            return <div key={action.id} className="saut-card-2 p-2.5 text-xs">
              <strong className="block capitalize">{platform}</strong>
              <span className="mt-0.5 block truncate" style={{ color: "var(--saut-text-muted)" }}>{missionTitle}</span>
              <span className="mt-1 flex items-center gap-2"><StatusBadge label="Ready" /></span>
            </div>;
          }) : initialVariants.length === 0 ? <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No artifacts yet.</p> :
            initialVariants.slice(0, 4).map((variant) => (
              <div key={variant.id} className="saut-card-2 block p-2.5 text-xs">
                <strong className="block capitalize">{variant.platform}</strong>
                <span className="mt-0.5 block truncate">{variant.content_master?.title || `${variant.platform} draft`}</span>
                <span className="mt-1 flex items-center gap-2"><StatusBadge label={humanSessionStatus(variant.status)} /></span>
              </div>
            ))}
        </div>
      </RailModule>

      <RailModule title="Connected systems" defaultOpen={false}>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between gap-3"><span>AI Provider</span><span>{provider.provider}</span></div>
          <div className="flex justify-between gap-3"><span>Protocol</span><span>{provider.protocol}</span></div>
          <div className="truncate text-right" title={provider.model} style={{ color: "var(--saut-text-subtle)" }}>{provider.model}</div>
        </div>
      </RailModule>
    </div>
  );

  return (
    <ResizableWorkspace
      left={sessionRail}
      center={canvas}
      progress={progress}
      context={context}
      focusMode={focusMode}
      readyReview={reviewMode}
      onExitFocus={() => setFocusMode(false)}
    />
  );
}
