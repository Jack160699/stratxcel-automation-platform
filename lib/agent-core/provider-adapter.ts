/**
 * Adapter around the EXISTING configured AI provider (lib/social/agent/provider.ts)
 * so the channel-independent orchestrator in @stratxcel/agent-core never has
 * to import app-side / Social-Autopilot-specific code, and so this task does
 * NOT create a second, unrelated Gemini client (per the build brief: "DO NOT
 * create a second unrelated Gemini client").
 *
 * The concrete Gemini provider performs live function calling; this adapter
 * preserves the ordered conversation and normalized tool calls without
 * creating another provider client.
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
