import type { ServiceClient } from "../db.ts";
import { generateDisplayCode, hashCode } from "../crypto.ts";
import type { AgentChannel } from "../principal.ts";

const CONFIRMATION_TTL_MS = 10 * 60 * 1000; // ~10 minutes

export interface CreateActionConfirmationInput {
  authUserId: string;
  channel: AgentChannel;
  actionName: string;
  normalizedInput: Record<string, unknown>;
  agentRunId?: string | null;
}

export interface ActionConfirmation {
  id: string;
  /** Plaintext display code, e.g. "482917". Shown to the user once ("Reply CONFIRM 482917"). */
  code: string;
  expiresAt: string;
}

export async function createActionConfirmation(
  supabase: ServiceClient,
  input: CreateActionConfirmationInput
): Promise<ActionConfirmation> {
  const code = generateDisplayCode();
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from("agent_action_confirmations")
    .insert({
      auth_user_id: input.authUserId,
      channel: input.channel,
      action_name: input.actionName,
      normalized_input: input.normalizedInput,
      confirmation_hash: hashCode(code),
      expires_at: expiresAt,
      agent_run_id: input.agentRunId ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;

  return { id: data.id, code, expiresAt };
}

export type ConsumeConfirmationResult =
  | {
      ok: true;
      id: string;
      authUserId: string;
      channel: AgentChannel;
      actionName: string;
      normalizedInput: Record<string, unknown>;
    }
  | { ok: false; reason: "not_found" | "expired" | "already_used" | "cancelled" | "principal_mismatch" };

/**
 * Consume a confirmation for CONFIRM <code>. Bound to the exact principal that
 * requested it — a code typed by a different sender (even a linked one) is
 * rejected. Re-executes only the exact stored action_name + normalized_input;
 * the model never reinterprets what "CONFIRM" means.
 */
export async function consumeActionConfirmation(
  supabase: ServiceClient,
  authUserId: string,
  code: string
): Promise<ConsumeConfirmationResult> {
  const confirmationHash = hashCode(code);

  const { data: candidate, error: findErr } = await supabase
    .from("agent_action_confirmations")
    .select("id, auth_user_id, channel, action_name, normalized_input, expires_at, used_at, cancelled_at")
    .eq("confirmation_hash", confirmationHash)
    .maybeSingle<{
      id: string;
      auth_user_id: string;
      channel: AgentChannel;
      action_name: string;
      normalized_input: Record<string, unknown>;
      expires_at: string;
      used_at: string | null;
      cancelled_at: string | null;
    }>();
  if (findErr) throw findErr;
  if (!candidate) return { ok: false, reason: "not_found" };
  if (candidate.auth_user_id !== authUserId) return { ok: false, reason: "principal_mismatch" };
  if (candidate.cancelled_at) return { ok: false, reason: "cancelled" };
  if (candidate.used_at) return { ok: false, reason: "already_used" };
  if (new Date(candidate.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const { data: claimed, error: claimErr } = await supabase
    .from("agent_action_confirmations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .is("used_at", null)
    .is("cancelled_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return { ok: false, reason: "already_used" };

  return {
    ok: true,
    id: candidate.id,
    authUserId: candidate.auth_user_id,
    channel: candidate.channel,
    actionName: candidate.action_name,
    normalizedInput: candidate.normalized_input,
  };
}

export type CancelConfirmationResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "already_used" | "cancelled" | "principal_mismatch" };

export async function cancelActionConfirmation(
  supabase: ServiceClient,
  authUserId: string,
  code: string
): Promise<CancelConfirmationResult> {
  const confirmationHash = hashCode(code);

  const { data: candidate, error: findErr } = await supabase
    .from("agent_action_confirmations")
    .select("id, auth_user_id, used_at, cancelled_at")
    .eq("confirmation_hash", confirmationHash)
    .maybeSingle<{ id: string; auth_user_id: string; used_at: string | null; cancelled_at: string | null }>();
  if (findErr) throw findErr;
  if (!candidate) return { ok: false, reason: "not_found" };
  if (candidate.auth_user_id !== authUserId) return { ok: false, reason: "principal_mismatch" };
  if (candidate.used_at) return { ok: false, reason: "already_used" };
  if (candidate.cancelled_at) return { ok: false, reason: "cancelled" };

  const { data: claimed, error: claimErr } = await supabase
    .from("agent_action_confirmations")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .is("used_at", null)
    .is("cancelled_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return { ok: false, reason: "already_used" };

  return { ok: true, id: candidate.id };
}
