import {
  buildGeminiRequest,
  GEMINI_GENERATE_CONTENT_URL,
  GEMINI_MODEL,
  type GeminiBoundaryInput,
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

class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly envKey = "GEMINI_API_KEY" as const;

  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async complete(messages: AgentTurnMessage[], _tools: ToolSchema[], context: ProviderSafeContext): Promise<CompletionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const boundaryInput: GeminiBoundaryInput = {
      userPrompts: messages.filter((message) => message.role === "user").map((message) => message.content),
      brandInstructions: context.brandInstructions,
      contentIdeas: context.contentIdeas ?? [],
      draftCaptions: context.draftCaptions ?? [],
      businessInformation: context.businessInformation ?? [],
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
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return { text, toolCalls: [] };
  }
}

const PROVIDERS: AIProvider[] = [new GeminiProvider()];

export function listProviders(): AIProvider[] {
  return PROVIDERS;
}

export function resolveConfiguredProvider(): AIProvider | null {
  return PROVIDERS.find((provider) => provider.isConfigured()) ?? null;
}
