/**
 * Adapter around the EXISTING configured AI provider (lib/social/agent/provider.ts)
 * so the channel-independent orchestrator in @stratxcel/agent-core never has
 * to import app-side / Social-Autopilot-specific code, and so this task does
 * NOT create a second, unrelated Gemini client (per the build brief: "DO NOT
 * create a second unrelated Gemini client").
 *
 * KNOWN LIMITATION (see @stratxcel/agent-core's provider.ts for the same
 * note): resolveConfiguredProvider()'s concrete GeminiProvider.complete()
 * does not perform a live tool-calling round-trip today — it always returns
 * toolCalls: []. That means, until the underlying provider is upgraded, an
 * agent turn that isn't handled by the deterministic command parser
 * (LINK/WHOAMI/CONFIRM/etc.) will get a text-only reply and will not invoke
 * read/mutation tools via the LLM loop. This is an accurate, not
 * aspirational, description of current behavior — Existing Social Copilot
 * tests are unaffected because this adapter is a new, additive call site and
 * does not modify lib/social/agent/provider.ts.
 */
import { resolveConfiguredProvider } from "../social/agent/provider";
import type { AgentLLMProvider, AgentTurnMessage, ToolSchema } from "@stratxcel/agent-core";

export function createAgentCoreProviderAdapter(): AgentLLMProvider {
  return {
    isConfigured() {
      return resolveConfiguredProvider() !== null;
    },
    async complete(messages: AgentTurnMessage[], tools: ToolSchema[]) {
      const provider = resolveConfiguredProvider();
      if (!provider) return { text: "", toolCalls: [] };

      const socialMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
        toolCallId: m.toolCallId,
        toolName: m.toolName,
      }));

      const result = await provider.complete(socialMessages, tools, { brandInstructions: [] });
      return { text: result.text, toolCalls: result.toolCalls };
    },
  };
}
