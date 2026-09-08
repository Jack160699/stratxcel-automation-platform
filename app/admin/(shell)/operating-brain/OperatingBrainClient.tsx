"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { AdminSegmentedControl } from "@/components/admin/ui/AdminSegmentedControl";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import { MemoryFeedback, ActionButton } from "./components/ActionButtons";
import { SourceControls } from "./components/SourceControls";
import { DeviceManager } from "./components/DeviceManager";
import { NightReviewForm } from "./components/NightReviewForm";
import { VoiceNoteUploader } from "./components/VoiceNoteUploader";
import { ChatProviderControls } from "./components/ChatProviderControls";
import { getSourceDefinition } from "@/lib/owner-brain/sources/registry";
import { getChatProvider } from "@/lib/owner-brain/chat/providers";
import type { SourceKey } from "@/lib/owner-brain/types";
import {
  setSourceEnabledAction,
  deleteSourceDataAction,
  memoryFeedbackAction,
  setOpenLoopStatusAction,
  saveDailyReviewAction,
  resolveRecommendationAction,
  createPendingDeviceAction,
  revokeDeviceAction,
} from "./actions";
import {
  Sun,
  ListTodo,
  Scale,
  Radio,
  Brain,
  Mic,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

type BrainTab = "today" | "loops" | "decisions" | "sources" | "memory" | "voice";

export interface OperatingBrainClientProps {
  today: string;
  sources: Array<{
    id: string;
    source_key: string;
    display_name: string;
    status: string;
    enabled: boolean;
    last_sync_at: string | null;
    retention_days: number;
  }>;
  memories: Array<{
    id: string;
    statement: string;
    category: string;
    memory_type: string;
    confidence: number;
    confirmation_state: string;
  }>;
  openLoops: Array<{
    id: string;
    item: string;
    due_date?: string | null;
    owner_sources?: { display_name?: string } | null;
  }>;
  decisions: Array<{
    id: string;
    title: string;
    decision_date: string;
    project_domain?: string | null;
    status: string;
  }>;
  decisionAnalytics: {
    totalDecisions: number;
    reversedCount: number;
    reversedRate: number;
  };
  commPatterns: Array<{
    id: string;
    description: string;
    pattern_type: string;
    confidence: number;
    sample_count: number;
  }>;
  workPatterns: Array<{
    id: string;
    description: string;
    pattern_type: string;
  }>;
  reviews: Array<{
    id: string;
    review_date: string;
    mood_energy?: { mood?: string; energy?: string };
  }>;
  todaysPlan: {
    top3?: string[];
    what_to_avoid?: string | null;
    generated_by?: string;
  } | null;
  todaysReview: Record<string, unknown> | null;
  recommendations: Array<{
    id: string;
    statement: string;
    kind: string;
    confidence: number;
  }>;
  voiceNotes: Array<{
    id: string;
    recorded_at: string;
    status: string;
    owner_transcripts?: Array<{ text_content: string }>;
  }>;
  devices: Array<{
    id: string;
    device_name: string;
    status: string;
    last_seen_at: string | null;
  }>;
  chatConnections: Array<{
    id: string;
    provider_key: string;
    status: string;
    last_success_at: string | null;
  }>;
  hermesSuggestion: {
    state: string;
    summary?: string | null;
  } | null;
}

const SOURCE_STATUS_MAP: Record<string, string> = {
  CONNECTED: "connected",
  AUTH_REQUIRED: "needs_attention",
  PERMISSION_REQUIRED: "needs_attention",
  ERROR: "error",
  PAUSED: "paused",
  UNAVAILABLE: "disabled",
};

export function OperatingBrainClient({
  today,
  sources,
  memories,
  openLoops,
  decisions,
  decisionAnalytics,
  commPatterns,
  workPatterns,
  reviews,
  todaysPlan,
  todaysReview,
  recommendations,
  voiceNotes,
  devices,
  chatConnections,
  hermesSuggestion,
}: OperatingBrainClientProps) {
  const [tab, setTab] = useState<BrainTab>("today");
  const sourcesHealthy = sources.filter((s) => s.status === "CONNECTED").length;

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Universal Page Header */}
      <AdminPageHeader
        breadcrumb="Brain / Operating Brain"
        title="My Operating Brain"
        description="Founder cognitive state, daily executive plans, memory graph, and privacy controls."
        actions={
          <div className="flex items-center gap-3 text-xs text-sx-text-muted">
            <span className="flex items-center gap-1.5">
              <Radio size={13} className="text-sx-accent" />
              <span>
                Sources: <b>{sourcesHealthy}/{sources.length}</b>
              </span>
            </span>
            <span>·</span>
            <span>
              Memories: <b>{memories.length}</b>
            </span>
            <span>·</span>
            <span>
              Open loops: <b>{openLoops.length}</b>
            </span>
          </div>
        }
      />

      {/* Navigation Tabs */}
      <AdminSegmentedControl
        value={tab}
        onChange={(v) => setTab(v)}
        options={[
          { value: "today", label: "Today's Plan", icon: <Sun size={13} /> },
          { value: "loops", label: "Open Loops", badge: openLoops.length, icon: <ListTodo size={13} /> },
          { value: "decisions", label: "Decisions", badge: decisions.length, icon: <Scale size={13} /> },
          { value: "sources", label: "Sources & Devices", badge: sourcesHealthy, icon: <Radio size={13} /> },
          { value: "memory", label: "Memory Graph", badge: memories.length, icon: <Brain size={13} /> },
          { value: "voice", label: "Voice Notes", badge: voiceNotes.length, icon: <Mic size={13} /> },
        ]}
      />

      {/* 1. TODAY'S PLAN & REVIEW */}
      {tab === "today" && (
        <div className="flex flex-col gap-5">
          <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-sx-text">Morning Executive Plan ({today})</h3>
              {todaysPlan?.generated_by && (
                <span className="font-sx-mono text-[10px] text-sx-text-subtle">
                  by {todaysPlan.generated_by}
                </span>
              )}
            </div>

            {todaysPlan ? (
              <div className="flex flex-col gap-3 text-xs text-sx-text">
                <div>
                  <span className="text-sx-text-muted font-medium">Top 3 Priorities: </span>
                  <span className="font-semibold text-sx-text">
                    {(todaysPlan.top3 as string[])?.join("  ·  ") || "None specified"}
                  </span>
                </div>
                {todaysPlan.what_to_avoid && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-amber-300">
                    <span className="font-semibold">What to avoid today: </span>
                    <span>{todaysPlan.what_to_avoid}</span>
                  </div>
                )}
                {hermesSuggestion && (
                  <div className="mt-1 rounded-lg border border-sx-border/80 bg-sx-surface-2 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-sx-accent">
                      <Sparkles size={13} />
                      <span>Hermes Autonomous Suggestion ({hermesSuggestion.state})</span>
                    </div>
                    <p className="mt-1 text-xs text-sx-text-muted leading-relaxed">
                      {hermesSuggestion.summary ?? "The deterministic plan above remains active."}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <AdminEmptyState
                icon={<Sun size={18} />}
                title="No morning plan generated yet"
                description="The morning planner auto-generates your executive plan at 08:30 IST."
              />
            )}
          </div>

          {/* Night Review Form */}
          <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-5">
            <h3 className="text-sm font-semibold text-sx-text mb-3">Tonight&apos;s Review ({today})</h3>
            <NightReviewForm
              reviewDate={today}
              initial={
                todaysReview
                  ? {
                      done: (todaysReview.done as string) ?? null,
                      problems: (todaysReview.problems as string) ?? null,
                      decisions: (todaysReview.decisions as string) ?? null,
                      communication: (todaysReview.communication as string) ?? null,
                      health: (todaysReview.health as string) ?? null,
                      socialFamily: (todaysReview.social_family as string) ?? null,
                      learned: (todaysReview.learned as string) ?? null,
                      mood: ((todaysReview.mood_energy as { mood?: string })?.mood) ?? null,
                      energy: ((todaysReview.mood_energy as { energy?: string })?.energy) ?? null,
                    }
                  : null
              }
              onSave={saveDailyReviewAction}
            />
          </div>
        </div>
      )}

      {/* 2. OPEN LOOPS */}
      {tab === "loops" && (
        <div className="flex flex-col gap-3">
          {openLoops.length === 0 ? (
            <AdminEmptyState
              icon={<CheckCircle2 size={20} className="text-[#5BDCA7]" />}
              title="All loops closed"
              description="No unresolved open loops are currently tracking."
            />
          ) : (
            openLoops.map((loop) => (
              <div
                key={loop.id}
                className="flex items-center justify-between gap-4 rounded-sx-md border border-sx-border/60 bg-sx-surface-1 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-medium text-sx-text">{loop.item}</span>
                  <span className="font-sx-mono text-[10px] text-sx-text-subtle">
                    {loop.due_date ? `Due ${loop.due_date}` : "No due date"}
                    {loop.owner_sources?.display_name ? ` · Source: ${loop.owner_sources.display_name}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ActionButton
                    label="Done"
                    tone="accent"
                    onClick={() => setOpenLoopStatusAction(loop.id, "DONE")}
                  />
                  <ActionButton
                    label="Drop"
                    onClick={() => setOpenLoopStatusAction(loop.id, "DROPPED")}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. DECISIONS */}
      {tab === "decisions" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-sx-text-muted px-1">
            <span>
              Tracked decisions: <b>{decisionAnalytics.totalDecisions}</b>
            </span>
            <span>
              Reversed: <b>{decisionAnalytics.reversedCount}</b> ({Math.round(decisionAnalytics.reversedRate * 100)}%)
            </span>
          </div>

          {decisions.length === 0 ? (
            <AdminEmptyState
              icon={<Scale size={18} />}
              title="No decisions logged"
              description="Decisions are logged during night reviews and strategic sessions."
            />
          ) : (
            decisions.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-sx-md border border-sx-border/60 bg-sx-surface-1 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-medium text-sx-text">{d.title}</span>
                  <span className="font-sx-mono text-[10px] text-sx-text-subtle">
                    {d.decision_date} {d.project_domain ? `· ${d.project_domain}` : ""}
                  </span>
                </div>
                <AdminStatusDot
                  status={d.status === "REVERSED" ? "error" : d.status === "OPEN" ? "waiting" : "connected"}
                  customLabel={d.status}
                />
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. SOURCES & DEVICES */}
      {tab === "sources" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">Connected Sources</h3>
            {sources.map((s) => {
              const sourceKey = s.source_key as SourceKey;
              const def = getSourceDefinition(sourceKey);
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-sx-md border border-sx-border/60 bg-sx-surface-1 px-4 py-3 sm:flex-nowrap"
                >
                  <div className="flex min-w-0 flex-col gap-0.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-sx-text">{s.display_name}</span>
                      <AdminStatusDot status={SOURCE_STATUS_MAP[s.status] ?? "paused"} customLabel={s.status} />
                      {!s.enabled && s.status === "CONNECTED" && (
                        <span className="font-sx-mono text-[9px] uppercase tracking-wider text-sx-text-subtle">
                          PAUSED
                        </span>
                      )}
                    </div>
                    <span className="font-sx-mono text-[10px] text-sx-text-subtle">
                      {s.last_sync_at ? `Last sync ${new Date(s.last_sync_at).toLocaleString()}` : "Never synced"} · Retention {s.retention_days}d
                    </span>
                  </div>

                  <SourceControls
                    sourceKey={sourceKey}
                    status={s.status}
                    enabled={s.enabled}
                    connectHref={def.connectHref}
                    needsSecretEntry={sourceKey === "notion" || sourceKey === "github"}
                    onToggle={setSourceEnabledAction}
                    onDelete={deleteSourceDataAction}
                  />
                </div>
              );
            })}
          </div>

          {/* Desktop Companion Devices */}
          <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted mb-3">Desktop Companion Devices</h3>
            <DeviceManager devices={devices} onCreate={createPendingDeviceAction} onRevoke={revokeDeviceAction} />
          </div>

          {/* Chat Platforms */}
          <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted mb-3">Chat Platform Connectors</h3>
            <div className="flex flex-col gap-2">
              {chatConnections.map((conn) => {
                const provider = getChatProvider(conn.provider_key)!;
                return (
                  <div key={conn.id} className="flex items-center justify-between py-2 border-b border-sx-border/40 last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-sx-text">{provider.displayName}</span>
                        <AdminStatusDot status={conn.status === "CONNECTED" ? "connected" : "needs_attention"} customLabel={conn.status} />
                      </div>
                      <p className="text-[11px] text-sx-text-muted mt-0.5">{provider.capability}</p>
                    </div>
                    <ChatProviderControls providerKey={provider.key} supportsImport={provider.supportsImport} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5. MEMORY GRAPH */}
      {tab === "memory" && (
        <div className="flex flex-col gap-5">
          {recommendations.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">Noticed Recommendations</h3>
              {recommendations.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-sx-text font-medium">&ldquo;I noticed…&rdquo; {r.statement}</span>
                    <span className="font-sx-mono text-[10px] text-sx-text-subtle">
                      {r.kind} · {Math.round(r.confidence * 100)}% confidence
                    </span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <ActionButton label="Accept" tone="accent" onClick={() => resolveRecommendationAction(r.id, "ACCEPTED")} />
                    <ActionButton label="Reject" tone="danger" onClick={() => resolveRecommendationAction(r.id, "REJECTED")} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-sx-text-muted">Durable Memories</h3>
            {memories.length === 0 ? (
              <AdminEmptyState
                icon={<Brain size={20} />}
                title="No memories recorded"
                description="Memories build up as sources sync and daily reviews are logged."
              />
            ) : (
              memories.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
                  <div className="flex min-w-0 flex-col gap-0.5 flex-1">
                    <span className="text-xs text-sx-text">{m.statement}</span>
                    <span className="font-sx-mono text-[10px] text-sx-text-subtle">
                      {m.category} · {m.memory_type} · {Math.round(m.confidence * 100)}% confidence
                    </span>
                  </div>
                  <MemoryFeedback memoryId={m.id} onFeedback={memoryFeedbackAction} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 6. VOICE NOTES */}
      {tab === "voice" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-4">
            <VoiceNoteUploader />
          </div>

          <div className="flex flex-col gap-2">
            {voiceNotes.length === 0 ? (
              <AdminEmptyState
                icon={<Mic size={18} />}
                title="No voice notes uploaded"
                description="Record or drop an audio file above to transcribe and process into memory."
              />
            ) : (
              voiceNotes.map((v) => {
                const transcript = v.owner_transcripts?.[0]?.text_content;
                return (
                  <div key={v.id} className="rounded-sx-md border border-sx-border/60 bg-sx-surface-1 p-3.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-sx-mono text-[11px] text-sx-text-subtle">
                        {new Date(v.recorded_at).toLocaleString()}
                      </span>
                      <AdminStatusDot status={v.status === "TRANSCRIBED" ? "connected" : "waiting"} customLabel={v.status} compact />
                    </div>
                    {transcript && <p className="mt-2 text-xs text-sx-text leading-relaxed">{transcript}</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
