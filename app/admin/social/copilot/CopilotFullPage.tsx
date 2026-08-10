"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgentMessage, type AgentAttachmentData } from "../agent/AgentMessage";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { AgentSessionRow } from "@/lib/social/repositories/agent";
import type { EffectiveProviderIdentity } from "@/lib/social/agent/provider";
import { uploadToSignedUrlWithProgress } from "@/lib/social/media-upload-client";
import { useCopilot } from "./CopilotContext";
import { useAgentSession } from "./useAgentSession";
import { ExecutionTrace } from "./ExecutionTrace";
import { ResizableWorkspace } from "./ResizableWorkspace";
import { defaultOpenGroups, groupSessionsByRecency, type SessionGroupLabel } from "./session-groups";
import { quickActionsForPath } from "./quick-actions";

interface VariantRow {
  id: string;
  platform: string;
  status: string;
  updated_at: string;
  content_master: { title: string; content_pillar: string } | null;
}

// The full-screen shell is fixed (see .saut-agent-workspace / 100dvh); this
// rail owns its own scroll area, so "+ New conversation" stays pinned above
// it and hundreds of sessions never grow the page — see Section 1/2 of the
// workspace repair brief.
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

  // If the active session lives in a currently-collapsed group (e.g. the
  // user picked an older session), open that group automatically — never
  // leave the active session hidden inside a collapsed date group.
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
      <div className="shrink-0 p-3 pb-0">
        <button onClick={onNew} className="saut-btn saut-btn-secondary mb-3 w-full justify-center">+ New conversation</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-0">
        {groups.length === 0 && (
          <p className="text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>No conversations yet.</p>
        )}
        {groups.map((group) => {
          const open = openGroups.has(group.label);
          return (
            <details
              key={group.label}
              className="mb-2"
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
                <span className="saut-section-title">{group.label.toUpperCase()}</span>
                <span className="saut-mono text-[9px]" style={{ color: "var(--saut-text-subtle)" }}>{group.sessions.length}</span>
              </summary>
              <div className="mt-1">
                {group.sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSelect(session.id)}
                    aria-current={session.id === activeId ? "true" : undefined}
                    className="mb-1 block w-full rounded-lg px-2.5 py-2 text-left"
                    style={session.id === activeId
                      ? { background: "var(--saut-accent-muted)", color: "var(--saut-text)" }
                      : { color: "var(--saut-text-muted)" }}
                  >
                    <span className="block truncate text-xs font-medium">{session.title || "Untitled session"}</span>
                    <span className="saut-mono mt-1 block text-[9px] uppercase" style={{ color: "var(--saut-text-subtle)" }}>{session.status}</span>
                  </button>
                ))}
              </div>
            </details>
          );
        })}
        <section className="mt-5 border-t pt-4" style={{ borderColor: "var(--saut-border)" }}>
          <div className="saut-section-title mb-2">Shortcuts</div>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--saut-text-subtle)" }}>Quick prompts are available in the empty canvas.</p>
        </section>
      </div>
    </aside>
  );
}

// One collapsible card for the right rail (Current Mission / Progress /
// Context / Working With / Connected Systems — Section 4 of the workspace
// repair brief). Each module owns its own open/closed state so expanding
// one never resizes or jumps the center canvas, and the rail itself keeps a
// single scrollbar (see .saut-agent-rail on the containing <aside>).
function RailModule({
  title,
  defaultOpen,
  badge,
  children,
}: {
  title: string;
  defaultOpen: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="saut-rail-module" open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}>
      <summary className="saut-rail-module-summary">
        <span className="saut-section-title">{title}</span>
        {badge}
      </summary>
      <div className="saut-rail-module-body">{children}</div>
    </details>
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
  const [attachments, setAttachments] = useState<AgentAttachmentData[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, runEvents]);

  const submit = () => {
    const value = input.trim();
    if (!value) return;
    send(value, attachments);
    setInput("");
    setAttachments([]);
  };
  const uploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files).slice(0, Math.max(0, 8 - attachments.length));
    if (!selected.length) return;
    setAttachmentError(null);
    setUploading(true);
    let activeSessionId = sessionId;
    try {
      for (const file of selected) {
        const prepareResponse = await fetch("/api/social/copilot/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "prepare",
            sessionId: activeSessionId,
            name: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });
        const prepared = await prepareResponse.json();
        if (!prepareResponse.ok) throw new Error(prepared.error ?? "Attachment upload failed");
        activeSessionId = prepared.sessionId as string;
        if (activeSessionId !== sessionId) setSessionId(activeSessionId);
        try {
          await uploadToSignedUrlWithProgress(prepared.signedUrl as string, file, setUploadProgress);
        } catch (uploadError) {
          await fetch(`/api/social/copilot/attachments?id=${encodeURIComponent(prepared.attachment.id as string)}`, { method: "DELETE" });
          throw uploadError;
        }
        const finalizeResponse = await fetch("/api/social/copilot/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finalize", attachmentId: prepared.attachment.id }),
        });
        const finalized = await finalizeResponse.json();
        if (!finalizeResponse.ok) {
          await fetch(`/api/social/copilot/attachments?id=${encodeURIComponent(prepared.attachment.id as string)}`, { method: "DELETE" });
          throw new Error(finalized.error ?? "Attachment processing failed");
        }
        const row = finalized.attachment as {
          id: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          processing_status: AgentAttachmentData["processingStatus"];
          media_asset_id: string | null;
        };
        setAttachments((current) => [...current, {
          id: row.id,
          name: row.original_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          processingStatus: row.processing_status,
          mediaAssetId: row.media_asset_id,
        }]);
      }
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Attachment upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };
  const removeAttachment = async (attachment: AgentAttachmentData) => {
    const response = await fetch(`/api/social/copilot/attachments?id=${encodeURIComponent(attachment.id)}`, { method: "DELETE" });
    if (response.ok) {
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      return;
    }
    const result = await response.json().catch(() => ({}));
    setAttachmentError(result.error ?? "Attachment removal failed");
  };
  const brandUsed = runEvents.some((event) => event.tool_name === "inspect_brand");
  const accountsUsed = runEvents.some((event) => event.tool_name === "inspect_accounts");
  const attachmentEvents = runEvents.filter((event) => event.type === "ATTACHMENT_ACCESSED");
  const missionTitle = session?.title || messages.find((message) => message.role === "user")?.content || "New conversation";

  const sessionRail = (
    <SessionRail
      sessions={initialSessions}
      activeId={sessionId}
      onSelect={(id) => {
        setAttachments([]);
        setAttachmentError(null);
        setSessionId(id);
      }}
      onNew={() => {
        setAttachments([]);
        setAttachmentError(null);
        setSessionId(null);
      }}
    />
  );
  const canvas = (
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
          <button onClick={() => { setAttachments([]); setSessionId(null); }} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">New</button>
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

        <div
          className="border-t p-3"
          style={{ borderColor: "var(--saut-border)" }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            void uploadFiles(event.dataTransfer.files);
          }}
        >
          <div className="mb-2 text-[10px]" style={{ color: "var(--saut-text-subtle)" }}>Context · Social Autopilot</div>
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <span key={attachment.id} className="saut-attachment-chip">
                  <span className="max-w-44 truncate">
                    {attachment.name} · {attachment.mimeType} · {(attachment.sizeBytes / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button type="button" onClick={() => void removeAttachment(attachment)} aria-label={`Remove ${attachment.name}`} className="text-xs" style={{ color: "var(--saut-danger)" }}>
                    {"\u00d7"}
                  </button>
                </span>
              ))}
            </div>
          )}
          {attachmentError && <p className="mb-2 text-xs" role="alert" style={{ color: "var(--saut-danger)" }}>{attachmentError}</p>}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              multiple
              accept=".txt,.md,.csv,.json,.pdf,.png,.jpg,.jpeg,.webp,.gif,.mp4"
              onChange={(event) => {
                if (event.target.files) void uploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending || uploading || attachments.length >= 8}
              className="saut-btn saut-btn-secondary !px-2.5"
              aria-label="Attach files"
              title="Attach documents/images up to 10 MB or MP4 video up to 100 MB"
            >
              {uploading ? `Uploading${uploadProgress === null ? "…" : ` ${uploadProgress}%`}` : "Attach"}
            </button>
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
              disabled={pending || uploading}
            />
            <button onClick={submit} disabled={pending || uploading || !input.trim()} className="saut-btn saut-btn-primary">Send</button>
          </div>
        </div>
      </section>
  );
  const contextAccessed = brandUsed || accountsUsed || attachmentEvents.length > 0;

  // Right rail: five compact accordion modules, one internal scrollbar (see
  // .saut-agent-rail on the containing <aside> in ResizableWorkspace) — never
  // an ever-growing Progress section pushing the whole workspace. Defaults
  // per Section 4 of the workspace repair brief.
  const progress = (
    <div>
      <RailModule title="Current mission" defaultOpen>
        <p className="text-sm font-medium leading-snug">{missionTitle}</p>
      </RailModule>
      <RailModule title="Progress" defaultOpen>
        <ExecutionTrace run={run} events={runEvents} waitingForApproval={session?.status === "WAITING_FOR_CHOICE"} />
      </RailModule>
    </div>
  );
  const context = (
    <div>
      <RailModule title="Context" defaultOpen={contextAccessed}>
        {!contextAccessed ? (
          <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Accessed context appears here during the run.</p>
        ) : (
          <div className="space-y-2 text-xs">
            {brandUsed && <div className="saut-card-2 p-2.5">Brand Brain · Used in this run</div>}
            {accountsUsed && <div className="saut-card-2 p-2.5">Connected accounts · Checked</div>}
            {attachmentEvents.map((event) => (
              <div key={event.id} className="saut-card-2 p-2.5">{event.label} · Used in this run</div>
            ))}
          </div>
        )}
      </RailModule>

      <RailModule title="Working with" defaultOpen={false}>
        <div className="space-y-2">
          {initialVariants.length === 0 ? <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No artifacts yet.</p> :
            initialVariants.slice(0, 4).map((variant) => (
              <a key={variant.id} href="/admin/social/create" className="saut-card-2 block p-2.5 text-xs">
                <span className="block truncate">{variant.content_master?.title || `${variant.platform} draft`}</span>
                <span className="mt-1 flex items-center gap-2"><StatusBadge label={variant.status} /></span>
              </a>
            ))}
        </div>
      </RailModule>

      <RailModule title="Connected systems" defaultOpen={false}>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between gap-3"><span>Supabase</span><span style={{ color: "var(--saut-success)" }}>Available</span></div>
          <div className="flex justify-between gap-3"><span>AI Provider</span><span>{provider.provider}</span></div>
          <div className="flex justify-between gap-3"><span>Protocol</span><span>{provider.protocol}</span></div>
          <div className="truncate text-right" title={provider.model} style={{ color: "var(--saut-text-subtle)" }}>{provider.model}</div>
        </div>
      </RailModule>
    </div>
  );

  return (
    <ResizableWorkspace left={sessionRail} center={canvas} progress={progress} context={context} />
  );
}
