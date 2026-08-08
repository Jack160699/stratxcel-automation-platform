import type { ServiceClient } from "./db.ts";

export interface CrmFollowUpRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  conversation_id: string | null;
  next_action: string;
  due_at: string;
  assigned_to: string | null;
  status: "pending" | "sent" | "skipped" | "cancelled" | "failed";
  attempts: number;
  max_attempts: number;
  outcome: string | null;
  created_at: string;
  updated_at: string;
}

export async function scheduleFollowUp(
  supabase: ServiceClient,
  input: { tenantId: string; leadId: string; conversationId?: string | null; nextAction: string; dueAt: Date; assignedTo?: string | null; maxAttempts?: number }
): Promise<CrmFollowUpRow> {
  const { data, error } = await supabase
    .from("crm_follow_ups")
    .insert({
      tenant_id: input.tenantId,
      lead_id: input.leadId,
      conversation_id: input.conversationId ?? null,
      next_action: input.nextAction,
      due_at: input.dueAt.toISOString(),
      assigned_to: input.assignedTo ?? null,
      max_attempts: input.maxAttempts ?? 3,
    })
    .select("*")
    .single();
  if (error) throw new Error(`scheduleFollowUp: ${error.message}`);
  return data as CrmFollowUpRow;
}

/** Due, still-pending, and not yet past its own retry budget — the caller (a cron/queue job) still enforces every other send-time gate (consent, kill switch, entitlement). */
export async function listDueFollowUps(supabase: ServiceClient, limit = 50): Promise<CrmFollowUpRow[]> {
  const { data, error } = await supabase
    .from("crm_follow_ups")
    .select("*")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .lt("attempts", 3) // paired with the per-row max_attempts check the caller does before acting
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listDueFollowUps: ${error.message}`);
  return (data ?? []) as CrmFollowUpRow[];
}

export async function recordFollowUpAttempt(
  supabase: ServiceClient,
  input: { tenantId: string; followUpId: string; outcome: "sent" | "skipped" | "failed"; reason?: string }
): Promise<CrmFollowUpRow> {
  const { data: current, error: fetchErr } = await supabase.from("crm_follow_ups").select("*").eq("id", input.followUpId).eq("tenant_id", input.tenantId).single();
  if (fetchErr || !current) throw new Error(`recordFollowUpAttempt: follow-up not found`);

  const attempts = current.attempts + 1;
  // No infinite loop: exhausting max_attempts always terminates the follow-up.
  const nextStatus = input.outcome === "sent" ? "sent" : attempts >= current.max_attempts ? "failed" : "pending";

  const { data, error } = await supabase
    .from("crm_follow_ups")
    .update({ attempts, status: nextStatus, outcome: input.reason ?? input.outcome, updated_at: new Date().toISOString() })
    .eq("id", input.followUpId)
    .select("*")
    .single();
  if (error) throw new Error(`recordFollowUpAttempt: ${error.message}`);
  return data as CrmFollowUpRow;
}

export async function cancelFollowUp(supabase: ServiceClient, tenantId: string, followUpId: string): Promise<void> {
  const { error } = await supabase
    .from("crm_follow_ups")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", followUpId)
    .eq("tenant_id", tenantId)
    .eq("status", "pending");
  if (error) throw new Error(`cancelFollowUp: ${error.message}`);
}

export async function listFollowUpsForTenant(supabase: ServiceClient, tenantId: string, limit = 100): Promise<CrmFollowUpRow[]> {
  const { data, error } = await supabase.from("crm_follow_ups").select("*").eq("tenant_id", tenantId).order("due_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`listFollowUpsForTenant: ${error.message}`);
  return (data ?? []) as CrmFollowUpRow[];
}
