"use server";

import { resolveAdminWebPrincipal } from "@/lib/agent-core/web-principal";
import { loadCopilotThread, sendCopilotMessage, type CopilotMessageView } from "@/lib/agent-core/copilot-actions";
import { decomposeNaturalLanguageIntent, executeDecomposedPlan } from "@stratxcel/connectors";

/**
 * Server actions for the Admin Web Copilot (/admin/copilot) and Hermes Office Command Dock (/admin/office).
 * Uses authoritative Hermes orchestration (intent decomposition + Core MCP routing across agents).
 */

export type CopilotAuthResult = { ok: true } | { ok: false; error: string };

export async function loadAdminCopilotThreadAction(): Promise<{ messages: CopilotMessageView[] } | { error: string }> {
  const auth = await resolveAdminWebPrincipal();
  if (!auth.ok) return { error: auth.error };
  const messages = await loadCopilotThread(auth.principal);
  return { messages };
}

export interface SendOfficeCommandResult {
  ok: boolean;
  replyText: string;
  status: string;
  confirmationRequired: boolean;
  missionId?: string;
  tasksCount?: number;
  taskLabels?: string[];
  actionButtons?: Array<{ id: string; title: string }>;
}

export async function sendAdminCopilotMessageAction(
  text: string,
  tenantIdOverride?: string
): Promise<SendOfficeCommandResult | { error: string }> {
  const auth = await resolveAdminWebPrincipal();
  if (!auth.ok) return { error: auth.error };

  const effectiveTenantId =
    tenantIdOverride ||
    auth.principal.tenantId ||
    "466e6195-a9f6-4576-8271-29fdae61c18a";

  // 1. Authoritative Hermes Natural Language Intent Decomposition
  try {
    const plan = decomposeNaturalLanguageIntent(text, {
      tenantId: effectiveTenantId,
      channel: "admin",
    });

    // If real Core Six capabilities are decomposed (e.g. SEO, Leads, Website, Content, Growth Plan, Status)
    if (plan.tasks && plan.tasks.length > 0) {
      const execResult = await executeDecomposedPlan(plan.tasks, {
        tenantId: effectiveTenantId,
        actorKind: "founder",
        actorId: auth.principal.authUserId,
        channel: "admin",
      });

      return {
        ok: execResult.planStatus === "ALL_COMPLETED",
        replyText: execResult.overallMessage,
        status:
          execResult.planStatus === "ALL_COMPLETED"
            ? "completed"
            : execResult.planStatus === "CONFIRMATION_PENDING"
            ? "confirmation_required"
            : "failed",
        confirmationRequired: execResult.planStatus === "CONFIRMATION_PENDING",
        missionId: execResult.missionId || execResult.parentMissionId,
        tasksCount: plan.tasks.length,
        taskLabels: plan.tasks.map((t) => t.actionName || t.description || t.capabilityKey),
        actionButtons: execResult.interactiveButtons,
      };
    }
  } catch (intentErr) {
    console.warn("[sendAdminCopilotMessageAction] Intent decomposition fallback:", intentErr);
  }

  // 2. Fallback to standard agent turn
  const res = await sendCopilotMessage(auth.principal, text);
  return {
    ok: res.ok,
    replyText: res.replyText,
    status: res.status,
    confirmationRequired: res.confirmationRequired,
  };
}
