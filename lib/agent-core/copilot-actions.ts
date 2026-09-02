"use server";

import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import {
  runAgentTurn,
  getOrCreateActiveSession,
  loadSessionMessages,
  recordAgentMessage,
  parseCommand,
  handleConfirm,
  handleCancel,
  handleReset,
  type AgentPrincipal,
} from "@stratxcel/agent-core";
import { createAgentCoreProviderAdapter } from "./provider-adapter";
import { RESEARCH_DELEGATION_TOOLS } from "./research-tools";
import { GROWTH_MEDIA_TOOLS } from "./growth-media-tools";
import { WORKFORCE_REGISTRY_TOOLS } from "./workforce-registry-tools";
import { loadOwnerBrainKnowledge } from "./owner-brain-context";
import { OWNER_CONNECTIONS_TOOL } from "./owner-connections-tool";
import { BUSINESS_SIGNALS_TOOL } from "./business-signals-tool";
import { BUSINESS_PRIORITIES_TOOL } from "./business-priorities-tool";
import { AUTONOMY_DECISION_TOOL } from "./autonomy-decision-tool";

/**
 * Shared turn/thread logic for the admin and client web Copilot UIs
 * (app/admin/(shell)/copilot, app/app/copilot) — both wrap this with their
 * own principal resolution (lib/agent-core/web-principal.ts) and thin
 * server actions, so the actual orchestration (and CONFIRM/CANCEL
 * deterministic handling — see below) lives in exactly one place, matching
 * how the WhatsApp channel handles it in
 * app/api/internal/agent/whatsapp/route.ts.
 */

export interface CopilotMessageView {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName: string | null;
  createdAt: string;
}

export async function loadCopilotThread(principal: AgentPrincipal): Promise<CopilotMessageView[]> {
  const { supabase } = getTenantServiceContext();
  const session = await getOrCreateActiveSession(supabase, principal);
  const rows = await loadSessionMessages(supabase, session.id);
  return rows.map((row) => ({ id: row.id, role: row.role, content: row.content, toolName: row.tool_name, createdAt: row.created_at }));
}

export interface SendCopilotMessageResult {
  ok: boolean;
  replyText: string;
  status: string;
  confirmationRequired: boolean;
}

export async function sendCopilotMessage(principal: AgentPrincipal, userText: string): Promise<SendCopilotMessageResult> {
  const trimmed = userText.trim();
  if (!trimmed) return { ok: false, replyText: "", status: "failed", confirmationRequired: false };

  const { supabase } = getTenantServiceContext();

  // RESET/CONFIRM/CANCEL are deterministic, channel-independent commands (see
  // packages/agent-core/src/control-handlers.ts) — runAgentTurn itself
  // never parses them (that's this call site's job, same as the WhatsApp
  // route), so they're handled here directly rather than going through the
  // LLM loop. Recorded into the session manually since handleConfirm/
  // handleCancel don't touch agent_messages themselves.
  const parsed = parseCommand(trimmed);
  if (parsed.kind === "reset") {
    const replyText = await handleReset(supabase, principal);
    const session = await getOrCreateActiveSession(supabase, principal);
    await recordAgentMessage(supabase, { sessionId: session.id, role: "assistant", content: replyText });
    return { ok: true, replyText, status: "completed", confirmationRequired: false };
  }
  if (parsed.kind === "confirm" || parsed.kind === "cancel") {
    const session = await getOrCreateActiveSession(supabase, principal);
    await recordAgentMessage(supabase, { sessionId: session.id, role: "user", content: trimmed });
    const replyText = parsed.kind === "confirm" ? (await handleConfirm(supabase, principal, parsed.code, [])).reply : await handleCancel(supabase, principal, parsed.code);
    await recordAgentMessage(supabase, { sessionId: session.id, role: "assistant", content: replyText });
    return { ok: true, replyText, status: "completed", confirmationRequired: false };
  }

  const result = await runAgentTurn({
    supabase,
    principal,
    provider: createAgentCoreProviderAdapter(principal.tenantId),
    userText: trimmed,
    extraTools: [...RESEARCH_DELEGATION_TOOLS, ...GROWTH_MEDIA_TOOLS, ...WORKFORCE_REGISTRY_TOOLS, OWNER_CONNECTIONS_TOOL, BUSINESS_SIGNALS_TOOL, BUSINESS_PRIORITIES_TOOL, AUTONOMY_DECISION_TOOL],
    extraKnowledge: await loadOwnerBrainKnowledge(principal),
  });
  return { ok: result.status !== "failed", replyText: result.replyText, status: result.status, confirmationRequired: result.confirmationRequired };
}
