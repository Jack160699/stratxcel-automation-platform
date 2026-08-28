import { createSupabaseServiceClient } from "../supabase/service.ts";
import { recordAudit } from "./repositories/system.ts";
import type { OwnerContext } from "./db-context.ts";

export type AutomationTrigger = "post_published" | "job_dead_letter";

export interface AutomationDefinition {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  trigger: { type: AutomationTrigger; provider?: string };
  conditions: Record<string, unknown>;
  actions: Array<{ type: "notify" | "propose_followup" }>;
  enabled: boolean;
}

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export async function listAutomations(ctx: OwnerContext) {
  const { data } = await ctx.supabase.from("social_automations").select("*").order("created_at", { ascending: false });
  return (data ?? []) as AutomationDefinition[];
}

export async function createAutomation(
  ctx: OwnerContext,
  input: { name: string; description?: string | null; trigger: AutomationDefinition["trigger"]; actions: AutomationDefinition["actions"] }
) {
  const { data, error } = await ctx.supabase
    .from("social_automations")
    .insert({
      owner_id: ctx.ownerId,
      name: input.name,
      description: input.description ?? null,
      trigger: input.trigger,
      conditions: {},
      actions: input.actions,
      enabled: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function setAutomationEnabled(ctx: OwnerContext, id: string, enabled: boolean) {
  await ctx.supabase.from("social_automations").update({ enabled, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function deleteAutomation(ctx: OwnerContext, id: string) {
  await ctx.supabase.from("social_automations").delete().eq("id", id);
}

export async function listAutomationRuns(ctx: OwnerContext, limit = 20) {
  const { data } = await ctx.supabase
    .from("social_automation_runs")
    .select("*, social_automations(name)")
    .order("started_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/**
 * Runs every enabled automation whose trigger matches, from inside the
 * publishing worker (worker.ts calls this after a job settles). Background
 * context — no user session — so this always uses service-role, reading and
 * writing social_automations/social_automation_runs directly (service role
 * bypasses the owner-scoped RLS policy, which is fine: this is exactly the
 * "server process that genuinely requires it" carve-out).
 */
export async function evaluateAutomations(
  trigger: AutomationTrigger,
  context: { provider?: string; jobId?: string; error?: string }
) {
  const service: ServiceClient = createSupabaseServiceClient();
  const { data: automations } = await service.from("social_automations").select("*").eq("enabled", true);
  const matching = ((automations ?? []) as AutomationDefinition[]).filter(
    (a) => a.trigger.type === trigger && (!a.trigger.provider || a.trigger.provider === context.provider)
  );

  for (const automation of matching) {
    const { data: run } = await service
      .from("social_automation_runs")
      .insert({ automation_id: automation.id, status: "RUNNING", trigger_context: context })
      .select("id")
      .single();

    try {
      for (const action of automation.actions) {
        if (action.type === "notify") {
          await recordAudit({
            actorType: "SYSTEM",
            action: "automation.notify",
            summary: `Automation "${automation.name}" fired: ${trigger}`,
            meta: context,
          });
        } else if (action.type === "propose_followup") {
          await service.from("social_agent_actions").insert({
            tool_name: "create_content_item",
            input: { title: `Follow-up (automation: ${automation.name})`, masterIdea: "", objective: "", contentPillar: "" },
            status: "PROPOSED",
            reason: `Automation "${automation.name}" proposed a follow-up after ${trigger}`,
          });
        }
      }
      await service
        .from("social_automation_runs")
        .update({ status: "SUCCEEDED", finished_at: new Date().toISOString(), result: { actions: automation.actions.length } })
        .eq("id", run?.id);
      await recordAudit({
        actorType: "SYSTEM",
        action: "automation.run",
        targetType: "social_automation",
        targetId: automation.id,
        summary: `Automation "${automation.name}" ran on trigger ${trigger}`,
      });
    } catch (err) {
      await service
        .from("social_automation_runs")
        .update({ status: "FAILED", finished_at: new Date().toISOString(), error: err instanceof Error ? err.message : "unknown error" })
        .eq("id", run?.id);
    }
  }
}
