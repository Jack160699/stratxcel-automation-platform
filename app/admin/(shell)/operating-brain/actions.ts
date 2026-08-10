"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerBetaContext } from "@/lib/release/require-release-access";
import { setSourceEnabled, deleteSourceData, revokeConnection } from "@/lib/owner-brain/repositories/sources";
import { applyMemoryFeedback } from "@/lib/owner-brain/repositories/memories";
import { setOpenLoopStatus, createOpenLoop } from "@/lib/owner-brain/repositories/open-loops";
import { upsertDailyReview } from "@/lib/owner-brain/repositories/reviews-plans";
import { createDecision, recordDecisionOutcome, reverseDecision } from "@/lib/owner-brain/repositories/decisions";
import { setCommunicationPatternStatus } from "@/lib/owner-brain/repositories/patterns";
import { resolveRecommendation } from "@/lib/owner-brain/repositories/recommendations";
import { createPendingDevice, revokeDevice } from "@/lib/owner-brain/repositories/desktop-devices";
import type { SourceKey } from "@/lib/owner-brain/types";

const PATH = "/admin/operating-brain";

async function ownerCtxOrThrow() {
  const ctx = await requireOwnerBetaContext();
  if (!ctx.ok) throw new Error(ctx.error);
  return ctx;
}

export async function setSourceEnabledAction(sourceKey: SourceKey, enabled: boolean) {
  const ctx = await ownerCtxOrThrow();
  await setSourceEnabled(ctx, sourceKey, enabled);
  revalidatePath(PATH);
}

export async function deleteSourceDataAction(sourceKey: SourceKey) {
  const ctx = await ownerCtxOrThrow();
  await deleteSourceData(ctx, sourceKey);
  revalidatePath(PATH);
}

export async function revokeSourceConnectionAction(sourceId: string) {
  const ctx = await ownerCtxOrThrow();
  await revokeConnection(ctx.ownerId, sourceId);
  revalidatePath(PATH);
}

export async function memoryFeedbackAction(memoryId: string, action: "ACCEPT" | "CORRECT" | "FORGET" | "MARK_TEMPORARY" | "MARK_WRONG", newStatement?: string) {
  const ctx = await ownerCtxOrThrow();
  await applyMemoryFeedback(ctx, { memoryId, action, newStatement });
  revalidatePath(PATH);
}

export async function setOpenLoopStatusAction(loopId: string, status: "OPEN" | "DONE" | "DROPPED") {
  const ctx = await ownerCtxOrThrow();
  await setOpenLoopStatus(ctx, loopId, status);
  revalidatePath(PATH);
}

export async function createOpenLoopAction(item: string, dueDate?: string) {
  const ctx = await ownerCtxOrThrow();
  await createOpenLoop(ctx.ownerId, { item, dueDate: dueDate || null });
  revalidatePath(PATH);
}

export async function saveDailyReviewAction(input: Parameters<typeof upsertDailyReview>[1]) {
  const ctx = await ownerCtxOrThrow();
  await upsertDailyReview(ctx, { ...input, source: "manual" });
  revalidatePath(PATH);
}

export async function createDecisionAction(input: Parameters<typeof createDecision>[1]) {
  const ctx = await ownerCtxOrThrow();
  await createDecision(ctx, input);
  revalidatePath(PATH);
}

export async function recordDecisionOutcomeAction(input: Parameters<typeof recordDecisionOutcome>[1]) {
  const ctx = await ownerCtxOrThrow();
  await recordDecisionOutcome(ctx, input);
  revalidatePath(PATH);
}

export async function reverseDecisionAction(input: Parameters<typeof reverseDecision>[1]) {
  const ctx = await ownerCtxOrThrow();
  await reverseDecision(ctx, input);
  revalidatePath(PATH);
}

export async function communicationPatternFeedbackAction(patternId: string, status: "ACTIVE" | "CORRECTED" | "FORGOTTEN") {
  const ctx = await ownerCtxOrThrow();
  await setCommunicationPatternStatus(ctx, { patternId, status });
  revalidatePath(PATH);
}

export async function resolveRecommendationAction(recommendationId: string, status: "ACCEPTED" | "REJECTED" | "CORRECTED") {
  const ctx = await ownerCtxOrThrow();
  await resolveRecommendation(ctx, { recommendationId, status });
  revalidatePath(PATH);
}

export async function createPendingDeviceAction(deviceName: string) {
  const ctx = await ownerCtxOrThrow();
  const result = await createPendingDevice(ctx, deviceName);
  revalidatePath(PATH);
  return result;
}

export async function revokeDeviceAction(deviceId: string) {
  const ctx = await ownerCtxOrThrow();
  await revokeDevice(ctx, deviceId);
  revalidatePath(PATH);
}

// Notion/GitHub secret entry (POST /api/admin/operating-brain/connectors/{notion,github}/connect)
// is called directly from the client component's fetch, not as a server
// action — the secret should go straight from the browser to the API
// route over the same authenticated request, never round-tripping
// through a server action's serialized closure.
