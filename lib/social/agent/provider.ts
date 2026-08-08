import {
  buildGeminiRequest,
  GEMINI_GENERATE_CONTENT_URL,
  GEMINI_MODEL,
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
}

export interface AIProvider {
  readonly name: "gemini";
  readonly envKey: "GEMINI_API_KEY";
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
  return process.env.GEMINI_API_KEY
    ? { provider: "Google Gemini", protocol: "Gemini Developer API", model: GEMINI_MODEL, configured: true }
    : { provider: "Not configured", protocol: "—", model: "—", configured: false };
}

export interface GeminiResponseCandidatePart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}

/**
 * Pure, network-free parsing of Gemini's response parts into the normalized
 * {text, toolCalls} shape — factored out of GeminiProvider.complete() so
 * this mapping (the actual "Blocker B" fix) is unit-testable without a real
 * HTTP call. Gemini never returns a call id, so one is synthesized per part
 * — it only needs to be unique within this single response, to correlate
 * the pushed tool-result message back to this call within the same round.
 */
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

    // Real multi-round tool calling needs the full ordered history —
    // assistant text and prior tool results — not just the user turns a
    // single-shot caller would send. The system-role message (if any)
    // becomes the request's system_instruction instead of the fixed
    // Social-Copilot default, so callers with their own system prompt
    // (e.g. Agent Core's admin/client prompts) aren't silently overridden.
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
    };
    const request = buildGeminiRequest(boundaryInput);
    const requestFields = Object.keys(request);

    const response = await fetch(GEMINI_GENERATE_CONTENT_URL, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    console.info("Gemini request", { requestFields, status: response.status });
    if (!response.ok) throw new Error(`Gemini request failed: HTTP ${response.status}`);

    const json = await response.json() as {
      candidates?: Array<{ content?: { parts?: GeminiResponseCandidatePart[] } }>;
    };
    return parseGeminiCompletionParts(json.candidates?.[0]?.content?.parts ?? []);
  }
}

const PROVIDERS: AIProvider[] = [new GeminiProvider()];

export function listProviders(): AIProvider[] {
  return PROVIDERS;
}

export function resolveConfiguredProvider(): AIProvider | null {
  return PROVIDERS.find((provider) => provider.isConfigured()) ?? null;
}
