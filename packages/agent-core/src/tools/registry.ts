import type { AgentPrincipal } from "../principal.ts";
import { resolveTools, type AgentTool } from "./contract.ts";
import { ADMIN_READ_TOOLS } from "./admin/read-tools.ts";
import { ADMIN_MUTATION_TOOLS } from "./admin/mutation-tools.ts";
import { CLIENT_READ_TOOLS, CLIENT_MUTATION_TOOLS } from "./client/tools.ts";
import { MEMORY_TOOLS } from "../brain/memory/tools.ts";

export interface ResolveToolsOptions {
  /** Additional tools composed in at the app layer for capabilities that live
   *  outside the packages/* workspace (e.g. lib/social/agent delegation —
   *  see docs/architecture/WHATSAPP_AGENT_CHANNEL.md "Social capability
   *  delegation"). Still passed through resolveTools()'s permission filter,
   *  so an extra tool with a requiredPermission the principal lacks is still
   *  excluded. */
  extraTools?: AgentTool[];
}

const ADMIN_CANDIDATE_TOOLS: AgentTool[] = [...ADMIN_READ_TOOLS, ...ADMIN_MUTATION_TOOLS, ...MEMORY_TOOLS];
const CLIENT_CANDIDATE_TOOLS: AgentTool[] = [...CLIENT_READ_TOOLS, ...CLIENT_MUTATION_TOOLS, ...MEMORY_TOOLS];

/** Staff principal must still have real permission evaluation — not every
 *  "staff" row is omnipotent. See STAFF_ROLE_PERMISSIONS in
 *  principals/repository.ts, which varies by platform_staff_users.role. */
export function resolveAdminTools(principal: AgentPrincipal, opts: ResolveToolsOptions = {}): AgentTool[] {
  if (principal.kind !== "staff") return [];
  const candidates = [...ADMIN_CANDIDATE_TOOLS, ...(opts.extraTools ?? [])];
  return resolveTools(principal, candidates);
}

/** Client tools are structurally unreachable for a staff principal — this
 *  function returns [] immediately rather than relying solely on permission
 *  filtering, so "client cannot call admin tool" (and vice versa) holds even
 *  if a permission string were ever accidentally shared between the two
 *  vocabularies. */
export function resolveClientTools(principal: AgentPrincipal, opts: ResolveToolsOptions = {}): AgentTool[] {
  if (principal.kind !== "client") return [];
  const candidates = [...CLIENT_CANDIDATE_TOOLS, ...(opts.extraTools ?? [])];
  return resolveTools(principal, candidates);
}

/**
 * Single dispatch entry point: resolveAgentTools(principal) — NEVER
 * resolveTools(prompt). A prospect/unknown sender never reaches this
 * function at all (see principal.ts: unknown senders don't get an
 * AgentPrincipal in the first place).
 */
export function resolveAgentTools(principal: AgentPrincipal, opts: ResolveToolsOptions = {}): AgentTool[] {
  if (principal.kind === "staff") return resolveAdminTools(principal, opts);
  return resolveClientTools(principal, opts);
}

export { resolveTools, toolSchemas } from "./contract.ts";
export type { AgentTool, ToolContext, ToolRisk, ToolSchema } from "./contract.ts";
