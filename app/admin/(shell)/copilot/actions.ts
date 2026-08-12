"use server";

import { resolveAdminWebPrincipal } from "@/lib/agent-core/web-principal";
import { loadCopilotThread, sendCopilotMessage, type CopilotMessageView, type SendCopilotMessageResult } from "@/lib/agent-core/copilot-actions";

/**
 * Server actions for the Admin Web Copilot (/admin/copilot). Uses the
 * SAME General Admin Agent Core/tool registry as the WhatsApp Admin Agent —
 * see lib/agent-core/web-principal.ts's resolveAdminWebPrincipal, which
 * shares its permission mapping (buildStaffPrincipal) with
 * resolveWhatsAppPrincipal. The canonical /admin/copilot route also hosts
 * the Social workflow mode; these actions remain scoped to general admin
 * operations and never cross into the client mission composer.
 */

export type CopilotAuthResult = { ok: true } | { ok: false; error: string };

export async function loadAdminCopilotThreadAction(): Promise<{ messages: CopilotMessageView[] } | { error: string }> {
  const auth = await resolveAdminWebPrincipal();
  if (!auth.ok) return { error: auth.error };
  const messages = await loadCopilotThread(auth.principal);
  return { messages };
}

export async function sendAdminCopilotMessageAction(text: string): Promise<SendCopilotMessageResult | { error: string }> {
  const auth = await resolveAdminWebPrincipal();
  if (!auth.ok) return { error: auth.error };
  return sendCopilotMessage(auth.principal, text);
}
