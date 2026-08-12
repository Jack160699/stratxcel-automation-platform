import type { OwnerContext } from "../db-context.ts";

export interface AgentSessionRow {
  id: string;
  owner_id: string;
  title: string | null;
  status: string;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentMessageRow {
  id: string;
  session_id: string;
  role: "USER" | "AGENT" | "SYSTEM";
  content: string;
  parts: unknown[];
  created_at: string;
}

export interface AgentActionRow {
  id: string;
  session_id: string | null;
  message_id: string | null;
  tool_name: string;
  input: Record<string, unknown>;
  output: unknown;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function createAgentSession(ctx: OwnerContext, title: string | null): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("social_agent_sessions")
    .insert({ owner_id: ctx.ownerId, title, status: "IDLE", context: { source: "MANUAL" } })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "agent session insert failed");
  return data.id as string;
}

export async function setSessionStatus(ctx: OwnerContext, sessionId: string, status: string) {
  await ctx.supabase.from("social_agent_sessions").update({ status, updated_at: new Date().toISOString() }).eq("id", sessionId);
}

const ACTIVE_SESSION_STATUSES = new Set(["GENERATING", "RUNNING", "IN_PROGRESS", "ATTENTION_REQUIRED"]);

export async function getLatestSession(ctx: OwnerContext): Promise<AgentSessionRow | null> {
  const { data } = await ctx.supabase
    .from("social_agent_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as AgentSessionRow | null;
}

/** Returns only a genuinely active mission session — never a terminal FAILED/IDLE row. */
export async function getCurrentMissionSession(ctx: OwnerContext): Promise<AgentSessionRow | null> {
  const { data } = await ctx.supabase
    .from("social_agent_sessions")
    .select("*")
    .in("status", Array.from(ACTIVE_SESSION_STATUSES))
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgentSessionRow | null) ?? null;
}

export async function getRecentMissionSessions(ctx: OwnerContext, limit = 5): Promise<AgentSessionRow[]> {
  const { data } = await ctx.supabase
    .from("social_agent_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AgentSessionRow[];
}

export async function getSession(ctx: OwnerContext, sessionId: string): Promise<AgentSessionRow | null> {
  const { data } = await ctx.supabase.from("social_agent_sessions").select("*").eq("id", sessionId).maybeSingle();
  return data as AgentSessionRow | null;
}

export async function listSessions(ctx: OwnerContext, limit = 30): Promise<AgentSessionRow[]> {
  const { data } = await ctx.supabase
    .from("social_agent_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AgentSessionRow[];
}

export async function insertMessage(ctx: OwnerContext, sessionId: string, role: "USER" | "AGENT" | "SYSTEM", content: string, parts: unknown[] = []): Promise<string | undefined> {
  const { data, error } = await ctx.supabase.from("social_agent_messages").insert({ session_id: sessionId, role, content, parts }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "agent message insert failed");
  return data?.id as string | undefined;
}

export async function loadHistory(ctx: OwnerContext, sessionId: string, limit = 40): Promise<AgentMessageRow[]> {
  const { data } = await ctx.supabase
    .from("social_agent_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as AgentMessageRow[];
}

export async function getSessionDetail(ctx: OwnerContext, sessionId: string) {
  const [{ data: messages }, { data: actions }] = await Promise.all([
    ctx.supabase.from("social_agent_messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
    ctx.supabase.from("social_agent_actions").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
  ]);
  return { messages: (messages ?? []) as AgentMessageRow[], actions: (actions ?? []) as AgentActionRow[] };
}

export async function proposeAction(ctx: OwnerContext, sessionId: string, toolName: string, input: Record<string, unknown>): Promise<string | undefined> {
  const { data } = await ctx.supabase
    .from("social_agent_actions")
    .insert({ session_id: sessionId, tool_name: toolName, input, status: "PROPOSED" })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

/**
 * Atomically mark scoped active PROPOSED actions as SUPERSEDED.
 * Does not delete rows — history remains queryable.
 */
export async function supersedeProposedActions(
  ctx: OwnerContext,
  sessionId: string,
  actionIds: string[],
  reason = "superseded_by_newer_review_revision"
): Promise<number> {
  if (!actionIds.length) return 0;
  const { data, error } = await ctx.supabase
    .from("social_agent_actions")
    .update({ status: "SUPERSEDED", reason, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("status", "PROPOSED")
    .in("id", actionIds)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function recordExecutedAction(ctx: OwnerContext, sessionId: string, toolName: string, input: Record<string, unknown>, output: unknown, status: "SUCCEEDED" | "FAILED", reason?: string) {
  await ctx.supabase.from("social_agent_actions").insert({ session_id: sessionId, tool_name: toolName, input, output: output as never, status, reason: reason ?? null });
}

export async function getAction(ctx: OwnerContext, actionId: string): Promise<AgentActionRow | null> {
  const { data } = await ctx.supabase.from("social_agent_actions").select("*").eq("id", actionId).maybeSingle();
  return data as AgentActionRow | null;
}

export async function updateActionStatus(ctx: OwnerContext, actionId: string, status: string, extra: Record<string, unknown> = {}) {
  await ctx.supabase.from("social_agent_actions").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", actionId);
}

function isMissingClaimRpc(message: string): boolean {
  return /claim_social_agent_action/i.test(message) && /schema cache|could not find the function|PGRST202/i.test(message);
}

/**
 * Atomic claim: preferred path is the DB RPC. If PostgREST has not yet exposed
 * that function (schema-cache miss), fall back to an equivalent conditional
 * update that still requires PROPOSED → target and owner-owned session.
 */
export async function claimAgentAction(ctx: OwnerContext, actionId: string, targetStatus: "EXECUTING" | "REJECTED"): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc("claim_social_agent_action", {
    p_action_id: actionId,
    p_owner_id: ctx.ownerId,
    p_target_status: targetStatus,
  });
  if (!error) return data === true;
  if (!isMissingClaimRpc(error.message)) throw new Error(error.message);
  return claimAgentActionFallback(ctx, actionId, targetStatus);
}

async function claimAgentActionFallback(
  ctx: OwnerContext,
  actionId: string,
  targetStatus: "EXECUTING" | "REJECTED"
): Promise<boolean> {
  const action = await getAction(ctx, actionId);
  // SUPERSEDED and any non-PROPOSED status must never execute.
  if (!action || action.status !== "PROPOSED" || !action.session_id) return false;
  const { data: session } = await ctx.supabase
    .from("social_agent_sessions")
    .select("id")
    .eq("id", action.session_id)
    .eq("owner_id", ctx.ownerId)
    .maybeSingle();
  if (!session) return false;
  const { data, error } = await ctx.supabase
    .from("social_agent_actions")
    .update({ status: targetStatus, updated_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("status", "PROPOSED")
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) === 1;
}

export async function updateActionInput(ctx: OwnerContext, actionId: string, input: Record<string, unknown>) {
  await ctx.supabase.from("social_agent_actions").update({ input, updated_at: new Date().toISOString() }).eq("id", actionId);
}

/** Whether a session still has any action awaiting a human decision — used to decide whether resolving one approval/rejection can return the session to READY. */
export async function hasPendingActions(ctx: OwnerContext, sessionId: string): Promise<boolean> {
  const { count } = await ctx.supabase
    .from("social_agent_actions")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "PROPOSED");
  return (count ?? 0) > 0;
}
