import type { Metadata } from "next";
import { requireOwnerContext } from "@/lib/owner-brain/db-context";
import { listSources } from "@/lib/owner-brain/repositories/sources";
import { listMemories } from "@/lib/owner-brain/repositories/memories";
import { listOpenLoops } from "@/lib/owner-brain/repositories/open-loops";
import { listDecisions, computeDecisionAnalytics } from "@/lib/owner-brain/repositories/decisions";
import { listCommunicationPatterns, listWorkPatterns } from "@/lib/owner-brain/repositories/patterns";
import { listDailyReviews, getDailyPlan, getDailyReview } from "@/lib/owner-brain/repositories/reviews-plans";
import { listRecommendations } from "@/lib/owner-brain/repositories/recommendations";
import { listVoiceNotes } from "@/lib/owner-brain/repositories/voice-notes";
import { listDevices } from "@/lib/owner-brain/repositories/desktop-devices";
import { listChatConnections } from "@/lib/owner-brain/repositories/chat-connections";
import { getChatProvider } from "@/lib/owner-brain/chat/providers";
import { getFreshHermesSuggestion } from "@/lib/owner-brain/hermes/refresh-suggestion";
import { currentIstDateString } from "@/lib/owner-brain/db-context";
import { getSourceDefinition } from "@/lib/owner-brain/sources/registry";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { EmptyState } from "@/components/ui/Feedback";
import { MemoryFeedback, ActionButton } from "./components/ActionButtons";
import { SourceControls } from "./components/SourceControls";
import { DeviceManager } from "./components/DeviceManager";
import { NightReviewForm } from "./components/NightReviewForm";
import { VoiceNoteUploader } from "./components/VoiceNoteUploader";
import { ChatProviderControls } from "./components/ChatProviderControls";
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

export const metadata: Metadata = {
  title: "My Operating Brain — Stratxcel Admin",
  robots: { index: false, follow: false },
};

const SOURCE_STATUS_CHIP: Record<string, ChipState> = {
  CONNECTED: "success",
  AUTH_REQUIRED: "warning",
  PERMISSION_REQUIRED: "warning",
  ERROR: "danger",
  PAUSED: "neutral",
  UNAVAILABLE: "dashed",
};

export default async function OperatingBrainPage() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-sx-text-muted">Not authorized.</p>
      </main>
    );
  }

  const today = currentIstDateString();

  const [sources, memories, openLoops, decisions, decisionAnalytics, commPatterns, workPatterns, reviews, todaysPlan, todaysReview, recommendations, voiceNotes, devices, chatConnections] =
    await Promise.all([
      listSources(ctx),
      listMemories(ctx, { limit: 40 }),
      listOpenLoops(ctx, "OPEN"),
      listDecisions(ctx, { limit: 10 }),
      computeDecisionAnalytics(ctx),
      listCommunicationPatterns(ctx),
      listWorkPatterns(ctx, 10),
      listDailyReviews(ctx, 7),
      getDailyPlan(ctx, today),
      getDailyReview(ctx, today),
      listRecommendations(ctx, "PENDING"),
      listVoiceNotes(ctx, 10),
      listDevices(ctx),
      listChatConnections(ctx),
    ]);

  const sourcesHealthy = sources.filter((s) => s.status === "CONNECTED").length;
  const latestMoodEnergy = reviews[0]?.mood_energy as { mood?: string; energy?: string } | undefined;
  const hermesSuggestion = await getFreshHermesSuggestion(ctx.ownerId, today, todaysPlan as { hermes_mission_id?: string | null; hermes_suggestion?: unknown } | null);

  return (
    <div className="flex flex-col gap-6 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">My Operating Brain</h1>
        <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-sx-text-muted">
          <span>Sources healthy: {sourcesHealthy}/{sources.length}</span>
          <span>Memories: {memories.length}</span>
          <span>Open loops: {openLoops.length}</span>
          {latestMoodEnergy?.energy && <span>Energy: {latestMoodEnergy.energy}</span>}
        </div>
      </header>

      {/* 1. TODAY */}
      <Card>
        <CardHeading>Today</CardHeading>
        {todaysPlan ? (
          <div className="mt-2 flex flex-col gap-2 text-[12.5px] text-sx-text">
            <div>
              <span className="text-sx-text-muted">Top 3: </span>
              {(todaysPlan.top3 as string[]).join(" · ") || "—"}
            </div>
            {todaysPlan.what_to_avoid && <div className="text-[#F3C55C]">Avoid: {todaysPlan.what_to_avoid as string}</div>}
            <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">generated by {todaysPlan.generated_by as string}</div>
            {hermesSuggestion && (
              <div className="mt-1 rounded-sx-sm border border-[rgb(79_220_229_/_0.26)] bg-[rgb(79_220_229_/_0.06)] p-2.5">
                <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">Hermes suggestion — {hermesSuggestion.state}</div>
                {hermesSuggestion.summary ? (
                  <div className="mt-1 text-[12px] text-sx-text">{hermesSuggestion.summary}</div>
                ) : (
                  <div className="mt-1 text-[11.5px] text-sx-text-muted">
                    {["QUEUED", "RUNNING"].includes(hermesSuggestion.state)
                      ? "Still working — the deterministic plan above is what's active in the meantime."
                      : "No summary available for this state — the deterministic plan above remains the active plan."}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <EmptyState title="No plan generated yet for today." subtitle="The 08:30 IST morning planner will generate one, or trigger it from Source Health." />
        )}
      </Card>

      {/* 2 + 3. PRIORITIES / OPEN LOOPS */}
      <Card>
        <CardHeading>Open Loops</CardHeading>
        {openLoops.length === 0 && <EmptyState title="No open loops." />}
        {openLoops.map((loop) => (
          <CardRow key={loop.id as string} className="items-start justify-between">
            <div className="flex-1">
              <div className="text-sx-text">{loop.item as string}</div>
              <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">
                {loop.due_date ? `due ${loop.due_date}` : "no due date"} {(loop.owner_sources as { display_name?: string } | null)?.display_name ? `— ${(loop.owner_sources as { display_name?: string }).display_name}` : ""}
              </div>
            </div>
            <div className="flex gap-1.5">
              <ActionButton label="Done" tone="accent" onClick={() => setOpenLoopStatusAction(loop.id as string, "DONE")} />
              <ActionButton label="Drop" onClick={() => setOpenLoopStatusAction(loop.id as string, "DROPPED")} />
            </div>
          </CardRow>
        ))}
      </Card>

      {/* 4. DECISION PROFILE */}
      <Card>
        <CardHeading>Decision Profile</CardHeading>
        <div className="mt-1 text-[11px] text-sx-text-muted">
          {decisionAnalytics.totalDecisions} tracked · {decisionAnalytics.reversedCount} reversed ({Math.round(decisionAnalytics.reversedRate * 100)}%)
        </div>
        {decisions.length === 0 && <EmptyState title="No decisions logged yet." />}
        {decisions.map((d) => (
          <CardRow key={d.id as string} className="items-start justify-between">
            <div>
              <div className="text-sx-text">{d.title as string}</div>
              <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">
                {d.decision_date as string} {d.project_domain ? `— ${d.project_domain}` : ""}
              </div>
            </div>
            <StatusChip state={d.status === "REVERSED" ? "danger" : d.status === "OPEN" ? "warning" : "success"}>{d.status as string}</StatusChip>
          </CardRow>
        ))}
      </Card>

      {/* 5. COMMUNICATION PROFILE */}
      <Card>
        <CardHeading>Communication Profile</CardHeading>
        {commPatterns.length === 0 && <EmptyState title="No communication patterns observed yet." subtitle="Builds up as Gmail/chat sources sync." />}
        {commPatterns.map((p) => (
          <CardRow key={p.id as string} className="items-start justify-between">
            <div>
              <div className="text-sx-text">{p.description as string}</div>
              <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">{p.pattern_type as string} — {Math.round((p.confidence as number) * 100)}% confidence, {p.sample_count as number} samples</div>
            </div>
          </CardRow>
        ))}
      </Card>

      {/* 6. WORK PATTERNS */}
      <Card>
        <CardHeading>Work Patterns</CardHeading>
        {workPatterns.length === 0 && <EmptyState title="No work patterns observed yet." />}
        {workPatterns.map((p) => (
          <CardRow key={p.id as string} className="items-start">
            <div>
              <div className="text-sx-text">{p.description as string}</div>
              <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">{p.pattern_type as string}</div>
            </div>
          </CardRow>
        ))}
      </Card>

      {/* 7. MOOD / ENERGY / HEALTH */}
      <Card>
        <CardHeading>Mood / Energy / Health</CardHeading>
        <div className="mt-2 flex flex-col gap-1.5">
          {reviews.map((r) => {
            const me = r.mood_energy as { mood?: string; energy?: string };
            return (
              <div key={r.id as string} className="flex items-center gap-3 text-[11.5px] text-sx-text-muted">
                <span className="w-24 font-sx-mono text-[10px] text-sx-text-subtle">{r.review_date as string}</span>
                <span>{me?.mood || "—"}</span>
                <span>{me?.energy || "—"}</span>
              </div>
            );
          })}
          {reviews.length === 0 && <EmptyState title="No reviews logged yet." />}
        </div>
        <div className="mt-3 border-t border-sx-border pt-3">
          <div className="mb-2 text-[11px] font-semibold text-sx-text">Tonight&apos;s review ({today})</div>
          <NightReviewForm
            reviewDate={today}
            initial={
              todaysReview
                ? {
                    done: todaysReview.done as string | null,
                    problems: todaysReview.problems as string | null,
                    decisions: todaysReview.decisions as string | null,
                    communication: todaysReview.communication as string | null,
                    health: todaysReview.health as string | null,
                    socialFamily: todaysReview.social_family as string | null,
                    learned: todaysReview.learned as string | null,
                    mood: (todaysReview.mood_energy as { mood?: string })?.mood ?? null,
                    energy: (todaysReview.mood_energy as { energy?: string })?.energy ?? null,
                  }
                : null
            }
            onSave={saveDailyReviewAction}
          />
        </div>
      </Card>

      {/* 8. SOURCE HEALTH / PRIVACY CONTROL CENTER */}
      <Card>
        <CardHeading>Source Health &amp; Privacy Control Center</CardHeading>
        {sources.map((s) => {
          const def = getSourceDefinition(s.source_key);
          return (
            <CardRow key={s.id} className="items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sx-text">{s.display_name}</span>
                  <StatusChip state={SOURCE_STATUS_CHIP[s.status] ?? "neutral"}>{s.status}</StatusChip>
                  {!s.enabled && s.status === "CONNECTED" && <StatusChip state="neutral" dot={false}>PAUSED</StatusChip>}
                </div>
                <div className="mt-0.5 font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">
                  {s.last_sync_at ? `last sync ${new Date(s.last_sync_at).toLocaleString()}` : "never synced"} · retention {s.retention_days}d
                </div>
                {s.source_key === "desktop_companion" && <div className="mt-1 text-[10.5px] text-sx-text-muted">
                  {devices.filter((device) => device.status === "PAIRED").length
                    ? `${devices.filter((device) => device.status === "PAIRED").map((device) => device.device_name).join(", ")} · ${devices.filter((device) => device.status === "PAIRED").length} paired device(s)`
                    : "Pair a device below to activate this source."}
                </div>}
                {(s.source_key === "stratxcel_internal" || s.source_key === "stratxcel_admin_ui") && <div className="mt-1 text-[10.5px] text-sx-text-muted">Internal / active · no external account required</div>}
                {s.source_key === "voice_notes" && <div className="mt-1 text-[10.5px] text-sx-text-muted">Ready · upload a voice note below</div>}
              </div>
              <SourceControls
                sourceKey={s.source_key}
                status={s.status}
                enabled={s.enabled}
                connectHref={def.connectHref}
                needsSecretEntry={s.source_key === "notion" || s.source_key === "github"}
                onToggle={setSourceEnabledAction}
                onDelete={deleteSourceDataAction}
              />
            </CardRow>
          );
        })}

        <div className="mt-4 border-t border-sx-border pt-3">
          <div className="mb-2 text-[11px] font-semibold text-sx-text">Desktop Companion devices</div>
          <DeviceManager devices={devices} onCreate={createPendingDeviceAction} onRevoke={revokeDeviceAction} />
        </div>
        <div className="mt-4 border-t border-sx-border pt-3">
          <div className="mb-2 text-[11px] font-semibold text-sx-text">Chat platforms</div>
          {chatConnections.map((connection) => {
            const provider = getChatProvider(connection.provider_key)!;
            return <div key={connection.id} className="flex items-start justify-between gap-4 border-t border-sx-border py-2 first:border-0">
              <div>
                <div className="flex items-center gap-2 text-[12px] text-sx-text"><span>{provider.displayName}</span><StatusChip state={connection.status === "CONNECTED" ? "success" : connection.status === "ERROR" ? "danger" : "warning"}>{connection.status.replaceAll("_", " ")}</StatusChip></div>
                <div className="mt-0.5 max-w-2xl text-[10.5px] text-sx-text-muted">{provider.capability}</div>
                <div className="font-sx-mono text-[9.5px] uppercase text-sx-text-subtle">{connection.last_success_at ? `last import/sync ${new Date(connection.last_success_at).toLocaleString()}` : provider.authMode}</div>
              </div>
              <ChatProviderControls providerKey={provider.key} supportsImport={provider.supportsImport} />
            </div>;
          })}
        </div>
      </Card>

      {/* 9. MEMORY */}
      <Card>
        <CardHeading>Memory</CardHeading>
        {memories.length === 0 && <EmptyState title="No memories yet." subtitle="Memories build up as sources sync and reviews are logged." />}
        {memories.map((m) => (
          <CardRow key={m.id} className="items-start justify-between">
            <div className="flex-1">
              <div className="text-sx-text">{m.statement}</div>
              <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">
                {m.category} · {m.memory_type} · {Math.round(m.confidence * 100)}% · {m.confirmation_state}
              </div>
            </div>
            <MemoryFeedback memoryId={m.id} onFeedback={memoryFeedbackAction} />
          </CardRow>
        ))}
      </Card>

      {/* 10. LEARNING FEED */}
      <Card>
        <CardHeading>Learning Feed</CardHeading>
        {recommendations.length === 0 && <EmptyState title="Nothing new noticed." />}
        {recommendations.map((r) => (
          <CardRow key={r.id as string} className="items-start justify-between">
            <div className="flex-1">
              <div className="text-sx-text">&ldquo;I noticed…&rdquo; {r.statement as string}</div>
              <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">{r.kind as string} · {Math.round((r.confidence as number) * 100)}% confidence</div>
            </div>
            <div className="flex gap-1.5">
              <ActionButton label="Accept" tone="accent" onClick={() => resolveRecommendationAction(r.id as string, "ACCEPTED")} />
              <ActionButton label="Reject" tone="danger" onClick={() => resolveRecommendationAction(r.id as string, "REJECTED")} />
            </div>
          </CardRow>
        ))}
      </Card>

      {/* Voice notes */}
      <Card>
        <CardHeading>Voice Notes</CardHeading>
        <div className="mt-1 mb-3">
          <VoiceNoteUploader />
        </div>
        {voiceNotes.length === 0 && <EmptyState title="No voice notes yet." />}
        {voiceNotes.map((v) => {
          const transcript = (v.owner_transcripts as Array<{ text_content: string }> | undefined)?.[0];
          return (
            <CardRow key={v.id as string} className="items-start">
              <div>
                <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">
                  {new Date(v.recorded_at as string).toLocaleString()} — {v.status as string}
                </div>
                {transcript && <div className="mt-0.5 text-[12px] text-sx-text">{transcript.text_content}</div>}
              </div>
            </CardRow>
          );
        })}
      </Card>
    </div>
  );
}
