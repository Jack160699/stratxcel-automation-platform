"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { acceptAgentMission, runAgentTurn, approveAgentAction, rejectAgentAction } from "@/lib/social/agent/orchestrator";
import { getSessionDetail, getLatestSession, listSessions, getSession } from "@/lib/social/repositories/agent";
import { getLatestRunWithEvents } from "@/lib/social/repositories/agent-runs";

async function assertOwner() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) throw new Error(ctx.error);
  return ctx;
}

export async function sendAgentMessageAction(sessionId: string | null, text: string) {
  const ctx = await assertOwner();
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      sessionId,
      blocked: false as const,
      failed: false as const,
      text: "",
      proposedActions: [] as Array<{ id: string; tool: string; input: Record<string, unknown> }>,
    };
  }

  const accepted = await acceptAgentMission(ctx, sessionId, trimmed);
  const result = await runAgentTurn(ctx, accepted.sessionId, accepted.runId);
  revalidatePath("/admin/social", "layout");
  return { sessionId: accepted.sessionId, ...result };
}

export async function approveAgentActionAction(actionId: string) {
  const ctx = await assertOwner();
  await approveAgentAction(ctx, actionId);
  revalidatePath("/admin/social", "layout");
}

export async function rejectAgentActionAction(actionId: string) {
  const ctx = await assertOwner();
  await rejectAgentAction(ctx, actionId);
  revalidatePath("/admin/social", "layout");
}

export async function getAgentSessionAction(sessionId: string) {
  const ctx = await assertOwner();
  return getSessionDetail(ctx, sessionId);
}

export async function getLatestSessionAction() {
  const ctx = await assertOwner();
  return getLatestSession(ctx);
}

export async function listSessionsAction(limit = 30) {
  const ctx = await assertOwner();
  return listSessions(ctx, limit);
}

export async function getRunEventsAction(sessionId: string) {
  const ctx = await assertOwner();
  return getLatestRunWithEvents(ctx, sessionId);
}

export async function getSessionAction(sessionId: string) {
  const ctx = await assertOwner();
  return getSession(ctx, sessionId);
}
