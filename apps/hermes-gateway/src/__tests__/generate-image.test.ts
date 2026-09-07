// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/generate-image.test.ts
//
// Verifies generate_image -- Hermes' first real-spend tool, reusing
// executeGenerateImageTool (lib/social/agent/generate-image-tool.ts)
// unmodified with its real default production dependencies (real tenant
// budget gate included). The native-adapter's own pre-call mission-budget
// check is covered separately and executably in
// packages/hermes/src/__tests__/native-adapter.test.ts; this file covers
// the handler's own real structure and the real Zod schema.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function testSchemaRequiresBriefAndForbidsSmuggledFields() {
  const { TOOL_INPUT_SCHEMAS } = await import("@stratxcel/hermes");
  const schema = TOOL_INPUT_SCHEMAS.generate_image;
  assert.equal(schema.safeParse({}).success, false, "brief is required");
  assert.equal(schema.safeParse({ brief: "" }).success, false, "an empty brief is not valid");
  assert.equal(schema.safeParse({ brief: "a solar panel on a roof" }).success, true);
  assert.equal(schema.safeParse({ brief: "x", aspectRatio: "4:5" }).success, true);
  assert.equal(schema.safeParse({ brief: "x", tenantId: "attacker-supplied" }).success, false, "must reject any model-supplied tenantId");
  console.log("generate-image.test.ts: the real schema requires brief and forbids a smuggled tenantId — PASS");
}

async function testHandlerAttributesToTheRealMissionCreatorOnly() {
  const source = fs.readFileSync(path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"), "utf8").replace(/\r\n/g, "\n");
  const block = source.match(/async generate_image\(ctx, input\) \{[\s\S]*?\n  \},\n\};/)?.[0];
  assert.ok(block, "generate_image handler must exist in tool-handlers.ts");
  assert.match(block!, /from\("missions"\)/, "must look up the real mission row");
  assert.match(block!, /eq\("id", ctx\.missionId\)/, "must look up the exact verified mission, never a model-supplied id");
  assert.match(block!, /created_by/, "must use the mission's real creator for billing/asset attribution");
  assert.match(block!, /mission_has_no_creator_to_attribute_image_generation_to/, "must refuse honestly rather than fabricate an actor when a mission has no creator");
  assert.match(block!, /tenantId: ctx\.tenantId/, "must pass the verified mission tenant, never an input field");
  assert.match(block!, /import\(\s*\n?\s*"\.\.\/\.\.\/\.\.\/lib\/social\/agent\/generate-image-tool\.ts"/, "must reuse the real production generate-image-tool, not a reimplementation");
  // Confirms the real function is called with its DEFAULT deps (no depsOverride
  // argument) -- the real tenant plan/spend resolution and real monthly AI
  // budget gate run exactly as they do for WhatsApp/Admin Copilot, not a
  // test double smuggled into production.
  assert.doesNotMatch(block!, /depsOverride|resolveTenantMonthSpend:|evaluateBudgetGate:/, "must not override any real dependency -- the real tenant budget gate must run unmodified");
  console.log("generate-image.test.ts: the real handler attributes to the mission's real creator and reuses the unmodified production function — PASS");
}

async function run() {
  await testSchemaRequiresBriefAndForbidsSmuggledFields();
  await testHandlerAttributesToTheRealMissionCreatorOnly();
  console.log("generate-image.test.ts (@stratxcel/hermes-gateway): ALL PASS");
}

run();
