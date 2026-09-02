/**
 * Real dispatch surface for the Agent Factory: a deterministic,
 * LLM-independent prefix parser ("AGENT:<key>: <message>") that routes a
 * turn to a dynamically-defined agent's narrower tool set instead of the
 * full default. Deliberately kept separate from
 * packages/agent-core/src/command-parser.ts (RESET/CONFIRM/CANCEL/LINK/
 * WHOAMI/HELP) -- that file's own header comment is explicit its patterns
 * are terminal, fully-handled-here commands; this is a routing prefix that
 * hands off to a NORMAL agent turn with a restricted tool allowlist, a
 * different shape that doesn't belong in that file's return type or its
 * hardened, already-passing test surface. Applied AFTER parseCommand has
 * already ruled out RESET/CONFIRM/CANCEL at each real call site (the
 * WhatsApp route, lib/agent-core/copilot-actions.ts).
 *
 * The prefix parser itself (parseAgentDispatchPrefix) lives in
 * agent-dispatch-parser.ts, a dependency-free sibling file, for the same
 * standalone-testability reason as this session's other pure/impure splits
 * (e.g. growth-analysis-outcome.ts) -- it's re-exported here so callers of
 * this module don't need to know about the split.
 */
import { getAgentDefinition, type AgentDefinitionRow } from "./agent-definitions";
import { parseAgentDispatchPrefix } from "./agent-dispatch-parser";

export { parseAgentDispatchPrefix, type ParsedAgentDispatchPrefix } from "./agent-dispatch-parser";

export interface AgentDispatchResolution {
  /** The text to actually send into runAgentTurn -- the original text,
   *  unmodified, unless a real dispatch prefix was recognized and stripped. */
  userText: string;
  /** Non-null only when a real, active agent_definitions row was resolved. */
  agentDefinitionKey: string | null;
  toolNameAllowlist: string[] | null;
  /** Non-null when a dispatch prefix was recognized but the named agent
   *  doesn't exist or is disabled -- the caller should return this as a
   *  deterministic reply and skip the agent turn entirely, the same way it
   *  already handles a malformed RESET/CONFIRM/CANCEL. */
  dispatchError: string | null;
}

export async function resolveAgentDispatch(supabase: unknown, rawText: string): Promise<AgentDispatchResolution> {
  const parsedPrefix = parseAgentDispatchPrefix(rawText);
  if (!parsedPrefix) {
    return { userText: rawText, agentDefinitionKey: null, toolNameAllowlist: null, dispatchError: null };
  }
  let definition: AgentDefinitionRow | null;
  try {
    definition = await getAgentDefinition(supabase, parsedPrefix.key);
  } catch {
    return { userText: rawText, agentDefinitionKey: null, toolNameAllowlist: null, dispatchError: `Could not look up agent "${parsedPrefix.key}" right now.` };
  }
  if (!definition || definition.status !== "active") {
    return { userText: rawText, agentDefinitionKey: null, toolNameAllowlist: null, dispatchError: `No active agent named "${parsedPrefix.key}". Use "list agents" to see what's available.` };
  }
  return { userText: parsedPrefix.remainder, agentDefinitionKey: definition.key, toolNameAllowlist: definition.allowed_tool_names, dispatchError: null };
}
