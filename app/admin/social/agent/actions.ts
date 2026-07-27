"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { createAgentSession, runAgentTurn, approveAgentAction, rejectAgentAction } from "@/lib/social/agent/orchestrator";
import { getSessionDetail } from "@/lib/social/repositories/agent";

async function assertOwner() {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) throw new Error(ctx.error);
  return ctx;
}

export async function sendAgentMessageAction(sessionId: string | null, text: string) {
  const ctx = await assertOwner();
  const trimmed = text.trim();
  if (!trimmed) {
    return { sessionId, blocked: false as const, text: "", proposedActions: [] as Array<{ id: string; tool: string; input: Record<string, unknown> }> };
  }

  const id = sessionId ?? (await createAgentSession(ctx, trimmed.slice(0, 60)));
  const result = await runAgentTurn(ctx, id, trimmed);
  revalidatePath("/admin/social", "layout");
  return { sessionId: id, ...result };
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
