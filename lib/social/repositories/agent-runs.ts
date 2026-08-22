import { type AgentReadContext } from "../agent-tenant-types.ts";

export type RunEventType =
  | "RUN_STARTED"
  | "UNDERSTANDING_REQUEST"
  | "ATTACHMENT_ACCESSED"
  | "PROVIDER_REQUEST_STARTED"
  | "PROVIDER_RESPONSE_RECEIVED"
  | "TOOL_STARTED"
  | "TOOL_COMPLETED"
  | "TOOL_FAILED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_REJECTED"
  | "RUN_COMPLETED"
  | "RUN_FAILED";

export type RunEventStatus = "INFO" | "SUCCESS" | "FAILED" | "PENDING";

export interface AgentRunRow {
  id: string;
  session_id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  error_reason: string | null;
  started_at: string;
  completed_at: string | null;
}

export type TerminalRunStatus = "COMPLETED" | "FAILED";

export interface AgentRunEventRow {
  id: string;
  run_id: string;
  type: RunEventType;
  label: string;
  tool_name: string | null;
  status: RunEventStatus;
  meta: Record<string, unknown>;
  created_at: string;
}

export async function startRun(ctx: AgentReadContext, sessionId: string): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("social_agent_runs")
    .insert({ session_id: sessionId, status: "RUNNING" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "agent run insert failed");
  return data.id as string;
}

export async function getRun(ctx: AgentReadContext, runId: string): Promise<AgentRunRow | null> {
  const { data } = await ctx.supabase
    .from("social_agent_runs")
    .select("id, session_id, status, error_reason, started_at, completed_at")
    .eq("id", runId)
    .maybeSingle();
  return data as AgentRunRow | null;
}

export async function completeRun(ctx: AgentReadContext, runId: string, status: "COMPLETED" | "FAILED", errorReason?: string) {
  await ctx.supabase
    .from("social_agent_runs")
    .update({ status, error_reason: errorReason ?? null, completed_at: new Date().toISOString() })
    .eq("id", runId);
}

export async function recordRunEvent(
  ctx: AgentReadContext,
  runId: string,
  event: { type: RunEventType; label: string; toolName?: string; status?: RunEventStatus; meta?: Record<string, unknown> }
) {
  await ctx.supabase.from("social_agent_run_events").insert({
    run_id: runId,
    type: event.type,
    label: event.label,
    tool_name: event.toolName ?? null,
    status: event.status ?? "INFO",
    meta: event.meta ?? {},
  });
}

export async function getLatestRun(ctx: AgentReadContext, sessionId: string): Promise<AgentRunRow | null> {
  const { data } = await ctx.supabase
    .from("social_agent_runs")
    .select("id, session_id, status, error_reason, started_at, completed_at")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as AgentRunRow | null;
}

export async function getRunEvents(ctx: AgentReadContext, runId: string): Promise<AgentRunEventRow[]> {
  const { data } = await ctx.supabase
    .from("social_agent_run_events")
    .select("id, run_id, type, label, tool_name, status, meta, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AgentRunEventRow[];
}

export async function getRunWithEvents(
  ctx: AgentReadContext,
  runId: string,
  after?: string | null
): Promise<{ run: AgentRunRow | null; events: AgentRunEventRow[] }> {
  let eventsQuery = ctx.supabase
    .from("social_agent_run_events")
    .select("id, run_id, type, label, tool_name, status, meta, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (after) eventsQuery = eventsQuery.gt("created_at", after);

  const [run, eventsRes] = await Promise.all([
    getRun(ctx, runId),
    eventsQuery,
  ]);

  if (!run) return { run: null, events: [] };
  return { run, events: (eventsRes.data ?? []) as AgentRunEventRow[] };
}

export async function getLatestRunWithEvents(ctx: AgentReadContext, sessionId: string): Promise<{ run: AgentRunRow | null; events: AgentRunEventRow[] }> {
  const run = await getLatestRun(ctx, sessionId);
  if (!run) return { run: null, events: [] };
  const events = await getRunEvents(ctx, run.id);
  return { run, events };
}
