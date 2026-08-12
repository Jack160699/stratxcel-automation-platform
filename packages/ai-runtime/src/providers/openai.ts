import { buildUsage } from "../catalog/costs.ts";
import { AIProviderError, classifyHttpStatus } from "../errors.ts";
import { probeOpenAIReadiness, ReadinessCache } from "../health/readiness.ts";
import type {
  AIMessage,
  AIReasoningLevel,
  AITextProviderAdapter,
  AIToolCall,
  AIToolSchema,
  FetchLike,
} from "../types.ts";

export interface OpenAIAdapterOptions {
  apiKey?: string;
  fetchImpl?: FetchLike;
  readinessCache?: ReadinessCache;
}

function mapReasoningEffort(level: AIReasoningLevel): string | undefined {
  switch (level) {
    case "none":
      return undefined;
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      return "low";
  }
}

/**
 * Build Responses API input with correct function_call ↔ function_call_output linkage.
 * When an assistant turn carries toolCalls, emit function_call items before later tool results.
 */
export function toResponsesInput(messages: readonly AIMessage[]): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;

    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: message.toolCallId ?? "unknown",
        output: message.content,
      });
      continue;
    }

    if (message.role === "assistant") {
      // Prefer explicit function_call replay when toolCalls are attached to the assistant message.
      const toolCalls = (message as AIMessage & { toolCalls?: AIToolCall[] }).toolCalls;
      if (toolCalls?.length) {
        if (message.content) {
          input.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: message.content }],
          });
        }
        for (const call of toolCalls) {
          input.push({
            type: "function_call",
            call_id: call.id,
            name: call.name,
            arguments: JSON.stringify(call.arguments ?? {}),
          });
        }
        continue;
      }
      // Infer function_call from immediately following tool messages if assistant has empty content
      // and subsequent tools exist — used when history stores tool results without attached toolCalls.
      const followingTools: AIMessage[] = [];
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j]!.role === "tool") followingTools.push(messages[j]!);
        else break;
      }
      if (followingTools.length && !message.content) {
        for (const tool of followingTools) {
          input.push({
            type: "function_call",
            call_id: tool.toolCallId ?? "unknown",
            name: tool.toolName ?? "unknown_tool",
            arguments: "{}",
          });
        }
        continue;
      }
      if (message.content) {
        input.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: message.content }],
        });
      }
      continue;
    }

    const role =
      message.role === "developer" ? "developer" : message.role === "system" ? "system" : "user";
    input.push({
      type: "message",
      role,
      content: [{ type: "input_text", text: message.content }],
    });
  }

  return input;
}

/** Prefer message output parts; avoid duplicating top-level output_text. */
export function extractOpenAIResponseText(json: {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}): string {
  let fromParts = "";
  for (const item of json.output ?? []) {
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) fromParts += part.text;
      }
    }
  }
  if (fromParts) return fromParts;
  return json.output_text ?? "";
}

export class OpenAITextProvider implements AITextProviderAdapter {
  readonly provider = "openai" as const;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly readinessCache: ReadinessCache;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.readinessCache = options.readinessCache ?? new ReadinessCache();
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
    if (!this.apiKey) throw new AIProviderError("NOT_CONFIGURED", "OPENAI_API_KEY not configured");

    const tools: Array<Record<string, unknown>> = [];
    if (args.tools?.length) {
      for (const tool of args.tools) {
        tools.push({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        });
      }
    }
    if (args.enableWebSearch) {
      tools.push({ type: "web_search" });
    }

    const body: Record<string, unknown> = {
      model: args.model,
      input: toResponsesInput(args.messages),
      ...(tools.length ? { tools } : {}),
      ...(args.structuredOutputSchema
        ? {
            text: {
              format: {
                type: "json_schema",
                name: "structured_output",
                schema: args.structuredOutputSchema,
                strict: false,
              },
            },
          }
        : {}),
    };

    const effort = mapReasoningEffort(args.reasoningLevel);
    if (effort) body.reasoning = { effort };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    const onAbort = () => controller.abort();
    args.abortSignal?.addEventListener("abort", onAbort);

    try {
      const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AIProviderError(classifyHttpStatus(response.status), `OpenAI HTTP ${response.status}`, response.status);
      }

      const json = (await response.json()) as {
        id?: string;
        output_text?: string;
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
          name?: string;
          arguments?: string;
          call_id?: string;
          status?: string;
        }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
        };
        error?: { code?: string; message?: string };
        incomplete_details?: { reason?: string };
      };

      if (json.error?.code === "content_filter" || json.incomplete_details?.reason === "content_filter") {
        throw new AIProviderError("SAFETY_REFUSAL", "OpenAI safety refusal");
      }

      const text = extractOpenAIResponseText(json);
      const toolCalls: AIToolCall[] = [];
      for (const item of json.output ?? []) {
        if (item.type === "function_call" && item.name) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = item.arguments ? (JSON.parse(item.arguments) as Record<string, unknown>) : {};
          } catch {
            parsed = {};
          }
          toolCalls.push({
            id: item.call_id ?? crypto.randomUUID(),
            name: item.name,
            arguments: parsed,
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

      const usage = buildUsage({
        model: args.model,
        inputTokens: json.usage?.input_tokens ?? 0,
        cachedInputTokens: json.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      });

      return {
        text,
        structuredOutput,
        toolCalls,
        usage,
        providerRequestId: json.id ?? null,
        safetyRefused: false,
      };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AIProviderError("TIMEOUT", "OpenAI request timeout");
      }
      throw new AIProviderError("TRANSIENT", err instanceof Error ? err.message : "OpenAI network failure");
    } finally {
      clearTimeout(timer);
      args.abortSignal?.removeEventListener("abort", onAbort);
    }
  }

  async probeReadiness(model?: string) {
    return probeOpenAIReadiness({
      apiKey: this.apiKey,
      model,
      fetchImpl: this.fetchImpl,
      cache: this.readinessCache,
    });
  }
}
