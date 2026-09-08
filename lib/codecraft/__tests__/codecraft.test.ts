import assert from "node:assert/strict";
import { test } from "node:test";
import { CodeCraftClient } from "../client.ts";
import { STRATXCEL_BENCHMARK_WORKLOADS } from "../workloads.ts";

test("CodeCraftClient initializes with defaults and config overrides", () => {
  const defaultClient = new CodeCraftClient();
  assert.equal(defaultClient.baseUrl, "https://codecraftapi.com/v1");
  assert.equal(defaultClient.tokenLimit, 100000);

  const customClient = new CodeCraftClient({
    baseUrl: "https://codecraftapi.com/v1/",
    apiKey: "test_key_abc123",
    tokenLimit: 50000,
  });
  assert.equal(customClient.baseUrl, "https://codecraftapi.com/v1");
  assert.equal(customClient.tokenLimit, 50000);
  assert.equal(customClient.isConfigured(), true);
  assert.equal(customClient.getCumulativeTokens(), 0);
  assert.equal(customClient.hasExceededTokenLimit(), false);
});

test("CodeCraftClient never prints or exposes full API key", () => {
  const client = new CodeCraftClient({ apiKey: "sk_live_1234567890abcdef" });
  const masked = client.getMaskedAuthHeader();
  assert.equal(masked.includes("1234567890"), false);
  assert.match(masked, /^Bearer sk_\.\.\.def$/);
});

test("CodeCraftClient enforces safety token cap and aborts further requests", async () => {
  const client = new CodeCraftClient({
    apiKey: "test_key",
    tokenLimit: 500, // Small limit for testing
  });

  assert.equal(client.hasExceededTokenLimit(), false);

  // Manually increment cumulative tokens beyond limit
  // @ts-expect-error accessing private field for testing
  client.cumulativeTokens = 550;

  assert.equal(client.hasExceededTokenLimit(), true);

  const res = await client.chatCompletion({
    model: "test-model",
    messages: [{ role: "user", content: "test" }],
  });

  assert.equal(res.ok, false);
  assert.match(res.error || "", /CODECRAFT_TOKEN_LIMIT_EXCEEDED/);
});

test("CodeCraftClient gracefully reports unconfigured state when API key is missing", async () => {
  const client = new CodeCraftClient({ apiKey: "" });
  assert.equal(client.isConfigured(), false);

  const res = await client.chatCompletion({
    model: "test-model",
    messages: [{ role: "user", content: "test" }],
  });

  assert.equal(res.ok, false);
  assert.match(res.error || "", /CODECRAFT_API_KEY not configured/);
});

test("Benchmark workloads cover all 7 required StratXcel task classes", () => {
  const categories = STRATXCEL_BENCHMARK_WORKLOADS.map((w) => w.category);
  const expectedCategories = [
    "basic_text",
    "structured_json",
    "content_caption",
    "strategy_reasoning",
    "tool_calling",
    "vision_analysis",
    "embeddings",
  ];

  for (const exp of expectedCategories) {
    assert.ok(
      categories.includes(exp as any),
      `Expected workload category '${exp}' to be present in benchmark catalog`
    );
  }

  // Verify task 2 has valid json schema
  const jsonTask = STRATXCEL_BENCHMARK_WORKLOADS.find((w) => w.category === "structured_json");
  assert.ok(jsonTask?.jsonSchema);
  assert.ok(jsonTask?.jsonSchema?.required);

  // Verify task 5 has valid tool definition
  const toolTask = STRATXCEL_BENCHMARK_WORKLOADS.find((w) => w.category === "tool_calling");
  assert.ok(toolTask?.tools && toolTask.tools.length > 0);
  assert.equal(toolTask.tools[0]?.function?.name, "query_client_metrics");
});

test("CodeCraft client probeConnection returns valid probe result", async () => {
  const client = new CodeCraftClient({ timeoutMs: 15000 });
  const probe = await client.probeConnection();
  assert.equal(typeof probe.reachable, "boolean");
  assert.equal(typeof probe.status, "number");
  assert.ok(probe.status >= 0, "Expected non-negative HTTP status code");
  if (probe.reachable) {
    assert.ok(probe.status >= 200 && probe.status <= 599, "Expected standard HTTP status code when reachable");
  }
});
