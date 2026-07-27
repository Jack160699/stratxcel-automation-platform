import type { OwnerContext } from "../db-context";

export interface AutomationSettingsRow {
  owner_id: string;
  autonomy_level: string; // 'MANUAL' | 'SUPERVISED' | 'AUTOPILOT'
  shadow_mode: boolean;
  dry_run: boolean;
  autopilot_enabled: boolean;
  qa_threshold: number;
  rolling_plan_days: number;
  monthly_budget_cents: number;
  monthly_ceiling_cents: number;
  per_content_max_cents: number;
  strategy_mix: Record<string, number>;
  require_approval_for: string[];
  min_confidence_to_autoact: number;
  updated_at: string;
}

const DEFAULTS: Omit<AutomationSettingsRow, "owner_id" | "updated_at"> = {
  autonomy_level: "MANUAL",
  shadow_mode: true,
  dry_run: true,
  autopilot_enabled: false,
  qa_threshold: 85,
  rolling_plan_days: 14,
  monthly_budget_cents: 0,
  monthly_ceiling_cents: 0,
  per_content_max_cents: 0,
  strategy_mix: {},
  require_approval_for: ["publish_post"],
  min_confidence_to_autoact: 0.7,
};

export async function getAutomationSettings(ctx: OwnerContext): Promise<AutomationSettingsRow> {
  const { data } = await ctx.supabase.from("social_automation_settings").select("*").eq("owner_id", ctx.ownerId).maybeSingle();
  if (data) return data as AutomationSettingsRow;
  return { owner_id: ctx.ownerId, ...DEFAULTS, updated_at: "" };
}

export async function upsertAutomationSettings(ctx: OwnerContext, patch: Partial<Omit<AutomationSettingsRow, "owner_id" | "updated_at">>) {
  const current = await getAutomationSettings(ctx);
  const merged = { ...current, ...patch };
  const { error } = await ctx.supabase.from("social_automation_settings").upsert(
    {
      owner_id: ctx.ownerId,
      autonomy_level: merged.autonomy_level,
      shadow_mode: merged.shadow_mode,
      dry_run: merged.dry_run,
      autopilot_enabled: merged.autopilot_enabled,
      qa_threshold: merged.qa_threshold,
      rolling_plan_days: merged.rolling_plan_days,
      monthly_budget_cents: merged.monthly_budget_cents,
      monthly_ceiling_cents: merged.monthly_ceiling_cents,
      per_content_max_cents: merged.per_content_max_cents,
      strategy_mix: merged.strategy_mix,
      require_approval_for: merged.require_approval_for,
      min_confidence_to_autoact: merged.min_confidence_to_autoact,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );
  if (error) throw new Error(error.message);
}

/**
 * Whether a given tool/action may run automatically under the current
 * autonomy level + guardrails, or must be queued for human approval.
 * shadow_mode=true always forces approval (nothing external happens
 * without a human even proposing it) regardless of autonomy_level.
 */
export function requiresApproval(toolName: string, settings: AutomationSettingsRow, confidence: number): boolean {
  if (settings.shadow_mode) return true;
  if (settings.require_approval_for.includes(toolName)) return true;
  if (settings.autonomy_level !== "AUTOPILOT") return true; // MANUAL/SUPERVISED always require approval
  if (confidence < settings.min_confidence_to_autoact) return true;
  return false;
}
