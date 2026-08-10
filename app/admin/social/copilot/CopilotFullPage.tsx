"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgentMessage, type AgentAttachmentData } from "../agent/AgentMessage";
import { humanFileSize, humanFileType } from "../agent/AttachmentMedia";
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

interface ComposerAttachment extends AgentAttachmentData {
  localUrl?: string;
  uploadState: "uploading" | "ready" | "failed";
  uploadProgress: number;
  error?: string;
}

function humanSessionStatus(status: string): string {
  switch (status) {
    case "READY":
    case "IDLE":
      return "Ready";
    case "RUNNING":
      return "Working";
    case "WAITING_FOR_CHOICE":
      return "Waiting for input";
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

// One collapsible card for the right rail (Current Mission / Progress /
// Context / Working With / Connected Systems — Section 4 of the workspace
// repair brief). Each module owns its own open/closed state so expanding
// one never resizes or jumps the center canvas, and the rail itself keeps a
// single scrollbar (see .saut-agent-rail on the containing <aside>).
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
  /** Extra class on the <details> — e.g. "saut-progress-module" so it can flex-fill the remaining rail height while open. */
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

export function CopilotFullPage({
  initialSessions,
  initialVariants,
  provider,
}: {
  initialSessions: AgentSessionRow[];
  initialVariants: VariantRow[];
  provider: EffectiveProviderIdentity;
}) {
  const { sessionId, setSessionId } = useCopilot();
  const { messages, pending, loadingHistory, failedReason, run, runEvents, session, send, approve, reject } =
    useAgentSession(sessionId, setSessionId);
  const activePublishActions = useMemo(() => messages.flatMap((message) => message.parts.flatMap((part) =>
    part.type === "proposed_actions" ? (part.actions ?? []).filter((action) => ["schedule_post", "execute_youtube_verification", "execute_private_youtube_verification"].includes(action.tool)) : []
  )), [messages]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, runEvents]);

  const clearAttachments = () => {
    attachments.forEach((attachment) => { if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl); });
    setAttachments([]);
  };

  const submit = () => {
    const value = input.trim();
    const readyAttachments = attachments.filter((attachment) => attachment.uploadState === "ready");
    if (!value && readyAttachments.length === 0) return;
    const imageCount = readyAttachments.filter((attachment) => attachment.mimeType.startsWith("image/")).length;
    const imageOnlyMission = imageCount > 0
      ? imageCount > 1
        ? "Analyze these images together. Show a concise BEST USE artifact with no more than four action choices. Preserve their order and do not create or publish final content until I choose. Use English unless this session already has a user-language preference."
        : "Analyze this image silently. Show a concise THIS COULD WORK AS artifact with four to six relevant action choices and a best-fit platform suggestion. Do not create or publish final content until I choose. Use English unless this session already has a user-language preference."
      : "Review the attached file and suggest the most useful next steps.";
    send(value || imageOnlyMission, readyAttachments);
    setInput("");
    clearAttachments();
  };
  const uploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files).slice(0, Math.max(0, 8 - attachments.length));
    if (!selected.length) return;
    setAttachmentError(null);
    setUploading(true);
    let activeSessionId = sessionId;
    try {
      for (const file of selected) {
        const localId = `local-${crypto.randomUUID()}`;
        const localUrl = (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/")) ? URL.createObjectURL(file) : undefined;
        setAttachments((current) => [...current, { id: localId, name: file.name, mimeType: file.type, sizeBytes: file.size, processingStatus: "UPLOADED", uploadState: "uploading", uploadProgress: 0, localUrl }]);
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
        if (!prepareResponse.ok) {
          setAttachments((current) => current.map((item) => item.id === localId ? { ...item, uploadState: "failed", error: prepared.error ?? "Upload failed" } : item));
          continue;
        }
        activeSessionId = prepared.sessionId as string;
        if (activeSessionId !== sessionId) setSessionId(activeSessionId);
        try {
          await uploadToSignedUrlWithProgress(prepared.signedUrl as string, file, (progress) => setAttachments((current) => current.map((item) => item.id === localId ? { ...item, uploadProgress: progress } : item)));
        } catch (uploadError) {
          await fetch(`/api/social/copilot/attachments?id=${encodeURIComponent(prepared.attachment.id as string)}`, { method: "DELETE" });
          setAttachments((current) => current.map((item) => item.id === localId ? { ...item, uploadState: "failed", error: uploadError instanceof Error ? uploadError.message : "Upload failed" } : item));
          continue;
        }
        const finalizeResponse = await fetch("/api/social/copilot/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finalize", attachmentId: prepared.attachment.id }),
        });
        const finalized = await finalizeResponse.json();
        if (!finalizeResponse.ok) {
          await fetch(`/api/social/copilot/attachments?id=${encodeURIComponent(prepared.attachment.id as string)}`, { method: "DELETE" });
          setAttachments((current) => current.map((item) => item.id === localId ? { ...item, uploadState: "failed", error: finalized.error ?? "Processing failed" } : item));
          continue;
        }
        const row = finalized.attachment as {
          id: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          processing_status: AgentAttachmentData["processingStatus"];
          media_asset_id: string | null;
        };
        setAttachments((current) => current.map((item) => item.id === localId ? {
          id: row.id,
          name: row.original_name,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          processingStatus: row.processing_status,
          mediaAssetId: row.media_asset_id,
          uploadState: "ready",
          uploadProgress: 100,
          localUrl: item.localUrl,
        } : item));
      }
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Attachment upload failed");
    } finally {
      setUploading(false);
    }
  };
  const removeAttachment = async (attachment: ComposerAttachment) => {
    if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl);
    if (attachment.id.startsWith("local-")) {
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      return;
    }
    const response = await fetch(`/api/social/copilot/attachments?id=${encodeURIComponent(attachment.id)}`, { method: "DELETE" });
    if (response.ok) {
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      return;
    }
    const result = await response.json().catch(() => ({}));
    setAttachmentError(result.error ?? "Attachment removal failed");
  };
  useEffect(() => () => {
    attachments.forEach((attachment) => { if (attachment.localUrl) URL.revokeObjectURL(attachment.localUrl); });
    if (voicePreview) URL.revokeObjectURL(voicePreview.url);
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  // Object URLs are owned for the lifetime of this composer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    setAttachmentError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setAttachmentError("Voice recording is not supported in this browser."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setVoicePreview({ blob, url, seconds: Math.max(1, Math.round((Date.now() - recordingStartedRef.current) / 1000)) });
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder;
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0); setRecording(true); recorder.start();
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch { setAttachmentError("Microphone permission was denied. Allow access and try again."); }
  };
  const stopRecording = (discard = false) => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    const recorder = recorderRef.current;
    if (discard) recorder?.stream.getTracks().forEach((track) => track.stop());
    if (recorder && recorder.state !== "inactive") {
      if (discard) recorder.onstop = null;
      recorder.stop();
    }
    setRecording(false);
    if (discard) { recordingChunksRef.current = []; setRecordingSeconds(0); }
  };
  const transcribeVoice = async () => {
    if (!voicePreview) return;
    setVoiceBusy(true); setAttachmentError(null);
    const form = new FormData();
    form.append("audio", new File([voicePreview.blob], "voice-note.webm", { type: voicePreview.blob.type }));
    if (sessionId) form.append("sessionId", sessionId);
    const response = await fetch("/api/social/copilot/transcribe", { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    setVoiceBusy(false);
    if (!response.ok) { setAttachmentError(result.error ?? "Could not transcribe voice note."); return; }
    if (result.sessionId && result.sessionId !== sessionId) setSessionId(result.sessionId);
    setInput((current) => current ? `${current}\n${result.transcript}` : result.transcript);
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
        clearAttachments();
        setAttachmentError(null);
        setSessionId(id);
      }}
      onNew={() => {
        clearAttachments();
        setAttachmentError(null);
        setSessionId(null);
      }}
    />
  );
  const waitingForApproval = session?.status === "WAITING_FOR_CHOICE";
  const preferCompactProgress = waitingForApproval || (!pending && activePublishActions.length > 0);
  const reviewMode = preferCompactProgress;
  const enteredReviewRef = useRef(false);

  // Enter Focus once when READY artifacts appear — owner can exit anytime.
  useEffect(() => {
    if (reviewMode && !enteredReviewRef.current) {
      enteredReviewRef.current = true;
      setFocusMode(true);
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
          <button onClick={() => { clearAttachments(); setSessionId(null); }} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">New</button>
        </header>

        <div ref={scrollRef} className="saut-history-compact min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
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
          ) : messages.map((message) => (
            <AgentMessage
              key={message.id}
              message={message}
              onApprove={approve}
              onReject={reject}
              compactSources={reviewMode}
            />
          ))}
          {failedReason && <div className="saut-chip saut-chip-danger"><span className="saut-chip-dot" />Failed · {failedReason}</div>}
        </div>

        {/* Sticky review dock: approval CTA stays above the composer while the artifact scrolls. */}
        <div id="saut-review-dock" className="saut-review-dock" data-sticky-review-dock-host="true" />

        <div
          className="saut-composer-shell border-t"
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
          <div
            className={`saut-unified-composer${attachments.length || recording || voicePreview || attachmentError || input.includes("\n") ? " is-expanded" : " is-idle"}`}
            data-busy={pending || uploading || voiceBusy}
          >
          {attachments.length > 0 && (
            <div className="saut-composer-tray" aria-label={`${attachments.length} files attached`}>
              {attachments.map((attachment) => (
                <article key={attachment.id} className={`saut-composer-file saut-upload-${attachment.uploadState}`}>
                  {attachment.localUrl && attachment.mimeType.startsWith("image/") ? <img src={attachment.localUrl} alt="" /> : attachment.localUrl && attachment.mimeType.startsWith("video/") ? <video src={attachment.localUrl} muted playsInline /> : <span className="saut-file-icon" aria-hidden>{humanFileType(attachment.mimeType).slice(0, 3).toUpperCase()}</span>}
                  <span className="min-w-0 flex-1"><strong>{attachment.name}</strong><small>{humanFileType(attachment.mimeType)} · {humanFileSize(attachment.sizeBytes)} · {attachment.uploadState === "uploading" ? `${attachment.uploadProgress}%` : attachment.uploadState === "failed" ? "Failed" : "Ready"}</small></span>
                  <button type="button" onClick={() => void removeAttachment(attachment)} aria-label={`Remove ${attachment.name}`} className="text-xs" style={{ color: "var(--saut-danger)" }}>
                    {"\u00d7"}
                  </button>
                  {attachment.uploadState === "uploading" ? <span className="saut-upload-meter" style={{ width: `${attachment.uploadProgress}%` }} /> : null}
                </article>
              ))}
              {attachments.length < 8 ? <button type="button" className="saut-tray-add" onClick={() => fileInputRef.current?.click()} aria-label="Add another file">+ add</button> : null}
            </div>
          )}
          {voicePreview ? <div className="saut-voice-preview"><audio src={voicePreview.url} controls /><span>{voicePreview.seconds}s</span><button onClick={() => void transcribeVoice()} disabled={voiceBusy}>{voiceBusy ? "Transcribing…" : "Use transcript"}</button><button aria-label="Remove voice note" onClick={() => { URL.revokeObjectURL(voicePreview.url); setVoicePreview(null); }}>×</button></div> : null}
          {recording ? <div className="saut-recording" role="status"><span>● {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</span><button onClick={() => stopRecording(true)}>Cancel</button><button onClick={() => stopRecording(false)}>Stop</button></div> : null}
          {attachmentError && <p className="mb-1 text-xs" role="alert" style={{ color: "var(--saut-danger)" }}>{attachmentError}</p>}
          <div className="saut-composer-row">
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
              className="saut-composer-icon"
              aria-label="Attach files"
              title="Attach documents/images up to 10 MB or MP4 video up to 100 MB"
            >
              <span aria-hidden>+</span>
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
              }}
              onPaste={(event) => {
                const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                if (images.length) { event.preventDefault(); void uploadFiles(images); }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
              }}
              placeholder="Message Copilot…"
              aria-label="Message Copilot"
              className="saut-composer-textarea"
              disabled={pending}
            />
            <button type="button" className="saut-composer-icon" onClick={() => recording ? stopRecording(false) : void startRecording()} disabled={pending || voiceBusy} aria-label={recording ? "Stop recording" : "Record voice note"}><span aria-hidden>◉</span></button>
            <button onClick={submit} disabled={pending || uploading || attachments.some((item) => item.uploadState === "uploading") || (!input.trim() && !attachments.some((item) => item.uploadState === "ready"))} className="saut-composer-send" aria-label="Send message">↑</button>
          </div>
          </div>
        </div>
      </section>
  );
  const contextAccessed = brandUsed || accountsUsed || attachmentEvents.length > 0;

  // Right rail / Activity drawer: full progress details (READY status lives on edge chip).
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
            {attachmentEvents.map((event) => (
              <div key={event.id} className="saut-card-2 p-2.5">{event.label} · Used in this run</div>
            ))}
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
              <a key={variant.id} href="/admin/social/create" className="saut-card-2 block p-2.5 text-xs">
                <strong className="block capitalize">{variant.platform}</strong>
                <span className="mt-0.5 block truncate">{variant.content_master?.title || `${variant.platform} draft`}</span>
                <span className="mt-1 flex items-center gap-2"><StatusBadge label={humanSessionStatus(variant.status)} /></span>
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
