/**
 * Social Copilot provider — routes through @stratxcel/ai-runtime while preserving
 * a provider-neutral Social outbound boundary for Google AND OpenAI.
 */

import {
  createTenantAIRuntime,
  GeminiTextProvider,
  OpenAITextProvider,
  resolveModelId,
  resolveTenantMonthSpend,
  resolveTenantPlanTier,
  type AIExecutionResult,
  type AIMessage,
  type PlanTier,
} from "@stratxcel/ai-runtime";
import {
  buildGeminiRequest,
  GEMINI_GENERATE_CONTENT_URL,
  GEMINI_MODEL,
  sanitizeGeminiText,
  type GeminiBoundaryInput,
  type GeminiConversationTurn,
} from "./gemini-boundary.ts";
import {
  assertSocialOutboundSafe,
  buildSocialOutboundBoundary,
  mapCopilotIntentToTaskClass,
} from "./social-outbound-boundary.ts";

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentTurnMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCallRequest[];
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCallRequest[];
}

export interface ProviderSafeContext {
  brandInstructions: string[];
  contentIdeas?: string[];
  draftCaptions?: string[];
  businessInformation?: string[];
  creativeImages?: Array<{ mimeType: string; data: string }>;
  /** Real tenants.id — required for billable AI. */
  tenantId?: string;
  missionId?: string | null;
  sessionId?: string | null;
  /** Copilot intent → task class mapping. */
  copilotIntent?: string;
  /** Optional supabase for usage/budget. */
  supabase?: Parameters<typeof createTenantAIRuntime>[0]["supabase"];
  plan?: PlanTier;
  spentUsdThisMonth?: number;
}

export interface AIProvider {
  readonly name: "gemini" | "openai" | "ai-runtime";
  readonly envKey: "GEMINI_API_KEY" | "OPENAI_API_KEY" | "AI_ROUTER";
  isConfigured(): boolean;
  complete(messages: AgentTurnMessage[], tools: ToolSchema[], context: ProviderSafeContext): Promise<CompletionResult>;
}

export interface EffectiveProviderIdentity {
  provider: string;
  protocol: string;
  model: string;
  configured: boolean;
}

export function resolveEffectiveProviderIdentity(): EffectiveProviderIdentity {
  const gemini = Boolean(process.env.GEMINI_API_KEY);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  if (gemini) {
    return {
      provider: "Google Gemini",
      protocol: "AI Runtime / Gemini Developer API",
      model: resolveModelId("GOOGLE_CHEAP"),
      configured: true,
    };
  }
  if (openai) {
    return {
      provider: "OpenAI",
      protocol: "AI Runtime / Responses API",
      model: resolveModelId("OPENAI_CHEAP_FALLBACK"),
      configured: true,
    };
  }
  return { provider: "Not configured", protocol: "—", model: "—", configured: false };
}

export interface GeminiResponseCandidatePart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}

export function parseGeminiCompletionParts(parts: GeminiResponseCandidatePart[]): CompletionResult {
  let text = "";
  const toolCalls: ToolCallRequest[] = [];
  for (const part of parts) {
    if (typeof part.text === "string") text += part.text;
    if (part.functionCall?.name) {
      toolCalls.push({ id: crypto.randomUUID(), name: part.functionCall.name, arguments: part.functionCall.args ?? {} });
    }
  }
  return { text, toolCalls };
}

class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly envKey = "GEMINI_API_KEY" as const;

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async complete(messages: AgentTurnMessage[], tools: ToolSchema[], context: ProviderSafeContext): Promise<CompletionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const envelope = buildSocialOutboundBoundary({ messages, context });
    assertSocialOutboundSafe(envelope);

    const systemMessage = envelope.messages.find((message) => message.role === "system")?.content;
    const conversation: GeminiConversationTurn[] = envelope.messages
      .filter((message): message is SocialMsg => message.role === "user" || message.role === "assistant" || message.role === "tool")
      .map((message) => ({ role: message.role, content: message.content, toolName: message.toolName }));

    const boundaryInput: GeminiBoundaryInput = {
      userPrompts: [],
      brandInstructions: envelope.context.brandInstructions,
      contentIdeas: envelope.context.contentIdeas,
      draftCaptions: envelope.context.draftCaptions,
      businessInformation: envelope.context.businessInformation,
      conversation,
      systemInstruction: systemMessage,
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
      creativeImages: envelope.context.creativeImages,
    };
    const request = buildGeminiRequest(boundaryInput);
    const model = resolveModelId("GOOGLE_CHEAP");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    console.info("Gemini request", { requestFields: Object.keys(request), status: response.status, model });
    if (!response.ok) throw new Error(`Gemini request failed: HTTP ${response.status}`);

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiResponseCandidatePart[] } }>;
    };
    return parseGeminiCompletionParts(json.candidates?.[0]?.content?.parts ?? []);
  }
}

type SocialMsg = AgentTurnMessage & { role: "user" | "assistant" | "tool" };

class AiRuntimeSocialProvider implements AIProvider {
  readonly name = "ai-runtime" as const;
  readonly envKey = "AI_ROUTER" as const;

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  }

  async complete(messages: AgentTurnMessage[], tools: ToolSchema[], context: ProviderSafeContext): Promise<CompletionResult> {
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      throw new Error("tenant_required_for_billable_ai");
    }

    const envelope = buildSocialOutboundBoundary({ messages, context });
    assertSocialOutboundSafe(envelope);

    // Also construct Gemini boundary request to keep allowlist regression parity for Google path.
    const systemMessage = envelope.messages.find((m) => m.role === "system")?.content;
    const conversation: GeminiConversationTurn[] = envelope.messages
      .filter((m): m is SocialMsg => m.role === "user" || m.role === "assistant" || m.role === "tool")
      .map((m) => ({ role: m.role, content: m.content, toolName: m.toolName }));
    buildGeminiRequest({
      userPrompts: [],
      brandInstructions: envelope.context.brandInstructions,
      contentIdeas: envelope.context.contentIdeas,
      draftCaptions: envelope.context.draftCaptions,
      businessInformation: envelope.context.businessInformation,
      conversation,
      systemInstruction: systemMessage,
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
      creativeImages: envelope.context.creativeImages,
    });

    const runtimeMessages: AIMessage[] = envelope.messages.map((m) => ({
      role: m.role,
      content: m.content,
      toolCallId: m.toolCallId,
      toolName: m.toolName,
      toolCalls: m.toolCalls,
    }));

    let spent = context.spentUsdThisMonth;
    let plan = context.plan ?? ("starter" as PlanTier);
    if (context.supabase) {
      if (spent == null) {
        const resolved = await resolveTenantMonthSpend(context.supabase as never, tenantId);
        if (!resolved.ok) {
          throw new Error(`tenant_month_spend_${resolved.reason}`);
        }
        spent = resolved.spentUsd;
      }
      try {
        plan = await resolveTenantPlanTier(context.supabase as never, tenantId);
      } catch {
        plan = context.plan ?? "starter";
      }
    } else if (spent == null) {
      // Without a ledger client, refuse silent $0 for billable Social AI.
      throw new Error("tenant_month_spend_ledger_unavailable");
    }

    const { runtime, budgetEnvelope } = createTenantAIRuntime({
      tenantId,
      missionId: context.missionId,
      sessionId: context.sessionId,
      plan,
      spentUsdThisMonth: spent ?? 0,
      supabase: context.supabase,
      deps: {
        google: new GeminiTextProvider({ applySocialBoundarySanitize: sanitizeGeminiText }),
        openai: new OpenAITextProvider(),
      },
    });

    const taskClass = mapCopilotIntentToTaskClass(context.copilotIntent ?? "GENERAL_CONVERSATION");
    const result: AIExecutionResult = await runtime.execute({
      tenantId,
      missionId: context.missionId,
      department: "social",
      taskClass,
      messages: runtimeMessages,
      tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
      budgetEnvelope,
      metadata: {
        sessionId: context.sessionId ?? null,
      },
    });

    if (!result.ok) {
      throw new Error(result.userSafeError ?? result.errorDetailSafe ?? "AI processing failed");
    }

    return { text: result.text, toolCalls: result.toolCalls };
  }
}

const LEGACY_DIRECT = process.env.AI_ROUTER_ENABLED === "0";

const PROVIDERS: AIProvider[] = LEGACY_DIRECT
  ? [new GeminiProvider()]
  : [new AiRuntimeSocialProvider(), new GeminiProvider()];

export function listProviders(): AIProvider[] {
  return PROVIDERS;
}

export function resolveConfiguredProvider(): AIProvider | null {
  return PROVIDERS.find((provider) => provider.isConfigured()) ?? null;
}

export { GEMINI_GENERATE_CONTENT_URL, GEMINI_MODEL, mapCopilotIntentToTaskClass };
