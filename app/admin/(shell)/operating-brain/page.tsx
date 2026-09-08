import type { Metadata } from "next";
import { requireReleaseAccess } from "@/lib/release/require-release-access";
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
import { getFreshHermesSuggestion } from "@/lib/owner-brain/hermes/refresh-suggestion";
import { currentIstDateString } from "@/lib/owner-brain/db-context";
import { OperatingBrainClient } from "./OperatingBrainClient";

export const metadata: Metadata = {
  title: "My Operating Brain — Stratxcel Admin",
  robots: { index: false, follow: false },
};

export default async function OperatingBrainPage() {
  // V2 surface: owner-admin + Beta Mode required before any brain data loads.
  const ctx = await requireReleaseAccess("v2");
  const today = currentIstDateString();

  const [
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
  ] = await Promise.all([
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

  const hermesSuggestion = await getFreshHermesSuggestion(
    ctx.ownerId,
    today,
    todaysPlan as { hermes_mission_id?: string | null; hermes_suggestion?: unknown } | null,
  );

  return (
    <OperatingBrainClient
      today={today}
      sources={sources}
      memories={memories as never}
      openLoops={openLoops as never}
      decisions={decisions as never}
      decisionAnalytics={decisionAnalytics}
      commPatterns={commPatterns as never}
      workPatterns={workPatterns as never}
      reviews={reviews as never}
      todaysPlan={todaysPlan as never}
      todaysReview={todaysReview as never}
      recommendations={recommendations as never}
      voiceNotes={voiceNotes as never}
      devices={devices}
      chatConnections={chatConnections}
      hermesSuggestion={hermesSuggestion}
    />
  );
}
