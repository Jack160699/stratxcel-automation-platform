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

/**
 * Canonical mutation-outcome semantics (PHASE "VERIFICATION INTEGRITY" —
 * Master Brain brief, section 1). A tool's raw JSON result can throw a
 * FAILED/PENDING/PARTIAL signal on the floor of a large object the model
 * never reliably reads back correctly — proven live: generate_image
 * returned `outcome: "FAILED"` after a real OpenAI HTTP 429, and the
 * model's own free-text synthesis still said "Done. The requested change
 * was completed." This is never trusted to prompt-engineering alone: see
 * orchestrator.ts's deterministic append of every non-success
 * interpretOutcome() result onto the final reply, unconditionally,
 * regardless of what the model's own text said.
 */
export type ToolOutcomeStatus = "success" | "failed" | "pending" | "partial";
export interface ToolOutcome {
  status: ToolOutcomeStatus;
  /** Short, human-readable, WhatsApp-safe reason — never a raw provider
   *  error string, stack trace, or internal id (formatAgentReply's own
   *  sanitizer runs over this too, but the source should already be clean). */
  detail?: string;
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
  /**
   * Optional, explicit, type-safe outcome classifier for a mutating tool
   * whose execute() can return a non-throwing result that still represents
   * a real failure/pending/partial state (throwing is already handled
   * separately by the orchestrator's catch block — this is for the "HTTP
   * 200 but business failure" case). Omit for a tool where any non-throwing
   * result is inherently success (the current, unchanged default for every
   * existing tool that doesn't implement this) — this is strictly additive,
   * never a behavior change for a tool that doesn't opt in. Return null to
   * decline to classify a specific result (treated as success, same as
   * omitting the function entirely).
   */
  interpretOutcome?(result: unknown): ToolOutcome | null;
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
