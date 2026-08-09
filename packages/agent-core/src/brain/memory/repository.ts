import type { ServiceClient } from "../../db.ts";
import type { AgentPrincipal } from "../../principal.ts";

export interface AgentMemory { id: string; scope: "personal" | "workspace" | "agency"; memoryKey: string; memoryValue: string; updatedAt: string }
const SECRET_PATTERN = /(?:api[_ -]?key|secret|password|private[_ -]?key|authorization|bearer|token)\s*[:=]/i;

export function assertSafeMemoryValue(value: string): void {
  if (SECRET_PATTERN.test(value)) throw new Error("Sensitive credentials cannot be stored in Agent memory.");
}

function scopeFilter(principal: AgentPrincipal, scope: AgentMemory["scope"]) {
  if (scope === "personal") return { owner_auth_user_id: principal.authUserId, tenant_id: null };
  if (scope === "workspace" && principal.kind === "client") return { owner_auth_user_id: null, tenant_id: principal.tenantId };
  if (scope === "agency" && principal.kind === "staff" && principal.role === "platform_owner") return { owner_auth_user_id: null, tenant_id: null };
  throw new Error("Memory scope is not authorized for this principal.");
}

export async function listAgentMemories(supabase: ServiceClient, principal: AgentPrincipal, limit = 20): Promise<AgentMemory[]> {
  let query = supabase.from("agent_memories").select("id, scope, memory_key, memory_value, updated_at").is("deleted_at", null);
  if (principal.kind === "client") query = query.or(`owner_auth_user_id.eq.${principal.authUserId},and(scope.eq.workspace,tenant_id.eq.${principal.tenantId})`);
  else query = query.or(`owner_auth_user_id.eq.${principal.authUserId}${principal.role === "platform_owner" ? ",scope.eq.agency" : ""}`);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(Math.min(limit, 50));
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, scope: row.scope, memoryKey: row.memory_key, memoryValue: row.memory_value, updatedAt: row.updated_at }));
}

export async function rememberAgentFact(supabase: ServiceClient, principal: AgentPrincipal, input: { scope: AgentMemory["scope"]; key: string; value: string }): Promise<void> {
  assertSafeMemoryValue(input.value);
  const scoped = scopeFilter(principal, input.scope);
  const existing = await supabase.from("agent_memories").select("id").eq("scope", input.scope).eq("memory_key", input.key).match(scoped).is("deleted_at", null).maybeSingle<{id:string}>();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const { error } = await supabase.from("agent_memories").update({ memory_value: input.value, updated_at: new Date().toISOString() }).eq("id", existing.data.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("agent_memories").insert({ scope: input.scope, ...scoped, memory_key: input.key, memory_value: input.value, source_channel: principal.channel, created_by: principal.authUserId });
  if (error) throw error;
}

export async function forgetAgentFact(supabase: ServiceClient, principal: AgentPrincipal, input: { scope: AgentMemory["scope"]; key: string }): Promise<boolean> {
  const scoped = scopeFilter(principal, input.scope);
  const { data, error } = await supabase.from("agent_memories").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("scope", input.scope).eq("memory_key", input.key).match(scoped).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
