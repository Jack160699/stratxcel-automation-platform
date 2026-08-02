import assert from "node:assert/strict";
import { buildGeminiRequest, requiresLocalMetaHandling, selectGeminiBrandInstructions } from "../agent/gemini-boundary.ts";
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

  for (const prompt of ["Summarize insights", "Compare reach and engagement", "Show connected accounts", "Read comments and messages"]) {
    assert.equal(requiresLocalMetaHandling(prompt), true);
  }
  assert.equal(requiresLocalMetaHandling("Draft a launch caption from our brand voice"), false);
  console.log("gemini-boundary.test.ts: ALL PASS (allowlist, redaction, local Meta routing)");
}

run();
