import { buildUsage, estimateGeminiSearchToolCostUsd } from "../catalog/costs.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";
import { probeGeminiReadiness, ReadinessCache } from "../health/readiness.ts";
import type {
  AIMessage,
  AIReasoningLevel,
  AITextProviderAdapter,
  AIToolCall,
  AIToolSchema,
  FetchLike,
} from "../types.ts";
import { parseGeminiGroundingMetadata } from "./gemini-grounding.ts";

export interface GeminiAdapterOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  readinessCache?: ReadinessCache;
  /** Preserve Social Copilot boundary: when true, strip platform-ish fields from messages. */
  applySocialBoundarySanitize?: (text: string) => string;
}

function thinkingLevelFor(reasoning: AIReasoningLevel): string | undefined {
  switch (reasoning) {
    case "none":
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      return undefined;
  }
}

function mapMessagesToGeminiContents(messages: readonly AIMessage[]): {
  systemInstruction?: string;
  contents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }>;
} {
  let systemInstruction: string | undefined;
  const contents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = [];

  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      systemInstruction = [systemInstruction, message.content].filter(Boolean).join("\n");
      continue;
    }
    if (message.role === "tool") {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.toolName || "unknown_tool",
              response: { content: message.content },
            },
          },
        ],
      });
      continue;
    }
    if (!message.content) continue;
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  }
  return { systemInstruction, contents };
}

export class GeminiTextProvider implements AITextProviderAdapter {
  readonly provider = "google" as const;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly readinessCache: ReadinessCache;
  private readonly sanitize?: (text: string) => string;

  constructor(options: GeminiAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.readinessCache = options.readinessCache ?? new ReadinessCache();
    this.sanitize = options.applySocialBoundarySanitize;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(args: {
    model: string;
    messages: readonly AIMessage[];
    tools?: readonly AIToolSchema[];
    reasoningLevel: AIReasoningLevel;
    structuredOutputSchema?: Record<string, unknown>;
    enableWebSearch?: boolean;
    enableGoogleSearchGrounding?: boolean;
    timeoutMs: number;
    abortSignal?: AbortSignal;
  }) {
    if (!this.apiKey) throw new AIProviderError("NOT_CONFIGURED", "GEMINI_API_KEY not configured");

    const messages = this.sanitize
      ? args.messages.map((m) =>
          m.role === "system" || m.role === "developer"
            ? m
            : { ...m, content: this.sanitize!(m.content) },
        )
      : args.messages;

    const mapped = mapMessagesToGeminiContents(messages);
    const thinking = thinkingLevelFor(args.reasoningLevel);
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: 8192,
      ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
    };
    if (args.structuredOutputSchema) {
      generationConfig.responseFormat = {
        text: {
          mimeType: "application/json",
          schema: args.structuredOutputSchema,
        },
      };
    }
    const body: Record<string, unknown> = {
      contents: mapped.contents,
      generationConfig,
    };
    if (mapped.systemInstruction) {
      body.system_instruction = { parts: [{ text: mapped.systemInstruction }] };
    }

    const tools: Array<Record<string, unknown>> = [];
    if (args.tools?.length) {
      tools.push({
        functionDeclarations: args.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      });
    }
    if (args.enableGoogleSearchGrounding) {
      tools.push({ google_search: {} });
    }
    if (tools.length) body.tools = tools;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    const onAbort = () => controller.abort();
    args.abortSignal?.addEventListener("abort", onAbort);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent`;
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AIProviderError(classifyHttpStatus(response.status), `Gemini HTTP ${response.status}`, response.status);
      }

      const json = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }> };
          finishReason?: string;
          groundingMetadata?: unknown;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          cachedContentTokenCount?: number;
          totalTokenCount?: number;
        };
        responseId?: string;
        promptFeedback?: { blockReason?: string };
      };

      if (json.promptFeedback?.blockReason || json.candidates?.[0]?.finishReason === "SAFETY") {
        throw new AIProviderError("SAFETY_REFUSAL", "Gemini safety refusal");
      }

      const parts = json.candidates?.[0]?.content?.parts ?? [];
      let text = "";
      const toolCalls: AIToolCall[] = [];
      for (const part of parts) {
        if (typeof part.text === "string") text += part.text;
        if (part.functionCall?.name) {
          toolCalls.push({
            id: crypto.randomUUID(),
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
          });
        }
      }

      let structuredOutput: unknown;
      if (args.structuredOutputSchema && text) {
        try {
          structuredOutput = JSON.parse(text);
        } catch {
          structuredOutput = undefined;
        }
      }

      const webEvidence = parseGeminiGroundingMetadata(json.candidates?.[0]?.groundingMetadata);
      const webSearchQueries = webEvidence.searchQueries.length;
      const usage = buildUsage({
        model: args.model,
        inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
        cachedInputTokens: json.usageMetadata?.cachedContentTokenCount ?? 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
        toolUsage:
          webSearchQueries > 0
            ? {
                webSearchQueries,
                estimatedToolCostUsd: estimateGeminiSearchToolCostUsd(webSearchQueries),
                costEstimateKind: "upper_bound",
              }
            : undefined,
      });

      return {
        text,
        structuredOutput,
        toolCalls,
        usage,
        providerRequestId: json.responseId ?? null,
        safetyRefused: false,
        webEvidence,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AIProviderError("TIMEOUT", "Gemini request timeout");
      }
      throw new AIProviderError("TRANSIENT", err instanceof Error ? err.message : "Gemini network failure");
    } finally {
      clearTimeout(timer);
      args.abortSignal?.removeEventListener("abort", onAbort);
    }
  }

  async probeReadiness(model?: string) {
    return probeGeminiReadiness({
      apiKey: this.apiKey,
      model,
      fetchImpl: this.fetchImpl,
      cache: this.readinessCache,
    });
  }
}
