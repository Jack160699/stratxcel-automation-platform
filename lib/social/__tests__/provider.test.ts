import assert from "node:assert/strict";
import { listProviders, resolveEffectiveProviderIdentity, parseGeminiCompletionParts, createAiRuntimeSocialProvider } from "../agent/provider.ts";
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

/**
 * Reproduces, against the REAL AiRuntimeSocialProvider (not a fake), the
 * production bug found in Package Autopilot's preparation loop
 * (package-autopilot.ts's prepareNearTermPackageItems): that caller used to
 * call provider.complete() with only `{ brandInstructions }`, omitting
 * `tenantId` entirely. AiRuntimeSocialProvider.complete() checks
 * `context.tenantId` as the very first thing it does and throws
 * "tenant_required_for_billable_ai" -- so every single autonomous package
 * content-preparation attempt failed before generating anything, for every
 * tenant, on every cron tick, in any deployment where AiRuntimeSocialProvider
 * is the resolved provider (AI_ROUTER_ENABLED !== "0" -- the production
 * default; see provider.ts's PROVIDERS ordering). package-autopilot.ts's own
 * module graph can't be resolved standalone under `node
 * --experimental-strip-types` (see package-autopilot-producer.test.ts's
 * header comment), so this exercises the exact same real class and the exact
 * same context shape directly instead.
 */
async function testAiRuntimeProviderRequiresTenantId() {
  // No network/DB access happens before the tenantId check -- this branch
  // returns synchronously on the very first line of complete(), so no env
  // setup is needed to reproduce the real production failure.
  await assert.rejects(
    () => createAiRuntimeSocialProvider().complete([{ role: "user", content: "hi" }], [], { brandInstructions: [] }),
    /tenant_required_for_billable_ai/,
    "AiRuntimeSocialProvider.complete() must reject a context with no tenantId -- this is exactly what silently broke Package Autopilot's autonomous preparation loop for every tenant"
  );

  // With tenantId present, execution must get PAST that gate -- proven by
  // reaching a different, later failure instead. Supabase env vars are
  // temporarily cleared so createSupabaseServiceClient() fails
  // deterministically and locally (no real outbound network call in what
  // must stay a fast, hermetic unit test).
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await assert.rejects(
      () => createAiRuntimeSocialProvider().complete([{ role: "user", content: "hi" }], [], { brandInstructions: [], tenantId: "tenant-under-test" }),
      /service_metering_writer_unavailable/,
      "with a real tenantId present, complete() must proceed past the tenantId gate (a later, unrelated failure is expected here since Supabase env vars are deliberately unset for this test)"
    );
  } finally {
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedServiceKey;
  }

  console.log("provider.test.ts: AiRuntimeSocialProvider requires tenantId — ALL PASS (Package Autopilot regression)");
}

function run() {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  try {
    assert.equal(GEMINI_MODEL, "gemini-3.5-flash-lite");
    assert.equal(GEMINI_GENERATE_CONTENT_URL, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.ok(listProviders().some((provider) => provider.name === "ai-runtime" || provider.name === "gemini"));
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = "openai-only-configures-via-ai-runtime";
    assert.equal(listProviders()[0].isConfigured(), true);
    assert.equal(resolveEffectiveProviderIdentity().configured, true);
    assert.equal(resolveEffectiveProviderIdentity().provider, "OpenAI");
    process.env.GEMINI_API_KEY = "test-only";
    assert.deepEqual(resolveEffectiveProviderIdentity(), {
      provider: "Google Gemini",
      protocol: "AI Runtime / Gemini Developer API",
      model: "gemini-3.5-flash-lite",
      configured: true,
    });
    console.log("provider.test.ts: ALL PASS (AI runtime wiring, Gemini boundary preserved)");
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
await testAiRuntimeProviderRequiresTenantId();
run();
