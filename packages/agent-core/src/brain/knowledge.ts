import type { ServiceClient } from "../db.ts";
import type { AgentPrincipal } from "../principal.ts";

export interface BrainKnowledge { workspaceName?: string; businessFacts: string[] }

/** Deterministic retrieval from existing authorized platform records. No
 * duplicate Brand Brain and no embedding provider are introduced in V1. */
export async function retrieveBrainKnowledge(supabase: ServiceClient, principal: AgentPrincipal): Promise<BrainKnowledge> {
  if (principal.kind === "staff") {
    const { count } = await supabase.from("tenants").select("id", { count: "exact", head: true });
    return { businessFacts: [`Stratxcel currently has ${count ?? 0} client workspaces.`] };
  }
  const [{ data: tenant }, { data: brain }] = await Promise.all([
    supabase.from("tenants").select("name").eq("id", principal.tenantId).maybeSingle<{name:string}>(),
    supabase.from("brand_brain_versions").select("content, version").eq("tenant_id", principal.tenantId).order("version", { ascending: false }).limit(1).maybeSingle<{content:Record<string,unknown>;version:number}>(),
  ]);
  const facts: string[] = [];
  if (brain?.content) facts.push(JSON.stringify(brain.content).slice(0, 3000));
  return { workspaceName: tenant?.name, businessFacts: facts };
}
