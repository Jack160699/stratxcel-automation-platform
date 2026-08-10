import assert from "node:assert/strict";
import { buildGeminiRequest, classifySocialPromptIntent, requiresLocalMetaHandling, selectGeminiBrandInstructions } from "../agent/gemini-boundary.ts";
import { serializeToolOutput } from "../agent/tool-output.ts";
import type { BrandProfileRow } from "../repositories/brand.ts";

function run() {
  const request = buildGeminiRequest({
    userPrompts: ["Draft a launch caption", "Analyze comments for @customer_page account id 123456789012345 and access_token=secret-value"],
    brandInstructions: ["Use a precise and calm tone"],
    contentIdeas: ["Explain operational clarity"],
    draftCaptions: ["Work with confidence"],
    businessInformation: ["Stratxcel provides consulting"],
    accounts: [{ provider_account_id: "123456789012345", username: "customer_page", permissions: ["pages_read_engagement"] }],
    metrics: [{ reach: 9000, comments: 44 }],
    access_token: "secret-value",
  } as never);
  const serialized = JSON.stringify(request);
  assert.deepEqual(Object.keys(request), ["system_instruction", "contents", "generationConfig"]);
  for (const prohibited of ["123456789012345", "@customer_page", "secret-value", "provider_account_id", "pages_read_engagement", '"reach":9000', '"comments":44']) {
    assert.equal(serialized.includes(prohibited), false, `prohibited value escaped boundary: ${prohibited}`);
  }
  assert.ok(serialized.includes("Draft a launch caption"));
  assert.ok(serialized.includes("[REDACTED PLATFORM DATA]"));
  assert.ok(serialized.includes("[REDACTED SECRET]"));

  const profile: BrandProfileRow = {
    id: "database-row-id-must-not-leave",
    owner_id: "owner-id-must-not-leave",
    identity: { name: "Stratxcel", industry: "Consulting", positioning: "Operational clarity" },
    audiences: [],
    voice: { tone: ["calm"], blocked_phrases: [], forbidden_claims: ["guaranteed results"] },
    visual: { colors: [], priorities: [] },
    goals: [], competitors: [], source_material: [],
    products: [{ name: "Advisory", description: "Business guidance" }],
    content_pillars: [{ name: "Execution" }],
    rules: [{ kind: "terminology", text: "Use plain language" }],
    updated_at: "2026-08-02T00:00:00Z",
  };
  const brand = JSON.stringify(selectGeminiBrandInstructions(profile));
  assert.ok(brand.includes("Operational clarity"));
  assert.equal(brand.includes(profile.id), false);
  assert.equal(brand.includes(profile.owner_id), false);
  assert.equal(brand.includes(profile.updated_at), false);

  for (const prompt of ["Summarize insights", "Compare reach and engagement", "Show connected accounts", "Check connection status", "Read comments and messages", "How many followers do we have?"]) {
    assert.equal(requiresLocalMetaHandling(prompt), true);
  }
  for (const prompt of [
    "Draft a launch caption from our brand voice",
    "Create posts for my connected accounts",
    "Suggest where among my connected accounts to post this",
    "Ye image se post bana do aur jahan sahi lage wahan ke liye alag version bana dena.",
    "Insta LinkedIn Facebook Threads me jo relevant ho uske hisab se content ready karo.",
    "Mere connected social media dekh ke batao ye kaha post karna best rahega, aur har jagah ka caption alag bana dena.",
    "Isko LinkedIn pe thoda professional, Insta pe engaging aur Threads pe short natural bana do.",
    "Create an Instagram performance-themed post",
  ]) {
    assert.equal(requiresLocalMetaHandling(prompt), false, `creative mission must continue: ${prompt}`);
  }
  assert.equal(classifySocialPromptIntent("Instagram performance"), "GENERAL", "a noun mention alone is not an analytics command");
  assert.equal(classifySocialPromptIntent("Analyze Instagram performance"), "LOCAL_PLATFORM_DATA");
  assert.equal(classifySocialPromptIntent("Based on my recent Instagram performance, create a new post"), "MIXED");
  assert.equal(
    classifySocialPromptIntent("Ye image dekh ke mere brand ke liye post prepare karo aur connected accounts me jahan relevant lage alag post bana do"),
    "CREATIVE",
    "looking at an image and recommending connected destinations is not account analytics",
  );

  const accountProjection = serializeToolOutput([{
    id: "local-db-id",
    platform: "instagram",
    provider_account_id: "provider-123",
    username: "private_handle",
    permissions: ["pages_read_engagement"],
    status: "CONNECTED",
    token_health: "HEALTHY",
    metadata: { provider: "secret" },
    access_token: "token-secret",
  }], 8000, "inspect_accounts");
  assert.match(accountProjection, /connected_platforms/);
  assert.match(accountProjection, /instagram/);
  for (const prohibited of ["local-db-id", "provider-123", "private_handle", "permissions", "pages_read_engagement", "token-secret", "token_health", "metadata"]) {
    assert.equal(accountProjection.includes(prohibited), false, `account projection leaked ${prohibited}`);
  }
  const metricsProjection = serializeToolOutput({ metrics: [{ reach: 9000, comments: 44 }], costs: [{ id: "cost-id" }] }, 8000, "get_performance");
  assert.equal(metricsProjection.includes("9000"), false);
  assert.equal(metricsProjection.includes("comments"), false);
  console.log("gemini-boundary.test.ts: ALL PASS (allowlist, redaction, intent routing, tool projections)");
}

run();
