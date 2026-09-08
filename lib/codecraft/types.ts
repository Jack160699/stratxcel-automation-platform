/**
 * CodeCraft API Benchmark Types
 * Isolated test types for evaluating CodeCraft API against StratXcel's AI stack.
 */

export interface CodeCraftConfig {
  baseUrl?: string;
  apiKey?: string;
  tokenLimit?: number;
  timeoutMs?: number;
}

export interface CodeCraftMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{
    type: "text" | "image_url";
    text?: string;
    image_url?: { url: string; detail?: "low" | "high" | "auto" };
  }>;
  name?: string;
  tool_call_id?: string;
}

export interface CodeCraftTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface CodeCraftToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface CodeCraftCompletionChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: CodeCraftToolCall[];
  };
  finish_reason: string;
}

export interface CodeCraftUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface CodeCraftChatResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: CodeCraftCompletionChoice[];
  usage?: CodeCraftUsage;
  error?: {
    message: string;
    type?: string;
    code?: string;
  };
}

export interface CodeCraftModelInfo {
  id: string;
  object?: string;
  owned_by?: string;
}

export interface CodeCraftModelsResponse {
  data?: CodeCraftModelInfo[];
  error?: {
    message: string;
    type?: string;
    code?: string;
  };
}

export type BenchmarkCategory =
  | "basic_text"
  | "structured_json"
  | "content_caption"
  | "strategy_reasoning"
  | "tool_calling"
  | "vision_analysis"
  | "embeddings";

export interface BenchmarkTestCase {
  id: string;
  category: BenchmarkCategory;
  title: string;
  description: string;
  messages: CodeCraftMessage[];
  tools?: CodeCraftTool[];
  responseFormat?: { type: "json_object" } | Record<string, unknown>;
  jsonSchema?: Record<string, unknown>;
  preferredModel?: string;
}

export interface ExecutionRecord {
  testId: string;
  testTitle: string;
  category: BenchmarkCategory;
  provider: "codecraft" | "stratxcel_gemini" | "stratxcel_openai";
  model: string;
  success: boolean;
  latencyMs: number;
  tokens: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  responseSnippet: string;
  jsonValidation?: {
    attempted: boolean;
    valid: boolean;
    error?: string;
  };
  toolCallValidation?: {
    attempted: boolean;
    called: boolean;
    toolName?: string;
    validArguments?: boolean;
    error?: string;
  };
  error?: string;
}

export interface BenchmarkSummary {
  timestamp: string;
  branch: string;
  codecraftConnection: {
    configured: boolean;
    reachable: boolean;
    status: number;
    modelsCount: number;
    models: string[];
    error?: string;
  };
  tokenLimit: number;
  totalTokensConsumed: number;
  limitExceeded: boolean;
  records: ExecutionRecord[];
  comparison: {
    codecraft: {
      testsRun: number;
      successCount: number;
      avgLatencyMs: number;
      totalTokens: number;
      successRate: number;
    };
    stratxcelCurrent: {
      provider: string;
      testsRun: number;
      successCount: number;
      avgLatencyMs: number;
      totalTokens: number;
      successRate: number;
    };
  };
}
