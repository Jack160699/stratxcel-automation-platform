import type { ServiceClient } from "./db.ts";

export type KillSwitchScope = "global_hermes" | "worker_type" | "tenant" | "mission";

/**
 * Emergency operational stop, checked at the smallest scope up through the
 * broadest. A worker calls this before claiming its next job (worker_type +
 * global_hermes) and again before dispatching a claimed job's actual work
 * (tenant + mission) — fail closed: any read error is treated as "active"
 * (stop), never as "assume it's fine and proceed." An active kill switch
 * only prevents *new* claims/dispatches; it never cancels or deletes
 * already-queued work (see requeueDeadLetter for recovery once lifted).
 */
export async function isKillSwitchActive(
  supabase: ServiceClient,
  checks: Array<{ scope: KillSwitchScope; scopeId?: string | null }>
): Promise<{ active: boolean; reason?: string; scope?: KillSwitchScope }> {
  for (const check of checks) {
    const { data, error } = await supabase
      .from("kill_switches")
      .select("enabled, reason")
      .eq("scope", check.scope)
      .eq("scope_id", check.scopeId ?? "")
      .maybeSingle();

    if (error) {
      // Fail closed: an unreadable kill-switch table means we cannot prove
      // it's safe to proceed.
      return { active: true, reason: `kill_switch_check_failed: ${error.message}`, scope: check.scope };
    }
    if (data?.enabled) {
      return { active: true, reason: data.reason ?? undefined, scope: check.scope };
    }
  }
  return { active: false };
}

export async function setKillSwitch(
  supabase: ServiceClient,
  input: { scope: KillSwitchScope; scopeId?: string | null; enabled: boolean; reason?: string; createdBy?: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("kill_switches")
    .upsert(
      {
        scope: input.scope,
        scope_id: input.scopeId ?? "",
        enabled: input.enabled,
        reason: input.reason ?? null,
        created_by: input.createdBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scope,scope_id" }
    );
  if (error) throw new Error(`setKillSwitch: ${error.message}`);
}

export async function listKillSwitches(supabase: ServiceClient) {
  const { data, error } = await supabase.from("kill_switches").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(`listKillSwitches: ${error.message}`);
  return data ?? [];
}
