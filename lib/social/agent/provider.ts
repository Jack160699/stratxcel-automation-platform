/**
 * Social Copilot provider — routes through @stratxcel/ai-runtime while preserving
 * the Gemini Platform-data boundary (buildGeminiRequest / sanitizeGeminiText).
 */

import {
  AIRuntime,
  GeminiTextProvider,
  OpenAITextProvider,
  resolveModelId,
  resolveSocialTaskClass,
  type AIExecutionResult,
} from "@stratxcel/ai-runtime";
import {
  buildGeminiRequest,
  GEMINI_GENERATE_CONTENT_URL,
  GEMINI_MODEL,
  sanitizeGeminiText,
  type GeminiBoundaryInput,
  type GeminiConversationTurn,
} from "./gemini-boundary.ts";

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AgentTurnMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
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

/**
 * Direct Gemini path — still uses buildGeminiRequest as the only Social boundary constructor.
 * Used when AI_ROUTER_ENABLED=0 for emergency rollback.
 */
class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly envKey = "GEMINI_API_KEY" as const;

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async complete(messages: AgentTurnMessage[], tools: ToolSchema[], context: ProviderSafeContext): Promise<CompletionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const systemMessage = messages.find((message) => message.role === "system")?.content;
    const conversation: GeminiConversationTurn[] = messages
      .filter((message): message is AgentTurnMessage & { role: "user" | "assistant" | "tool" } => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content, toolName: message.toolName }));

    const boundaryInput: GeminiBoundaryInput = {
      userPrompts: [],
      brandInstructions: context.brandInstructions,
      contentIdeas: context.contentIdeas ?? [],
      draftCaptions: context.draftCaptions ?? [],
      businessInformation: context.businessInformation ?? [],
      conversation,
      systemInstruction: systemMessage,
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
      creativeImages: context.creativeImages,
    };
    const request = buildGeminiRequest(boundaryInput);
    const requestFields = Object.keys(request);
    const model = resolveModelId("GOOGLE_CHEAP");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    console.info("Gemini request", { requestFields, status: response.status, model });
    if (!response.ok) throw new Error(`Gemini request failed: HTTP ${response.status}`);

    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiResponseCandidatePart[] } }>;
    };
    return parseGeminiCompletionParts(json.candidates?.[0]?.content?.parts ?? []);
  }
}

/**
 * Canonical Social path: AI Runtime with Gemini boundary sanitization on Google traffic.
 */
class AiRuntimeSocialProvider implements AIProvider {
  readonly name = "ai-runtime" as const;
  readonly envKey = "AI_ROUTER" as const;

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
  }

  async complete(messages: AgentTurnMessage[], tools: ToolSchema[], context: ProviderSafeContext): Promise<CompletionResult> {
    const safeContext = {
      brandInstructions: context.brandInstructions.map(sanitizeGeminiText),
      contentIdeas: (context.contentIdeas ?? []).map(sanitizeGeminiText),
      draftCaptions: (context.draftCaptions ?? []).map(sanitizeGeminiText),
      businessInformation: (context.businessInformation ?? []).map(sanitizeGeminiText),
      creativeImages: context.creativeImages,
    };

    const systemMessage = messages.find((message) => message.role === "system")?.content;
    const conversation: GeminiConversationTurn[] = messages
      .filter((message): message is AgentTurnMessage & { role: "user" | "assistant" | "tool" } => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content, toolName: message.toolName }));

    const boundaryInput: GeminiBoundaryInput = {
      userPrompts: [],
      brandInstructions: safeContext.brandInstructions,
      contentIdeas: safeContext.contentIdeas,
      draftCaptions: safeContext.draftCaptions,
      businessInformation: safeContext.businessInformation,
      conversation,
      systemInstruction: systemMessage,
      tools: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })),
      creativeImages: safeContext.creativeImages,
    };
    const boundaryRequest = buildGeminiRequest(boundaryInput);
    const systemText = boundaryRequest.system_instruction.parts.map((p) => p.text).join("\n");

    const runtimeMessages = [
      { role: "system" as const, content: systemText },
      ...messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role,
          content: m.content,
          toolCallId: m.toolCallId,
          toolName: m.toolName,
        })),
    ];

    const runtime = new AIRuntime({
      google: new GeminiTextProvider({
        applySocialBoundarySanitize: sanitizeGeminiText,
      }),
      openai: new OpenAITextProvider(),
    });

    const taskClass = resolveSocialTaskClass("operations");
    const result: AIExecutionResult = await runtime.execute({
      tenantId: "social-session",
      department: "social",
      taskClass,
      messages: runtimeMessages,
      tools: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
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

export { GEMINI_GENERATE_CONTENT_URL, GEMINI_MODEL };
