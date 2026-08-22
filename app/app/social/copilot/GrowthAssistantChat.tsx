"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTenantAgentSession } from "./useTenantAgentSession";
import {
  listTenantSessionsAction,
  prepareTenantAgentAttachmentAction,
  finalizeTenantAgentAttachmentAction,
} from "./tenant-actions";
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
    label: "Create a Festival Poster",
    prompt: "Create an attractive festive discount poster for my business with Hindi and English caption.",
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

export function BotAvatar({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sx-sm ${pulsing ? "sx-status-pulse" : ""}`}
      style={{ background: "linear-gradient(135deg, var(--sx-accent), #3b82f6)" }}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2L18 7v6l-8 5-8-5V7l8-5z" stroke="#fff" strokeWidth="1.5" /></svg>
    </span>
  );
}

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

export function ReceiptCard({ receipt }: { receipt: { platform?: string; accountLabel?: string; permalink?: string; publishedAt?: string | null } }) {
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

export interface CandidateItem {
  candidateId: string;
  storedAssetId?: string;
  previewUrl?: string | null;
  format?: string;
  status?: string;
}

export function CandidateCarousel({
  jobId,
  candidates,
  onSelectCandidate,
}: {
  jobId: string;
  candidates: CandidateItem[];
  onSelectCandidate: (jobId: string, candidateId: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const count = candidates.length;
  const current = candidates[currentIndex] || candidates[0];
  const isSelected = current?.status === "SELECTED";
  const isSingle = count === 1;

  if (!current) return null;

  const handleSelect = async () => {
    setSelectingId(current.candidateId);
    try {
      await onSelectCandidate(jobId, current.candidateId);
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-sx-text flex items-center gap-1.5">
          <span>🎨</span> {isSingle ? "AI Generated Visual" : `AI created ${count} options`}
        </span>
        {!isSingle && (
          <span className="text-[11px] font-semibold text-sx-text-muted">
            IMAGE {currentIndex + 1} / {count}
          </span>
        )}
      </div>

      <div className="relative rounded-sx-md overflow-hidden border border-sx-border bg-black/20 group">
        {current.previewUrl ? (
          <img
            src={current.previewUrl}
            alt={`Option ${currentIndex + 1}`}
            className="w-full h-60 sm:h-72 object-contain bg-black/40 transition-opacity duration-200"
          />
        ) : (
          <div className="w-full h-60 sm:h-72 flex flex-col items-center justify-center bg-sx-surface-2 text-xs text-sx-text-muted">
            <span className="text-3xl mb-2">🎨</span>
            <span className="font-semibold text-sx-text">Visual Option {currentIndex + 1}</span>
            <span className="text-[11px] text-sx-text-subtle mt-1">{current.format || "1:1 Social Poster"}</span>
          </div>
        )}

        {!isSingle && (
          <>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : count - 1))}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full bg-black/70 hover:bg-black/90 text-white p-2 text-xs shadow-md transition-all backdrop-blur-xs"
              aria-label="Previous image"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev < count - 1 ? prev + 1 : 0))}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full bg-black/70 hover:bg-black/90 text-white p-2 text-xs shadow-md transition-all backdrop-blur-xs"
              aria-label="Next image"
            >
              ▶
            </button>
          </>
        )}
      </div>

      {!isSingle && (
        <div className="flex items-center justify-center gap-1.5 py-1">
          {candidates.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex ? "w-6 bg-sx-accent" : "w-2 bg-sx-border-strong hover:bg-sx-text-subtle"
              }`}
              aria-label={`Go to image ${idx + 1}`}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-end pt-1">
        {isSelected ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3.5 py-1 text-xs font-bold text-emerald-400">
            <span>✓</span> Selected for Draft
          </div>
        ) : (
          <button
            type="button"
            disabled={selectingId === current.candidateId}
            onClick={handleSelect}
            className="h-9 px-4 rounded-sx-sm bg-sx-accent hover:bg-sx-accent/90 text-xs font-bold text-sx-accent-on transition-colors disabled:opacity-50"
          >
            {selectingId === current.candidateId ? "Selecting…" : "✓ Use this image"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Growth Assistant — dedicated full-screen multimodal conversational workspace.
 * Structure: Fixed Header (← Growth Assistant) → Scrollable Conversation → Fixed Multimodal Composer.
 */
export function GrowthAssistantChat({ tenantId, initialSessions }: { tenantId: string; initialSessions: AgentSessionRow[] }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<AgentSessionRow[]>(initialSessions);
  const {
    messages,
    pending,
    loadingHistory,
    blockedReason,
    failedReason,
    run,
    runEvents,
    send,
    approve,
    reject,
    selectCandidate,
  } = useTenantAgentSession(tenantId, sessionId, setSessionId);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // File & Input References
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Plus menu & Voice states
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  // Attachment state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [uploadedAttachmentId, setUploadedAttachmentId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function openHistory() {
    setShowHistory(true);
    listTenantSessionsAction(tenantId, 30)
      .then(setSessions)
      .catch(() => undefined);
  }

  // File upload handler
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlusMenuOpen(false);
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setPendingFile(file);
    const localUrl = URL.createObjectURL(file);
    setAttachmentPreviewUrl(localUrl);

    try {
      setUploadingAttachment(true);
      const prep = await prepareTenantAgentAttachmentAction(tenantId, sessionId || "new_session", {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });

      const uploadRes = await fetch(prep.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to storage.");
      }

      const finalized = await finalizeTenantAgentAttachmentAction(tenantId, prep.attachment.id);
      setUploadedAttachmentId(finalized.id);
    } catch (err: any) {
      setUploadError(err?.message || "Could not upload file. Please try again.");
      setPendingFile(null);
      setAttachmentPreviewUrl(null);
    } finally {
      setUploadingAttachment(false);
    }
  };

  const clearAttachment = () => {
    setPendingFile(null);
    setAttachmentPreviewUrl(null);
    setUploadedAttachmentId(null);
    setUploadError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (documentInputRef.current) documentInputRef.current.value = "";
  };

  // Voice recording & transcription
  const toggleVoiceRecording = () => {
    setPlusMenuOpen(false);
    if (isRecording) {
      // Stop recording
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setIsRecording(false);
      setRecordingDuration(0);
    } else {
      // Start recording
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "hi-IN"; // Supports Hindi, Hinglish, and English
        recognition.onresult = (event: any) => {
          let transcript = "";
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        };
        recognition.onerror = () => {
          setIsRecording(false);
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        };
        recognition.onend = () => {
          setIsRecording(false);
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        };
        recognitionRef.current = recognition;
        recognition.start();
      }

      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    }
  };

  function submit(text: string) {
    if (isRecording) {
      toggleVoiceRecording();
    }
    const value = text.trim();
    const attachmentId = uploadedAttachmentId;
    if (!value && !attachmentId) return;

    send(value, attachmentId ? [attachmentId] : undefined);
    setInput("");
    clearAttachment();
  }

  const groups = useMemo(() => groupSessionsByRecency(sessions), [sessions]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-sx-bg">
      {/* Hidden file inputs for Camera, Gallery, and Documents */}
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleFileSelect}
        accept="image/*,video/*"
        className="hidden"
      />
      <input
        type="file"
        ref={documentInputRef}
        onChange={handleFileSelect}
        accept="application/pdf,.doc,.docx,.txt,.csv,.xlsx"
        className="hidden"
      />

      {/* FIXED HEADER */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-sx-border bg-sx-surface-1 px-4 z-20">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            aria-label="Back to Home"
            className="flex h-9 w-9 items-center justify-center rounded-sx-sm text-sx-text hover:bg-sx-surface-2 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] sm:text-[16px] font-bold text-sx-text leading-none">Growth Assistant</h1>
              <span className="rounded-full bg-sx-accent/15 px-2 py-0.5 text-[10px] font-bold text-sx-accent">AI</span>
            </div>
            <p className="mt-0.5 text-[10.5px] sm:text-[11px] text-sx-text-subtle leading-none">
              व्यापार सहायक · Ask anything to grow your business
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSessionId(null);
              setShowHistory(false);
            }}
            className="hidden sm:inline-flex text-[12px] font-bold text-sx-accent px-2.5 py-1.5 rounded-sx-xs hover:bg-sx-accent-muted transition-colors"
          >
            + New chat
          </button>
          <button
            type="button"
            onClick={() => (showHistory ? setShowHistory(false) : openHistory())}
            aria-label="Conversation history"
            className={`flex h-9 w-9 items-center justify-center rounded-sx-sm transition-colors ${
              showHistory ? "bg-sx-accent text-sx-accent-on" : "bg-sx-surface-2 text-sx-text-muted hover:text-sx-text"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h12" /></svg>
          </button>
        </div>
      </header>

      {/* SCROLLABLE CONVERSATION AREA */}
      <div className="flex flex-1 overflow-hidden relative">
        {showHistory ? (
          <div className="h-full w-full overflow-y-auto p-4 max-w-2xl mx-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-sx-text">Saved Conversations</h2>
              <button
                type="button"
                onClick={() => {
                  setSessionId(null);
                  setShowHistory(false);
                }}
                className="text-xs font-bold text-sx-accent"
              >
                Start New Chat →
              </button>
            </div>
            {groups.length === 0 && <p className="text-sm text-sx-text-subtle">No conversations yet.</p>}
            {groups.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-sx-text-subtle">{group.label}</p>
                <div className="flex flex-col gap-1.5">
                  {group.sessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSessionId(s.id);
                        setShowHistory(false);
                      }}
                      className="flex items-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3.5 text-left transition-colors hover:border-sx-accent/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent-muted text-sx-accent">
                        💬
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
          <div ref={scrollRef} className="h-full w-full overflow-y-auto px-4 py-6 max-w-3xl mx-auto space-y-4">
            {loadingHistory && <p className="text-xs text-sx-text-subtle">Loading conversation…</p>}

            {/* Empty State with Suggested Actions */}
            {!loadingHistory && messages.length === 0 && (
              <div className="flex flex-col items-center pt-2 pb-6 text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-sx-lg shadow-lg text-2xl"
                  style={{ background: "linear-gradient(135deg, var(--sx-accent), #3b82f6)" }}
                >
                  ✨
                </span>
                <h2 className="mt-4 text-xl font-bold text-sx-text">How can I help your business grow today?</h2>
                <p className="mt-1 text-xs text-sx-text-muted">
                  Ask me to create posters, write captions, analyze reviews, or suggest growth strategies.
                </p>

                <div className="mt-6 grid w-full grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa.label}
                      type="button"
                      onClick={() => submit(qa.prompt)}
                      className="flex items-center gap-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-3 text-left transition-colors hover:border-sx-accent/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm" style={{ background: qa.tint }}>
                        {qa.icon}
                      </span>
                      <span className="text-[13px] font-semibold leading-snug text-sx-text">{qa.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex flex-col gap-4">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const proposedParts = message.parts.filter((p) => p.type === "proposed_actions");
                const receiptParts = message.parts.filter((p) => p.type === "publish_receipt");
                const imageCandidateParts = message.parts.filter(
                  (p) => p.type === "image_candidates" || (p as any).candidates
                );

                return (
                  <div key={message.id} className="flex flex-col gap-2.5">
                    <div className={`flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
                      {!isUser && <BotAvatar />}
                      <div
                        className={
                          isUser
                            ? "max-w-[85%] sm:max-w-[420px] rounded-[16px_4px_16px_16px] bg-sx-accent px-4 py-3 text-[14px] leading-relaxed text-sx-accent-on shadow-sm"
                            : "max-w-[90%] sm:max-w-[500px] rounded-[4px_16px_16px_16px] border border-sx-border bg-sx-surface-1 px-4 py-3 text-[14px] leading-relaxed shadow-sm"
                        }
                      >
                        {isUser ? message.content : <SxAgentMarkdown content={sanitizeUserFacingText(message.content)} />}
                      </div>
                    </div>

                    {/* Image Candidates Carousel */}
                    {imageCandidateParts.map((part: any, pIdx) => {
                      const rawCandidates = part.candidates || [];
                      const normalizedCandidates: CandidateItem[] = rawCandidates.map((c: any) => ({
                        candidateId: c.candidateId || c.id,
                        storedAssetId: c.storedAssetId || c.asset_id,
                        previewUrl: c.previewUrl,
                        format: c.format || c.mime_type,
                        status: c.status,
                      }));

                      return (
                        <div key={pIdx} className="ml-9 max-w-md">
                          <CandidateCarousel
                            jobId={part.jobId || "gen_job"}
                            candidates={normalizedCandidates}
                            onSelectCandidate={selectCandidate}
                          />
                        </div>
                      );
                    })}

                    {/* Proposed Publish Actions */}
                    {proposedParts.map((part, idx) => {
                      const actions = (part.actions ?? []) as { id: string; tool: string; input: Record<string, unknown> }[];
                      const publishActions = actions.filter((a) => PUBLISH_INTENT_TOOLS.has(a.tool));
                      const otherActions = actions.filter((a) => !PUBLISH_INTENT_TOOLS.has(a.tool));
                      return (
                        <div key={idx} className="ml-9 flex flex-col gap-2 max-w-md">
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

                    {/* Receipts */}
                    {receiptParts.map((part, idx) => (
                      <div key={idx} className="ml-9 max-w-md">
                        <ReceiptCard receipt={part as never} />
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Working progress indicator */}
              {pending && (
                <div className="flex items-start gap-2.5">
                  <BotAvatar pulsing />
                  <div className="min-w-0 flex-1 max-w-md">
                    <WorkingIndicator run={run} runEvents={runEvents} />
                  </div>
                </div>
              )}

              {blockedReason && (
                <div className="rounded-sx-md border border-sx-warning/30 bg-sx-warning/5 p-3 text-xs text-sx-warning">
                  {blockedReason}
                </div>
              )}
              {failedReason && (
                <div className="rounded-sx-md border border-sx-danger/30 bg-sx-danger/5 p-3 text-xs text-sx-danger">
                  {failedReason}
                </div>
              )}
              {uploadError && (
                <div className="rounded-sx-md border border-sx-danger/30 bg-sx-danger/5 p-3 text-xs text-sx-danger">
                  {uploadError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FIXED COMPOSER FOOTER */}
      {!showHistory && (
        <footer className="shrink-0 border-t border-sx-border bg-sx-surface-1 p-3 z-20">
          <div className="max-w-3xl mx-auto relative">
            {/* Attachment preview chip */}
            {attachmentPreviewUrl && (
              <div className="mb-2 flex items-center gap-2 rounded-sx-sm bg-sx-surface-2 border border-sx-border p-2 max-w-sm">
                <img src={attachmentPreviewUrl} alt="Preview" className="h-10 w-10 object-cover rounded-sx-xs bg-black/20" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-sx-text truncate">{pendingFile?.name || "Uploaded image"}</p>
                  <p className="text-[10px] text-sx-text-muted">
                    {uploadingAttachment ? "Uploading…" : "Ready to send"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearAttachment}
                  className="text-sx-text-muted hover:text-sx-text p-1 text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Voice Listening Live Bar */}
            {isRecording && (
              <div className="mb-2 flex items-center justify-between rounded-sx-md border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="font-bold text-red-500">Listening… Speak in Hindi, English, or Hinglish ({recordingDuration}s)</span>
                </div>
                <button
                  type="button"
                  onClick={toggleVoiceRecording}
                  className="rounded-sx-xs bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white"
                >
                  Done
                </button>
              </div>
            )}

            {/* Plus / Multimodal Popup Menu */}
            {plusMenuOpen && (
              <div className="absolute bottom-14 left-0 z-30 flex flex-col gap-1 rounded-sx-md border border-sx-border bg-sx-surface-1 p-2 shadow-xl w-48">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-2.5 rounded-sx-sm px-2.5 py-2 text-xs font-semibold text-sx-text hover:bg-sx-surface-2 transition-colors text-left"
                >
                  <span>📷</span> Camera
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex items-center gap-2.5 rounded-sx-sm px-2.5 py-2 text-xs font-semibold text-sx-text hover:bg-sx-surface-2 transition-colors text-left"
                >
                  <span>🖼️</span> Gallery / Photo
                </button>
                <button
                  type="button"
                  onClick={() => documentInputRef.current?.click()}
                  className="flex items-center gap-2.5 rounded-sx-sm px-2.5 py-2 text-xs font-semibold text-sx-text hover:bg-sx-surface-2 transition-colors text-left"
                >
                  <span>📄</span> Document / File
                </button>
                <button
                  type="button"
                  onClick={toggleVoiceRecording}
                  className="flex items-center gap-2.5 rounded-sx-sm px-2.5 py-2 text-xs font-semibold text-sx-text hover:bg-sx-surface-2 transition-colors text-left"
                >
                  <span>🎙️</span> Voice Note
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(input);
              }}
              className="flex items-center gap-2"
            >
              {/* Plus Button */}
              <button
                type="button"
                onClick={() => setPlusMenuOpen((o) => !o)}
                disabled={pending || uploadingAttachment}
                title="Attach camera photo, image, or document"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-sm border text-base transition-colors ${
                  plusMenuOpen
                    ? "border-sx-accent bg-sx-accent/10 text-sx-accent"
                    : "border-sx-border bg-sx-surface-2 text-sx-text-muted hover:text-sx-text"
                }`}
              >
                +
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything… (English / हिंदी / Hinglish)"
                disabled={pending}
                className="h-10 flex-1 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-3.5 text-[14px] text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none"
              />

              {/* Voice Button */}
              <button
                type="button"
                onClick={toggleVoiceRecording}
                disabled={pending}
                title="Voice Input"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-sm border transition-colors ${
                  isRecording
                    ? "border-red-500 bg-red-500/15 text-red-500"
                    : "border-sx-border bg-sx-surface-2 text-sx-text-muted hover:text-sx-text"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                </svg>
              </button>

              {/* Send Button */}
              <button
                type="submit"
                disabled={pending || uploadingAttachment || (!input.trim() && !uploadedAttachmentId)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sx-sm bg-sx-accent text-sx-accent-on disabled:opacity-40 hover:bg-sx-accent/90 transition-colors"
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </form>
          </div>
        </footer>
      )}
    </div>
  );
}
