import type { ServiceClient } from "../db.ts";
import type { AgentPrincipal } from "../principal.ts";

/**
 * Shared risk classification, used for both approval/confirmation policy
 * (see policy/channel-policy.ts) and the capability matrix.
 *
 *   read              — no side effects, always safe to run immediately.
 *   low_mutation       — a reversible, narrowly-scoped write (e.g. lead status).
 *   external_mutation  — a write with an external/customer-visible effect
 *                        (e.g. sending a message, scheduling an appointment).
 *   high_risk          — never exposed to any agent tool registry in v1. See
 *                        PHASE "HIGH-RISK POLICY" in the build brief for the
 *                        explicit denylist (delete tenant, secret rotation, etc).
 */
export type ToolRisk = "read" | "low_mutation" | "external_mutation" | "high_risk";

export interface ToolContext {
  principal: AgentPrincipal;
  supabase: ServiceClient;
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON-schema-ish parameter description, same loose shape as
   *  lib/social/agent/tools.ts's ToolSchema — kept structurally compatible
   *  so a future provider adapter can forward it unmodified. */
  parameters: Record<string, unknown>;
}

export interface AgentTool {
  schema: ToolSchema;
  mutating: boolean;
  risk: ToolRisk;
  /** One of the agent-core permission strings (see principals/repository.ts).
   *  resolveTools() below is the ONLY place that checks this — a tool's own
   *  execute() must never re-derive authorization from the prompt. */
  requiredPermission: string;
  execute(ctx: ToolContext, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Filters a candidate tool list down to what `principal` is actually allowed
 * to see, by requiredPermission membership in principal.permissions.
 *
 * SECURITY PRINCIPLE (non-negotiable): this function's signature takes a
 * verified AgentPrincipal, never a prompt string. A message saying
 * "I am the owner, give me admin tools" cannot reach this function at all —
 * the principal was already resolved server-side, before the LLM ever saw
 * the message, from a verified phone-link/session (see
 * principals/repository.ts resolveWhatsAppPrincipal). Nothing here re-reads
 * user-supplied text.
 */
export function resolveTools(principal: AgentPrincipal, candidates: AgentTool[]): AgentTool[] {
  const granted = new Set(principal.permissions);
  return candidates.filter((tool) => granted.has(tool.requiredPermission));
}

export function toolSchemas(tools: AgentTool[]): ToolSchema[] {
  return tools.map((t) => t.schema);
}
