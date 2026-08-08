"use server";

import { resolveClientWebPrincipal } from "@/lib/agent-core/web-principal";
import { loadCopilotThread, sendCopilotMessage, type CopilotMessageView, type SendCopilotMessageResult } from "@/lib/agent-core/copilot-actions";

/**
 * Server actions for the Client Web Copilot (/app/copilot's chat panel).
 * Uses the SAME tenant-scoped Client Agent Core/tool registry as the
 * WhatsApp Client Agent — see lib/agent-core/web-principal.ts's
 * resolveClientWebPrincipal, which re-derives tenant membership from
 * requireTenantContext on every call (never trusts a client-supplied role).
 */

export async function loadClientCopilotThreadAction(tenantId: string): Promise<{ messages: CopilotMessageView[] } | { error: string }> {
  const auth = await resolveClientWebPrincipal(tenantId);
  if (!auth.ok) return { error: auth.error };
  const messages = await loadCopilotThread(auth.principal);
  return { messages };
}

export async function sendClientCopilotMessageAction(tenantId: string, text: string): Promise<SendCopilotMessageResult | { error: string }> {
  const auth = await resolveClientWebPrincipal(tenantId);
  if (!auth.ok) return { error: auth.error };
  return sendCopilotMessage(auth.principal, text);
}
