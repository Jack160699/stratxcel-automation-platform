import assert from "node:assert/strict";
import { listProviders, resolveEffectiveProviderIdentity, parseGeminiCompletionParts } from "../agent/provider.ts";
import { GEMINI_GENERATE_CONTENT_URL, GEMINI_MODEL, buildGeminiRequest } from "../agent/gemini-boundary.ts";

function testToolCallParsing() {
  // Text-only response: no toolCalls, exact text preserved.
  const textOnly = parseGeminiCompletionParts([{ text: "Hello " }, { text: "world" }]);
  assert.deepEqual(textOnly, { text: "Hello world", toolCalls: [] });

  // A real functionCall part must produce a usable ToolCallRequest with a
  // synthesized, unique id — this is the actual Blocker B fix: Gemini's
  // function-calling response must stop being discarded.
  const withCall = parseGeminiCompletionParts([{ functionCall: { name: "get_lead_count", args: { since: "today" } } }]);
  assert.equal(withCall.toolCalls.length, 1);
  assert.equal(withCall.toolCalls[0].name, "get_lead_count");
  assert.deepEqual(withCall.toolCalls[0].arguments, { since: "today" });
  assert.equal(typeof withCall.toolCalls[0].id, "string");
  assert.ok(withCall.toolCalls[0].id.length > 0);

  // Missing args must not throw — defaults to {}.
  const noArgs = parseGeminiCompletionParts([{ functionCall: { name: "list_open_handoffs" } }]);
  assert.deepEqual(noArgs.toolCalls[0].arguments, {});

  // Multiple functionCall parts in one response all surface, each with a
  // distinct id (Gemini supports parallel calls in a single turn).
  const parallel = parseGeminiCompletionParts([
    { functionCall: { name: "tool_a", args: {} } },
    { functionCall: { name: "tool_b", args: {} } },
  ]);
  assert.equal(parallel.toolCalls.length, 2);
  assert.notEqual(parallel.toolCalls[0].id, parallel.toolCalls[1].id);

  console.log("provider.test.ts: parseGeminiCompletionParts — ALL PASS (tool-call parsing, Blocker B)");
}

function testRequestIncludesTools() {
  // Tool declarations must actually reach the Gemini request payload — the
  // pre-fix bug was that GeminiProvider.complete() ignored its `tools`
  // argument entirely and always sent none.
  const withTools = buildGeminiRequest({
    userPrompts: [],
    brandInstructions: [],
    contentIdeas: [],
    draftCaptions: [],
    businessInformation: [],
    tools: [{ name: "get_lead_count", description: "Count leads", parameters: { type: "object", properties: {} } }],
  });
  assert.ok(Array.isArray(withTools.tools));
  assert.equal(withTools.tools?.[0].functionDeclarations[0].name, "get_lead_count");

  // No tools supplied -> the request has no `tools` key at all (not even an
  // empty array) — must match the exact shape existing callers rely on.
  const withoutTools = buildGeminiRequest({
    userPrompts: ["hi"],
    brandInstructions: [],
    contentIdeas: [],
    draftCaptions: [],
    businessInformation: [],
  });
  assert.equal("tools" in withoutTools, false);

  console.log("provider.test.ts: buildGeminiRequest tools — ALL PASS");
}

function testConversationAndSystemInstructionRoundTrip() {
  // A full conversation (user -> assistant -> tool result) must map into
  // Gemini's user/model roles with a functionResponse part for the tool
  // turn, and a caller-supplied systemInstruction must override the fixed
  // Social default — required so Agent Core's admin/client system prompts
  // aren't silently replaced.
  const request = buildGeminiRequest({
    userPrompts: [],
    brandInstructions: [],
    contentIdeas: [],
    draftCaptions: [],
    businessInformation: [],
    systemInstruction: "You are the Stratxcel Operations Agent.",
    conversation: [
      { role: "user", content: "How many leads came today?" },
      { role: "assistant", content: "" },
      { role: "tool", content: "3", toolName: "get_lead_count" },
    ],
  });
  assert.equal(request.system_instruction.parts[0].text, "You are the Stratxcel Operations Agent.");
  const roles = request.contents.map((turn) => turn.role);
  assert.deepEqual(roles, ["user", "user"]); // empty assistant turn is dropped (Gemini rejects empty parts)
  const toolTurn = request.contents[1];
  assert.equal(toolTurn.parts[0].functionResponse?.name, "get_lead_count");
  assert.equal(toolTurn.parts[0].functionResponse?.response.content, "3");

  console.log("provider.test.ts: conversation/systemInstruction round-trip — ALL PASS");
}

function run() {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  try {
    assert.equal(GEMINI_MODEL, "gemini-3.1-flash-lite");
    assert.equal(GEMINI_GENERATE_CONTENT_URL, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
    assert.deepEqual(listProviders().map((provider) => provider.name), ["gemini"]);
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = "legacy-key-must-not-configure-provider";
    assert.equal(listProviders()[0].isConfigured(), false);
    assert.equal(resolveEffectiveProviderIdentity().configured, false);
    process.env.GEMINI_API_KEY = "test-only";
    assert.deepEqual(resolveEffectiveProviderIdentity(), { provider: "Google Gemini", protocol: "Gemini Developer API", model: "gemini-3.1-flash-lite", configured: true });
    console.log("provider.test.ts: ALL PASS (fixed Gemini endpoint/model, no legacy fallback)");
  } finally {
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAIKey;
  }
}

testToolCallParsing();
testRequestIncludesTools();
testConversationAndSystemInstructionRoundTrip();
run();
