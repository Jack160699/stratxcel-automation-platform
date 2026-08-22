"use server";

// Tenant-scoped mirror of app/admin/(shell)/social/agent/actions.ts — same
// orchestrator/repository calls, but every request re-derives and verifies
// tenant membership via requireAgentTenantContext(tenantId) instead of
// StratXcel-staff ownership via requireOwnerContext(). See
// lib/social/agent-tenant-context.ts for why the two must never share a
// row (owner_id/tenant_id are mutually exclusive by CHECK constraint).

import { revalidatePath } from "next/cache";
import { requireAgentTenantContext } from "@/lib/social/agent-tenant-context";
import { acceptAgentMission, runAgentTurn, approveAgentAction, rejectAgentAction } from "@/lib/social/agent/orchestrator";
import { getActionPreview, editProposedPublishAction } from "@/lib/social/agent/action-preview";
import { getSessionDetail, getLatestSession, listSessions, getSession } from "@/lib/social/repositories/agent";
import { getLatestRunWithEvents } from "@/lib/social/repositories/agent-runs";
import { prepareAgentAttachment, finalizeAgentAttachment } from "@/lib/social/repositories/agent-attachments";
import { attachMediaToVariant, getMediaAssetPreviewUrl } from "@/lib/social/repositories/media-assets";
import { selectImageGenerationCandidate } from "@/lib/image-generation/service";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { toSafeClientError } from "@/lib/social/safe-client-error";

async function requireTenant(tenantId: string) {
  const ctx = await requireAgentTenantContext(tenantId);
  if (!ctx.ok) throw new Error(ctx.error);
  return ctx;
}

export async function sendTenantAgentMessageAction(
  tenantId: string,
  sessionId: string | null,
  text: string,
  attachmentIds: string[] = []
) {
  const ctx = await requireTenant(tenantId);
  const trimmed = text.trim();
  if (!trimmed && !attachmentIds.length) {
    return {
      sessionId,
      blocked: false as const,
      failed: false as const,
      text: "",
      proposedActions: [] as Array<{ id: string; tool: string; input: Record<string, unknown> }>,
    };
  }

  const accepted = await acceptAgentMission(ctx, sessionId, trimmed || "(attachment sent)", attachmentIds);
  const result = await runAgentTurn(ctx, accepted.sessionId, accepted.runId);
  revalidatePath("/app/social/copilot");
  return { sessionId: accepted.sessionId, ...result };
}

export async function prepareTenantAgentAttachmentAction(
  tenantId: string,
  sessionId: string,
  input: { name: string; mimeType: string; sizeBytes: number }
) {
  const ctx = await requireTenant(tenantId);
  return prepareAgentAttachment(ctx, sessionId, input);
}

export async function finalizeTenantAgentAttachmentAction(tenantId: string, attachmentId: string) {
  const ctx = await requireTenant(tenantId);
  return finalizeAgentAttachment(ctx, attachmentId);
}

export async function selectTenantCandidateAction(
  tenantId: string,
  jobId: string,
  candidateId: string,
  variantId?: string
) {
  try {
    const ctx = await requireTenant(tenantId);
    const serviceClient = createSupabaseServiceClient();
    const result = await selectImageGenerationCandidate({
      writeClient: serviceClient as any,
      tenantId,
      jobId,
      candidateId,
      actorUserId: ctx.actorUserId,
      attachToVariantId: variantId,
    });

    const selected = result.candidates.find((c) => c.id === candidateId);
    if (variantId && selected?.asset_id) {
      await attachMediaToVariant(ctx, variantId, [selected.asset_id], true);
    }

    revalidatePath("/app/social/copilot");
    return { ok: true as const, candidate: selected };
  } catch (err) {
    console.error("[social.copilot.tenant.selectCandidate]", err);
    return {
      ok: false as const,
      error: toSafeClientError(err, "Could not select candidate image."),
    };
  }
}

export async function attachTenantMediaToVariantAction(
  tenantId: string,
  variantId: string,
  assetIds: string[],
  replace = true
) {
  try {
    const ctx = await requireTenant(tenantId);
    const result = await attachMediaToVariant(ctx, variantId, assetIds, replace);
    revalidatePath("/app/social/copilot");
    return { ok: true as const, result };
  } catch (err) {
    console.error("[social.copilot.tenant.attachMedia]", err);
    return {
      ok: false as const,
      error: toSafeClientError(err, "Could not attach media to content variant."),
    };
  }
}

export async function getTenantMediaAssetPreviewUrlAction(tenantId: string, assetId: string) {
  try {
    const ctx = await requireTenant(tenantId);
    return await getMediaAssetPreviewUrl(ctx, assetId);
  } catch (err) {
    console.error("[social.copilot.tenant.mediaPreview]", err);
    return null;
  }
}

export async function approveTenantAgentActionAction(tenantId: string, actionId: string) {
  try {
    const ctx = await requireTenant(tenantId);
    const result = await approveAgentAction(ctx, actionId);
    revalidatePath("/app/social/copilot");
    return { ok: true as const, result };
  } catch (err) {
    console.error("[social.copilot.tenant.approve]", err);
    return {
      ok: false as const,
      error: toSafeClientError(err, "Something went wrong while approving this review."),
    };
  }
}

export async function rejectTenantAgentActionAction(tenantId: string, actionId: string) {
  try {
    const ctx = await requireTenant(tenantId);
    await rejectAgentAction(ctx, actionId);
    revalidatePath("/app/social/copilot");
    return { ok: true as const };
  } catch (err) {
    console.error("[social.copilot.tenant.reject]", err);
    return {
      ok: false as const,
      error: toSafeClientError(err, "Something went wrong while cancelling this review."),
    };
  }
}

export async function getTenantActionPreviewAction(tenantId: string, actionId: string) {
  try {
    const ctx = await requireTenant(tenantId);
    return await getActionPreview(ctx, actionId);
  } catch (err) {
    console.error("[social.copilot.tenant.preview]", err);
    return null;
  }
}

export async function editTenantProposedPublishActionAction(
  tenantId: string,
  actionId: string,
  patch: { caption?: string; hashtags?: string[]; scheduledAt?: string }
) {
  try {
    const ctx = await requireTenant(tenantId);
    return await editProposedPublishAction(ctx, actionId, patch);
  } catch (err) {
    console.error("[social.copilot.tenant.edit]", err);
    throw new Error(toSafeClientError(err, "Could not save changes to this review."));
  }
}

export async function getTenantSessionHydrationAction(tenantId: string, sessionId: string) {
  const ctx = await requireTenant(tenantId);
  const [detail, runWithEvents, session] = await Promise.all([
    getSessionDetail(ctx, sessionId),
    getLatestRunWithEvents(ctx, sessionId),
    getSession(ctx, sessionId),
  ]);
  return { detail, runWithEvents, session };
}

export async function getTenantAgentSessionAction(tenantId: string, sessionId: string) {
  const ctx = await requireTenant(tenantId);
  return getSessionDetail(ctx, sessionId);
}

export async function getLatestTenantSessionAction(tenantId: string) {
  const ctx = await requireTenant(tenantId);
  return getLatestSession(ctx);
}

export async function listTenantSessionsAction(tenantId: string, limit = 30) {
  const ctx = await requireTenant(tenantId);
  return listSessions(ctx, limit);
}

export async function getTenantRunEventsAction(tenantId: string, sessionId: string) {
  const ctx = await requireTenant(tenantId);
  return getLatestRunWithEvents(ctx, sessionId);
}

export async function getTenantSessionAction(tenantId: string, sessionId: string) {
  const ctx = await requireTenant(tenantId);
  return getSession(ctx, sessionId);
}
