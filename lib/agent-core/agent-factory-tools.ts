/**
 * Agent Factory: real, governed creation and listing of dynamically-scoped
 * agent definitions (agent_definitions table). This is the "instantiate a
 * new agent with a governed permission/skill/connection scope" piece the
 * master brief called for, built for real rather than faked -- see
 * capability:agent_factory_dynamic_composition's original NOT_BUILT finding
 * (2026-09-02) for the architecture gap this closes: a persisted
 * agent-definition record (this table), a dynamic tool-resolver
 * (packages/agent-core/src/tools/registry.ts's toolNameAllowlist, additive
 * and zero-behavior-change for every existing caller), a governed creation
 * flow (this file, below), and a real dispatch surface
 * (lib/agent-core/agent-dispatch.ts's "AGENT:<key>: <message>" prefix,
 * wired into both WhatsApp and Admin/Client Web Copilot).
 *
 * The one real security property this tool enforces, not just documents:
 * create_agent_definition can NEVER grant a new agent a tool the CREATING
 * principal doesn't itself already have. It computes the creator's own
 * real, permission-filtered tool set via resolveAgentTools(ctx.principal,
 * { extraTools: ALL_EXTRA_TOOLS }) -- the exact same resolution every real
 * agent turn uses -- and rejects any requested tool name outside that set,
 * by name, before ever writing a row. This is real subset enforcement, not
 * a comment promising it.
 *
 * Deliberately narrower than this session's usual permission convention
 * (platform_owner AND platform_admin get nearly everything else
 * identically): creating an agent definition defines OTHER agents'
 * governed scope, a meta-governance action, so agent:mutate:agent_definitions
 * is granted to platform_owner only in v1. Listing (agent:read:agent_definitions)
 * is granted to both, matching the read/mutate asymmetry already used for
 * audit reports.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { resolveAgentTools } from "@stratxcel/agent-core";
import { createAgentDefinition, getAgentDefinition, listAgentDefinitions } from "./agent-definitions";
import { ALL_EXTRA_TOOLS } from "./all-tools";

const KEY_SHAPE = /^[a-z0-9_-]{2,40}$/;

export const CREATE_AGENT_DEFINITION_TOOL: AgentTool = {
  schema: {
    name: "create_agent_definition",
    description:
      "Creates a real, governed, dynamically-dispatchable agent with a NARROWER tool scope than the default agent -- e.g. a 'growth_specialist' agent that can only use growth/SEO tools, for a teammate who should never see finance or CRM mutation tools. The requested tools must already be tools YOU (the creator) currently have -- this can only narrow scope, never grant more than you already hold. Once created, dispatch a turn to it from WhatsApp or Admin Copilot with 'AGENT:<key>: <message>'. Use only when a human has actually asked for a new scoped agent, not speculatively -- this is a real, persistent governance record.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "A short, unique, lowercase identifier, e.g. 'growth_specialist' (letters/digits/underscore/hyphen only, 2-40 chars). Used for dispatch: AGENT:<key>: <message>." },
        name: { type: "string", description: "A short human-readable name, e.g. 'Growth Specialist'." },
        description: { type: "string", description: "What this agent is for and who should use it." },
        department: { type: "string", description: "Optional department label, e.g. 'Growth', 'Sales'." },
        toolNames: {
          type: "array",
          items: { type: "string" },
          description: "The exact tool names (e.g. 'check_growth_status', 'run_growth_analysis') this agent may use. Must already be tools the creating principal currently has access to -- never invent a tool name.",
        },
      },
      required: ["key", "name", "description", "toolNames"],
    },
  },
  mutating: true,
  risk: "low_mutation",
  requiredPermission: "agent:mutate:agent_definitions",
  async execute(ctx, args) {
    const key = typeof args.key === "string" ? args.key.trim().toLowerCase() : "";
    const name = typeof args.name === "string" ? args.name.trim() : "";
    const description = typeof args.description === "string" ? args.description.trim() : "";
    const department = typeof args.department === "string" && args.department.trim() ? args.department.trim() : null;
    const toolNames = Array.isArray(args.toolNames)
      ? [...new Set(args.toolNames.filter((n): n is string => typeof n === "string" && n.trim().length > 0).map((n) => n.trim()))]
      : [];

    if (!key || !KEY_SHAPE.test(key)) return { outcome: "FAILED", reason: "invalid_key" };
    if (!name || !description) return { outcome: "FAILED", reason: "missing_name_or_description" };
    if (toolNames.length === 0) return { outcome: "FAILED", reason: "no_tools_requested" };

    let existing;
    try {
      existing = await getAgentDefinition(ctx.supabase, key);
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "lookup_failed" };
    }
    if (existing) return { outcome: "FAILED", reason: "key_already_exists" };

    // Real subset enforcement: the creator's own full, permission-filtered
    // tool set, computed the exact same way a real agent turn would.
    const creatorTools = resolveAgentTools(ctx.principal, { extraTools: ALL_EXTRA_TOOLS });
    const creatorToolNames = new Set(creatorTools.map((t) => t.schema.name));
    const disallowed = toolNames.filter((n) => !creatorToolNames.has(n));
    if (disallowed.length > 0) {
      return { outcome: "FAILED", reason: "tools_not_held_by_creator", disallowed };
    }

    try {
      const row = await createAgentDefinition(ctx.supabase, {
        key,
        name,
        description,
        department,
        allowedToolNames: toolNames,
        createdBy: ctx.principal.authUserId,
        createdByPrincipalKind: ctx.principal.kind,
      });
      return { outcome: "CREATED", key: row.key, name: row.name, allowedToolNames: row.allowed_tool_names, dispatchHint: `AGENT:${row.key}: <your message>` };
    } catch (err) {
      return { outcome: "FAILED", reason: err instanceof Error ? err.message : "create_failed" };
    }
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "CREATED") return null;
    return { status: "failed", detail: r?.reason };
  },
};

export const LIST_AGENT_DEFINITIONS_TOOL: AgentTool = {
  schema: {
    name: "list_agent_definitions",
    description: "Lists every real, governed agent definition created via create_agent_definition -- key, name, department, status, and which tools each one can use. Use for 'what agents exist', 'list our custom agents'.",
    parameters: { type: "object", properties: {} },
  },
  mutating: false,
  risk: "read",
  requiredPermission: "agent:read:agent_definitions",
  async execute(ctx) {
    const rows = await listAgentDefinitions(ctx.supabase);
    return {
      agents: rows.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        department: r.department,
        status: r.status,
        allowedToolNames: r.allowed_tool_names,
        createdAt: r.created_at,
      })),
    };
  },
};

export const AGENT_FACTORY_TOOLS: AgentTool[] = [CREATE_AGENT_DEFINITION_TOOL, LIST_AGENT_DEFINITIONS_TOOL];
