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
import { loadOwnerBrainKnowledge } from "./owner-brain-context";
import { ALL_EXTRA_TOOLS } from "./all-tools";
import { AGENT_FACTORY_TOOLS } from "./agent-factory-tools";
import { resolveAgentDispatch } from "./agent-dispatch";

const EXTRA_TOOLS = [...ALL_EXTRA_TOOLS, ...AGENT_FACTORY_TOOLS];

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

  // Agent Factory dispatch: "AGENT:<key>: <message>" routes this turn to a
  // dynamically-defined agent's narrower tool set instead of the full
  // default. Applied after RESET/CONFIRM/CANCEL are already ruled out above
  // (see agent-dispatch.ts's header comment for why this stays separate
  // from parseCommand). A recognized-but-unknown/disabled agent key returns
  // a deterministic error immediately, the same way a malformed CONFIRM/
  // CANCEL code would, rather than silently falling through to a normal
  // turn on text that isn't really a question.
  const dispatch = await resolveAgentDispatch(supabase, trimmed);
  if (dispatch.dispatchError) {
    const session = await getOrCreateActiveSession(supabase, principal);
    await recordAgentMessage(supabase, { sessionId: session.id, role: "user", content: trimmed });
    await recordAgentMessage(supabase, { sessionId: session.id, role: "assistant", content: dispatch.dispatchError });
    return { ok: false, replyText: dispatch.dispatchError, status: "failed", confirmationRequired: false };
  }

  const result = await runAgentTurn({
    supabase,
    principal,
    provider: createAgentCoreProviderAdapter(principal.tenantId),
    userText: dispatch.userText,
    extraTools: EXTRA_TOOLS,
    toolNameAllowlist: dispatch.toolNameAllowlist ?? undefined,
    extraKnowledge: await loadOwnerBrainKnowledge(principal),
  });
  return { ok: result.status !== "failed", replyText: result.replyText, status: result.status, confirmationRequired: result.confirmationRequired };
}
