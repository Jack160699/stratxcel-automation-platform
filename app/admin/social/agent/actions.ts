"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext } from "@/lib/social/db-context";
import { acceptAgentMission, runAgentTurn, approveAgentAction, rejectAgentAction } from "@/lib/social/agent/orchestrator";
import { getActionPreview, editProposedPublishAction } from "@/lib/social/agent/action-preview";
import { getSessionDetail, getLatestSession, listSessions, getSession } from "@/lib/social/repositories/agent";
import { getLatestRunWithEvents } from "@/lib/social/repositories/agent-runs";
import { toSafeClientError } from "@/lib/social/safe-client-error";

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
  revalidatePath("/admin/social/copilot");
  return { sessionId: accepted.sessionId, ...result };
}

export async function approveAgentActionAction(actionId: string) {
  try {
    const ctx = await assertOwner();
    const result = await approveAgentAction(ctx, actionId);
    revalidatePath("/admin/social/copilot");
    return { ok: true as const, result };
  } catch (err) {
    console.error("[social.copilot.approve]", err);
    return {
      ok: false as const,
      error: toSafeClientError(err, "Something went wrong while approving this review."),
    };
  }
}

export async function rejectAgentActionAction(actionId: string) {
  try {
    const ctx = await assertOwner();
    await rejectAgentAction(ctx, actionId);
    revalidatePath("/admin/social/copilot");
    return { ok: true as const };
  } catch (err) {
    console.error("[social.copilot.reject]", err);
    return {
      ok: false as const,
      error: toSafeClientError(err, "Something went wrong while cancelling this review."),
    };
  }
}

export async function getActionPreviewAction(actionId: string) {
  try {
    const ctx = await assertOwner();
    return await getActionPreview(ctx, actionId);
  } catch (err) {
    console.error("[social.copilot.preview]", err);
    // Prefer null over throwing — thrown server actions surface Next.js framework digests.
    return null;
  }
}

export async function editProposedPublishActionAction(
  actionId: string,
  patch: { caption?: string; hashtags?: string[]; scheduledAt?: string }
) {
  try {
    const ctx = await assertOwner();
    // Do not revalidate the Social layout — that remounts the Copilot client
    // tree and silently clears review selection. The caller already applies
    // the returned preview locally.
    return await editProposedPublishAction(ctx, actionId, patch);
  } catch (err) {
    console.error("[social.copilot.edit]", err);
    throw new Error(toSafeClientError(err, "Could not save changes to this review."));
  }
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
