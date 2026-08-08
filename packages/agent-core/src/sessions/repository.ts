import type { ServiceClient } from "../db.ts";
import type { AgentPrincipal, AgentChannel } from "../principal.ts";

/**
 * Channel-independent agent session/run storage (PHASE 15). Deliberately
 * additive and separate from the existing Social Autopilot agent session
 * tables (lib/social/repositories/agent*.ts), which are OwnerContext/
 * single-tenant specific and out of scope to repurpose.
 *
 * No model chain-of-thought is ever written here — only operational
 * telemetry: user text, final assistant text, and tool invocation metadata.
 */

export interface AgentSessionRow {
  id: string;
  principal_kind: "staff" | "client";
  auth_user_id: string;
  tenant_id: string | null;
  channel: AgentChannel;
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
}

export async function createAgentSession(
  supabase: ServiceClient,
  principal: AgentPrincipal
): Promise<AgentSessionRow> {
  const { data, error } = await supabase
    .from("agent_sessions")
    .insert({
      principal_kind: principal.kind,
      auth_user_id: principal.authUserId,
      tenant_id: principal.tenantId,
      channel: principal.channel,
    })
    .select("*")
    .single<AgentSessionRow>();
  if (error) throw error;
  return data;
}

/** Find the caller's most recent open session on this channel, or null. */
export async function findActiveSession(
  supabase: ServiceClient,
  principal: AgentPrincipal
): Promise<AgentSessionRow | null> {
  const { data, error } = await supabase
    .from("agent_sessions")
    .select("*")
    .eq("auth_user_id", principal.authUserId)
    .eq("channel", principal.channel)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AgentSessionRow>();
  if (error) throw error;
  return data;
}

/** RESET / NEW CHAT — closes the current session and starts a fresh one.
 *  Does NOT unlink the principal (see command-parser.ts / PHASE 20). */
export async function resetAgentSession(
  supabase: ServiceClient,
  principal: AgentPrincipal
): Promise<AgentSessionRow> {
  await supabase
    .from("agent_sessions")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("auth_user_id", principal.authUserId)
    .eq("channel", principal.channel)
    .eq("status", "active");
  return createAgentSession(supabase, principal);
}

export async function getOrCreateActiveSession(
  supabase: ServiceClient,
  principal: AgentPrincipal
): Promise<AgentSessionRow> {
  const existing = await findActiveSession(supabase, principal);
  if (existing) return existing;
  return createAgentSession(supabase, principal);
}

export async function recordAgentMessage(
  supabase: ServiceClient,
  input: { sessionId: string; role: "user" | "assistant" | "tool"; content: string; toolName?: string }
): Promise<void> {
  const { error } = await supabase.from("agent_messages").insert({
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    tool_name: input.toolName ?? null,
  });
  if (error) throw error;
}

export interface AgentRunRow {
  id: string;
  session_id: string;
  channel: AgentChannel;
  provider_message_id: string | null;
  status: "running" | "completed" | "failed" | "blocked";
}

export type StartAgentRunResult =
  | { outcome: "created"; run: AgentRunRow }
  /** A run already exists for this providerMessageId — idempotent replay.
   *  Caller must NOT re-invoke tools or create a second confirmation. */
  | { outcome: "duplicate"; run: AgentRunRow };

/**
 * Starts a run, idempotent by providerMessageId (PHASE 15 "WHATSAPP
 * CORRELATION"). Relies on the partial unique index
 * agent_runs_provider_message_id_uidx — on a unique-violation we re-fetch
 * and return the existing row instead of creating a second logical run,
 * mirroring the idempotency pattern in packages/queue/src/postgres-adapter.ts.
 */
export async function startAgentRun(
  supabase: ServiceClient,
  input: { sessionId: string; channel: AgentChannel; providerMessageId?: string | null }
): Promise<StartAgentRunResult> {
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      session_id: input.sessionId,
      channel: input.channel,
      provider_message_id: input.providerMessageId ?? null,
    })
    .select("id, session_id, channel, provider_message_id, status")
    .single<AgentRunRow>();

  if (!error) return { outcome: "created", run: data };

  // Postgres unique_violation
  if (error.code === "23505" && input.providerMessageId) {
    const { data: existing, error: findErr } = await supabase
      .from("agent_runs")
      .select("id, session_id, channel, provider_message_id, status")
      .eq("provider_message_id", input.providerMessageId)
      .single<AgentRunRow>();
    if (findErr) throw findErr;
    return { outcome: "duplicate", run: existing };
  }

  throw error;
}

export async function completeAgentRun(
  supabase: ServiceClient,
  runId: string,
  status: "completed" | "failed" | "blocked",
  errorReason?: string
): Promise<void> {
  const { error } = await supabase
    .from("agent_runs")
    .update({ status, error_reason: errorReason ?? null, completed_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) throw error;
}

export async function recordRunEvent(
  supabase: ServiceClient,
  input: {
    runId: string;
    eventType: string;
    toolName?: string;
    risk?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("agent_run_events").insert({
    run_id: input.runId,
    event_type: input.eventType,
    tool_name: input.toolName ?? null,
    risk: input.risk ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}

/** Best-effort telemetry counter — a plain read-modify-write, not a security
 *  control, so the narrow race window under concurrent tool calls within the
 *  same run is acceptable (a future migration could add a SQL increment RPC
 *  if exact counts ever matter operationally). */
export async function incrementToolCallCount(supabase: ServiceClient, runId: string): Promise<void> {
  const { data } = await supabase.from("agent_runs").select("tool_calls_count").eq("id", runId).single();
  const current = (data?.tool_calls_count as number | undefined) ?? 0;
  await supabase.from("agent_runs").update({ tool_calls_count: current + 1 }).eq("id", runId);
}
