import type {
  BenchmarkTestCase,
  ExecutionRecord,
} from "./types.ts";

export class StratXcelCurrentProviderRunner {
  private readonly geminiKey: string | undefined;
  private readonly openAiKey: string | undefined;

  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.openAiKey = process.env.OPENAI_API_KEY;
  }

  getPrimaryProvider(): "gemini" | "openai" | "none" {
    if (this.geminiKey) return "gemini";
    if (this.openAiKey) return "openai";
    return "none";
  }

  async runBenchmarkTask(task: BenchmarkTestCase): Promise<ExecutionRecord> {
    const provider = this.getPrimaryProvider();
    if (provider === "gemini") {
      return this.runWithGemini(task);
    } else if (provider === "openai") {
      return this.runWithOpenAI(task);
    } else {
      return {
        testId: task.id,
        testTitle: task.title,
        category: task.category,
        provider: "stratxcel_gemini",
        model: "none",
        success: false,
        latencyMs: 0,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        responseSnippet: "",
        error: "Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured in StratXcel environment",
      };
    }
  }

  private async runWithGemini(task: BenchmarkTestCase): Promise<ExecutionRecord> {
    const model = task.category === "embeddings" ? "gemini-embedding-001" : "gemini-3.6-flash";
    const startedAt = Date.now();

    try {
      if (task.category === "embeddings") {
        const text = typeof task.messages[0]?.content === "string"
          ? task.messages[0].content
          : "test embedding";

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": this.geminiKey!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: { parts: [{ text }] },
            }),
          }
        );

        const latencyMs = Date.now() - startedAt;
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            testId: task.id,
            testTitle: task.title,
            category: task.category,
            provider: "stratxcel_gemini",
            model,
            success: false,
            latencyMs,
            tokens: { promptTokens: 12, completionTokens: 0, totalTokens: 12 },
            responseSnippet: "",
            error: json?.error?.message || `HTTP ${res.status}`,
          };
        }

        const values = json?.embedding?.values || [];
        return {
          testId: task.id,
          testTitle: task.title,
          category: task.category,
          provider: "stratxcel_gemini",
          model,
          success: true,
          latencyMs,
          tokens: { promptTokens: 12, completionTokens: 0, totalTokens: 12 },
          responseSnippet: `[Embedding Vector: ${values.length} dimensions]`,
        };
      }

      // Convert messages to Gemini format
      const systemInstruction = task.messages
        .filter((m) => m.role === "system")
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .join("\n");

      const contents = task.messages
        .filter((m) => m.role !== "system")
        .map((m) => {
          if (typeof m.content === "string") {
            return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
          }
          const parts: Array<Record<string, unknown>> = [];
          for (const item of m.content) {
            if (item.type === "text" && item.text) {
              parts.push({ text: item.text });
            } else if (item.type === "image_url" && item.image_url?.url) {
              const url = item.image_url.url;
              if (url.startsWith("data:")) {
                const match = url.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  parts.push({
                    inlineData: {
                      mimeType: match[1],
                      data: match[2],
                    },
                  });
                }
              }
            }
          }
          return { role: m.role === "assistant" ? "model" : "user", parts };
        });

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
      };

      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      if (task.responseFormat?.type === "json_object" || task.jsonSchema) {
        (body.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
        if (task.jsonSchema) {
          (body.generationConfig as Record<string, unknown>).responseSchema = task.jsonSchema;
        }
      }

      if (task.tools?.length) {
        body.tools = [
          {
            functionDeclarations: task.tools.map((t) => ({
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters,
            })),
          },
        ];
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": this.geminiKey!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const latencyMs = Date.now() - startedAt;
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          testId: task.id,
          testTitle: task.title,
          category: task.category,
          provider: "stratxcel_gemini",
          model,
          success: false,
          latencyMs,
          tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          responseSnippet: "",
          error: json?.error?.message || `HTTP ${res.status}`,
        };
      }

      const candidate = json?.candidates?.[0];
      const part = candidate?.content?.parts?.[0];
      const text = part?.text || "";
      const functionCall = part?.functionCall;

      const usage = json?.usageMetadata || {};
      const promptTokens = usage.promptTokenCount || 0;
      const completionTokens = usage.candidatesTokenCount || 0;
      const totalTokens = usage.totalTokenCount || promptTokens + completionTokens;

      let jsonValidation: ExecutionRecord["jsonValidation"];
      if (task.category === "structured_json") {
        try {
          JSON.parse(text);
          jsonValidation = { attempted: true, valid: true };
        } catch (err) {
          jsonValidation = { attempted: true, valid: false, error: String(err) };
        }
      }

      let toolCallValidation: ExecutionRecord["toolCallValidation"];
      if (task.category === "tool_calling") {
        const called = Boolean(functionCall?.name);
        toolCallValidation = {
          attempted: true,
          called,
          toolName: functionCall?.name,
          validArguments: Boolean(functionCall?.args && typeof functionCall.args === "object"),
        };
      }

      const snippet = functionCall
        ? `[Tool Call: ${functionCall.name}(${JSON.stringify(functionCall.args)})]`
        : text.slice(0, 250);

      return {
        testId: task.id,
        testTitle: task.title,
        category: task.category,
        provider: "stratxcel_gemini",
        model,
        success: true,
        latencyMs,
        tokens: { promptTokens, completionTokens, totalTokens },
        responseSnippet: snippet,
        jsonValidation,
        toolCallValidation,
      };
    } catch (err) {
      return {
        testId: task.id,
        testTitle: task.title,
        category: task.category,
        provider: "stratxcel_gemini",
        model,
        success: false,
        latencyMs: Date.now() - startedAt,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        responseSnippet: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async runWithOpenAI(task: BenchmarkTestCase): Promise<ExecutionRecord> {
    const model = task.category === "embeddings" ? "text-embedding-3-small" : "gpt-4o-mini";
    const startedAt = Date.now();

    try {
      if (task.category === "embeddings") {
        const input = typeof task.messages[0]?.content === "string"
          ? task.messages[0].content
          : "test embedding";

        const res = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.openAiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, input }),
        });

        const latencyMs = Date.now() - startedAt;
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            testId: task.id,
            testTitle: task.title,
            category: task.category,
            provider: "stratxcel_openai",
            model,
            success: false,
            latencyMs,
            tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            responseSnippet: "",
            error: json?.error?.message || `HTTP ${res.status}`,
          };
        }

        const values = json?.data?.[0]?.embedding || [];
        const totalTokens = json?.usage?.total_tokens || 0;
        return {
          testId: task.id,
          testTitle: task.title,
          category: task.category,
          provider: "stratxcel_openai",
          model,
          success: true,
          latencyMs,
          tokens: { promptTokens: totalTokens, completionTokens: 0, totalTokens },
          responseSnippet: `[Embedding Vector: ${values.length} dimensions]`,
        };
      }

      const body: Record<string, unknown> = {
        model,
        messages: task.messages,
        temperature: 0.7,
      };

      if (task.responseFormat) body.response_format = task.responseFormat;
      if (task.tools?.length) body.tools = task.tools;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const latencyMs = Date.now() - startedAt;
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          testId: task.id,
          testTitle: task.title,
          category: task.category,
          provider: "stratxcel_openai",
          model,
          success: false,
          latencyMs,
          tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          responseSnippet: "",
          error: json?.error?.message || `HTTP ${res.status}`,
        };
      }

      const choice = json?.choices?.[0];
      const text = choice?.message?.content || "";
      const toolCalls = choice?.message?.tool_calls;
      const usage = json?.usage || {};

      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || promptTokens + completionTokens;

      let jsonValidation: ExecutionRecord["jsonValidation"];
      if (task.category === "structured_json") {
        try {
          JSON.parse(text);
          jsonValidation = { attempted: true, valid: true };
        } catch (err) {
          jsonValidation = { attempted: true, valid: false, error: String(err) };
        }
      }

      let toolCallValidation: ExecutionRecord["toolCallValidation"];
      if (task.category === "tool_calling") {
        const first = toolCalls?.[0];
        toolCallValidation = {
          attempted: true,
          called: Boolean(first),
          toolName: first?.function?.name,
          validArguments: Boolean(first?.function?.arguments),
        };
      }

      const snippet = toolCalls?.[0]
        ? `[Tool Call: ${toolCalls[0].function.name}(${toolCalls[0].function.arguments})]`
        : text.slice(0, 250);

      return {
        testId: task.id,
        testTitle: task.title,
        category: task.category,
        provider: "stratxcel_openai",
        model,
        success: true,
        latencyMs,
        tokens: { promptTokens, completionTokens, totalTokens },
        responseSnippet: snippet,
        jsonValidation,
        toolCallValidation,
      };
    } catch (err) {
      return {
        testId: task.id,
        testTitle: task.title,
        category: task.category,
        provider: "stratxcel_openai",
        model,
        success: false,
        latencyMs: Date.now() - startedAt,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        responseSnippet: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
