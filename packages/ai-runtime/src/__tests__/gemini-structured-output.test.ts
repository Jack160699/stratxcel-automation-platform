// Run with: node --experimental-strip-types packages/ai-runtime/src/__tests__/gemini-structured-output.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GeminiTextProvider,
  OpenAITextProvider,
  sanitizeLogValue,
} from "../index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, "fixtures");
const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
};

function loadJson(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, name), "utf8"));
}

function captureFetch(responseBody: unknown, status = 200) {
  let captured: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const raw = init?.headers;
    if (raw && typeof raw === "object" && !Array.isArray(raw) && !(raw instanceof Headers)) {
      for (const [key, value] of Object.entries(raw as Record<string, string>)) {
        headers[key] = value;
      }
    }
    captured = {
      url: String(url),
      headers,
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    };
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return {
    fetchImpl,
    getCaptured: () => {
      assert.ok(captured, "expected Gemini request to be sent");
      return captured!;
    },
  };
}

async function run() {
  const textResponse = {
    candidates: [{ content: { parts: [{ text: "plain answer" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
    responseId: "basic-1",
  };

  // Normal Gemini request unchanged: no structured-output fields.
  {
    const { fetchImpl, getCaptured } = captureFetch(textResponse);
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hello" }],
      reasoningLevel: "none",
      timeoutMs: 5_000,
    });
    const body = getCaptured().body;
    const generationConfig = body.generationConfig as Record<string, unknown>;
    assert.equal(generationConfig.maxOutputTokens, 8192);
    assert.equal(result.text, "plain answer");
    assert.equal(result.structuredOutput, undefined);
    assert.ok(!("responseMimeType" in generationConfig));
    assert.ok(!("responseJsonSchema" in generationConfig));
    assert.ok(!("responseFormat" in generationConfig));
    assert.ok(!("tools" in body));
  }

  // Thinking request unchanged.
  {
    const { fetchImpl, getCaptured } = captureFetch(textResponse);
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    await provider.complete({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "think" }],
      reasoningLevel: "high",
      timeoutMs: 5_000,
    });
    const generationConfig = getCaptured().body.generationConfig as Record<string, unknown>;
    assert.deepEqual(generationConfig.thinkingConfig, { thinkingLevel: "high" });
    assert.ok(!("responseMimeType" in generationConfig));
    assert.ok(!("responseFormat" in generationConfig));
  }

  // Structured schema uses responseMimeType + responseJsonSchema; old shape absent.
  {
    const jsonText = JSON.stringify({ summary: "ok" });
    const { fetchImpl, getCaptured } = captureFetch({
      candidates: [{ content: { parts: [{ text: jsonText }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4, totalTokenCount: 12 },
      responseId: "structured-1",
    });
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: "summarize" },
      ],
      reasoningLevel: "medium",
      structuredOutputSchema: schema,
      timeoutMs: 5_000,
    });
    const captured = getCaptured();
    const generationConfig = captured.body.generationConfig as Record<string, unknown>;
    assert.equal(generationConfig.responseMimeType, "application/json");
    assert.deepEqual(generationConfig.responseJsonSchema, schema);
    assert.ok(!("responseFormat" in generationConfig));
    assert.deepEqual(generationConfig.thinkingConfig, { thinkingLevel: "medium" });
    assert.equal(generationConfig.maxOutputTokens, 8192);
    assert.deepEqual(captured.body.system_instruction, { parts: [{ text: "Return JSON only." }] });
    assert.deepEqual(result.structuredOutput, { summary: "ok" });
    assert.equal(result.text, jsonText);
  }

  // Malformed JSON fails safely (no throw, no invented object).
  {
    const { fetchImpl } = captureFetch({
      candidates: [{ content: { parts: [{ text: "not-json {" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      responseId: "malformed-1",
    });
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "summarize" }],
      reasoningLevel: "low",
      structuredOutputSchema: schema,
      timeoutMs: 5_000,
    });
    assert.equal(result.text, "not-json {");
    assert.equal(result.structuredOutput, undefined);
  }

  // Grounding + structured output coexist; function tools preserved.
  {
    const grounded = loadJson("gemini-grounded.json") as {
      candidates: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: unknown;
      }>;
      usageMetadata?: Record<string, number>;
      responseId?: string;
    };
    const structuredGrounded = {
      ...grounded,
      candidates: [
        {
          ...grounded.candidates[0],
          content: {
            parts: [{ text: JSON.stringify({ summary: "Spain won Euro 2024" }) }],
          },
        },
      ],
    };
    const { fetchImpl, getCaptured } = captureFetch(structuredGrounded);
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Who won Euro 2024?" }],
      reasoningLevel: "low",
      enableGoogleSearchGrounding: true,
      structuredOutputSchema: schema,
      tools: [
        {
          name: "lookup",
          description: "Lookup a fact",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      ],
      timeoutMs: 5_000,
    });
    const body = getCaptured().body;
    const generationConfig = body.generationConfig as Record<string, unknown>;
    const tools = body.tools as Array<Record<string, unknown>>;
    assert.equal(generationConfig.responseMimeType, "application/json");
    assert.deepEqual(generationConfig.responseJsonSchema, schema);
    assert.ok(!("responseFormat" in generationConfig));
    assert.ok(tools.some((tool) => Boolean(tool.google_search)));
    assert.ok(Array.isArray((tools[0] as { functionDeclarations?: unknown[] }).functionDeclarations));
    assert.deepEqual(result.structuredOutput, { summary: "Spain won Euro 2024" });
    assert.ok((result.webEvidence?.sources.length ?? 0) >= 2);
  }

  // HTTP 200 with empty candidates is not treated as structured success.
  {
    const { fetchImpl } = captureFetch({
      candidates: [],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 0, totalTokenCount: 1 },
      responseId: "empty-1",
    });
    const provider = new GeminiTextProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "summarize" }],
      reasoningLevel: "low",
      structuredOutputSchema: schema,
      timeoutMs: 5_000,
    });
    assert.equal(result.text, "");
    assert.equal(result.structuredOutput, undefined);
  }

  // OpenAI structured-output contract is unchanged (regression safety only).
  {
    let openaiBody: Record<string, unknown> = {};
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      openaiBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          id: "resp-1",
          output_text: JSON.stringify({ summary: "openai" }),
          output: [],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const provider = new OpenAITextProvider({ apiKey: "test-key", fetchImpl });
    const result = await provider.complete({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "summarize" }],
      reasoningLevel: "low",
      structuredOutputSchema: schema,
      timeoutMs: 5_000,
    });
    const text = openaiBody.text as { format?: { type?: string; schema?: unknown } };
    assert.equal(text?.format?.type, "json_schema");
    assert.deepEqual(text?.format?.schema, schema);
    assert.deepEqual(result.structuredOutput, { summary: "openai" });
  }

  // Secrets stay out of log sanitization; request body never includes the key.
  {
    const { fetchImpl, getCaptured } = captureFetch(textResponse);
    const provider = new GeminiTextProvider({ apiKey: "AIzaSyDummyTestKeyValue0123456789AB", fetchImpl });
    await provider.complete({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "hello" }],
      reasoningLevel: "none",
      timeoutMs: 5_000,
    });
    const captured = getCaptured();
    assert.equal(JSON.stringify(captured.body).includes("AIza"), false);
    assert.equal(sanitizeLogValue("key=AIzaSyDummyTestKeyValue0123456789AB").includes("AIzaSy"), false);
    assert.match(sanitizeLogValue("key=AIzaSyDummyTestKeyValue0123456789AB"), /\[REDACTED\]/);
  }

  console.log("gemini-structured-output.test.ts: PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
