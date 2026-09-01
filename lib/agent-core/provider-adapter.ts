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

/**
 * The configured AI-runtime provider path (AiRuntimeSocialProvider) requires
 * a real tenantId on every call for plan-tier/metering resolution — it has
 * no concept of an unbilled/platform-staff turn, and throws
 * "tenant_required_for_billable_ai" without one. A client principal always
 * carries a real tenantId (see @stratxcel/agent-core's principal model); a
 * staff principal deliberately does not (platform staff aren't scoped to
 * one tenant). Without this fallback, every non-deterministic staff/admin
 * turn — WhatsApp Boss/staff channel and admin_web Copilot alike — throws
 * on the first LLM call and falls back to "Stratxcel Agent is temporarily
 * unavailable", 100% of the time, regardless of how correct the rest of the
 * pipeline is. Found live via the WhatsApp Boss acceptance test; see
 * docs/discovery/WHATSAPP_AI_AGENCY_GAP_AUDIT.md Update 2. For a staff turn,
 * attribute usage to the canonical Stratxcel platform tenant instead of
 * inventing a customer tenant or leaving the turn permanently broken.
 */
function resolveBillingTenantId(tenantId: string | null): string | undefined {
  if (tenantId) return tenantId;
  return process.env.STRATXCEL_PLATFORM_TENANT_ID || undefined;
}

export function createAgentCoreProviderAdapter(tenantId: string | null): AgentLLMProvider {
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

      const result = await provider.complete(socialMessages, tools, {
        brandInstructions: [],
        tenantId: resolveBillingTenantId(tenantId),
      });
      return { text: result.text, toolCalls: result.toolCalls };
    },
  };
}
