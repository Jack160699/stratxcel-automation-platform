// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/company-memory.test.ts
//
// Verifies remember_company_fact / recall_company_memory -- Hermes'
// exposure of the real shared agent_memories table (the same one
// WhatsApp/Admin Copilot's own remember_fact/recall_memory tools use),
// scoped to the mission's verified tenant only, deliberately bypassing
// @stratxcel/agent-core's principal-gated rememberAgentFact (which only
// allows a CLIENT principal to write workspace scope, not a Hermes
// mission's staff-shaped context).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSource(): string {
  return fs.readFileSync(path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"), "utf8").replace(/\r\n/g, "\n");
}

async function testSchemasEnforceRealDbBoundsAndForbidSmuggledTenantId() {
  const { TOOL_INPUT_SCHEMAS } = await import("@stratxcel/hermes");
  const remember = TOOL_INPUT_SCHEMAS.remember_company_fact;
  assert.equal(remember.safeParse({ key: "a", value: "b" }).success, true);
  assert.equal(remember.safeParse({ key: "", value: "b" }).success, false, "an empty key is not valid");
  assert.equal(remember.safeParse({ key: "a".repeat(121), value: "b" }).success, false, "key must be capped at 120 chars, matching the real DB constraint");
  assert.equal(remember.safeParse({ key: "a", value: "b".repeat(1201) }).success, false, "value must be capped at 1200 chars, matching the real DB constraint");
  assert.equal(remember.safeParse({ key: "a", value: "b", tenantId: "attacker-supplied" }).success, false, "must reject any model-supplied tenantId");

  const recall = TOOL_INPUT_SCHEMAS.recall_company_memory;
  assert.equal(recall.safeParse({}).success, true);
  assert.equal(recall.safeParse({ tenantId: "attacker-supplied" }).success, false, "must reject any model-supplied tenantId");
  console.log("company-memory.test.ts: the real schemas enforce the DB's own key/value length bounds and forbid a smuggled tenantId — PASS");
}

async function testSchemaAcceptsRealConfidenceValuesAndRejectsAnInventedOne() {
  const { TOOL_INPUT_SCHEMAS } = await import("@stratxcel/hermes");
  const remember = TOOL_INPUT_SCHEMAS.remember_company_fact;
  assert.equal(remember.safeParse({ key: "a", value: "b", confidence: "VERIFIED" }).success, true);
  assert.equal(remember.safeParse({ key: "a", value: "b" }).success, true, "confidence must be optional -- a mission that genuinely doesn't know yet must still be able to save the fact");
  assert.equal(remember.safeParse({ key: "a", value: "b", confidence: "CONFIRMED" }).success, false, "must reject an invented confidence value not in the real DB CHECK constraint");
  console.log("company-memory.test.ts: the real schema accepts every real confidence value and rejects an invented one — PASS");
}

async function testRememberHandlerScopesToWorkspaceAndVerifiedTenant() {
  const source = readSource();
  const block = source.match(/async remember_company_fact\(ctx, input\) \{[\s\S]*?\n  \},\n\n  async recall_company_memory/)?.[0];
  assert.ok(block, "remember_company_fact handler must exist in tool-handlers.ts");
  assert.match(block!, /assertSafeMemoryValue\(value\)/, "must reuse the real secret-pattern guard, not a reimplementation");
  assert.match(block!, /scope:\s*"workspace"/, "must write workspace scope, matching the real agent_memories CHECK constraint's tenant-scoped case");
  assert.match(block!, /tenant_id:\s*ctx\.tenantId/, "must scope to the verified mission tenant, never an input field");
  assert.match(block!, /source_channel:\s*"hermes"/, "must label the real source_channel honestly as hermes");
  assert.match(block!, /created_by:\s*createdBy/, "must attribute to the real mission creator, not a fabricated user");
  assert.match(block!, /mission_has_no_creator_to_attribute_this_memory_to/, "must refuse honestly rather than fabricate an actor when a mission has no creator");
  console.log("company-memory.test.ts: the real remember_company_fact handler scopes correctly and reuses the real secret guard — PASS");
}

async function testRememberHandlerUpdatesRatherThanDuplicatesAnExistingKey() {
  const source = readSource();
  const block = source.match(/async remember_company_fact\(ctx, input\) \{[\s\S]*?\n  \},\n\n  async recall_company_memory/)?.[0];
  assert.ok(block, "remember_company_fact handler must exist");
  assert.match(block!, /from\("agent_memories"\)\s*\n\s*\.select\("id"\)/, "must check for an existing row with the same key before inserting");
  assert.match(block!, /\.update\(\{ memory_value: value/, "an existing key must be UPDATED in place, never duplicated");
  console.log("company-memory.test.ts: the real handler updates an existing key in place instead of creating a duplicate — PASS");
}

async function testRecallHandlerScopesToWorkspaceAndVerifiedTenantOnly() {
  const source = readSource();
  const block = source.match(/async recall_company_memory\(ctx\) \{[\s\S]*?\n  \},\n\};/)?.[0];
  assert.ok(block, "recall_company_memory handler must exist in tool-handlers.ts");
  assert.match(block!, /from\("agent_memories"\)/, "must query the real agent_memories table");
  assert.match(block!, /eq\("scope", "workspace"\)/, "must only ever read workspace-scoped memory, never personal/agency");
  assert.match(block!, /eq\("tenant_id", ctx\.tenantId\)/, "must scope strictly to the verified mission tenant");
  assert.match(block!, /is\("deleted_at", null\)/, "must exclude soft-deleted memories, matching the real system's own convention");
  console.log("company-memory.test.ts: the real recall_company_memory handler scopes to workspace + the verified tenant, excludes deleted rows — PASS");
}

async function testRememberHandlerDefaultsConfidenceToUnknownAndPersistsAnExplicitValue() {
  const source = readSource();
  const block = source.match(/async remember_company_fact\(ctx, input\) \{[\s\S]*?\n  \},\n\n  async recall_company_memory/)?.[0];
  assert.ok(block, "remember_company_fact handler must exist");
  assert.match(block!, /const confidence = isMemoryConfidence\(input\.confidence\) \? input\.confidence : "UNKNOWN";/, "an invalid/omitted confidence must fall back to UNKNOWN -- never a stronger classification by default (master brief Section 19)");
  assert.match(block!, /memory_key: key,\s*\n\s*memory_value: value,\s*\n\s*confidence,/, "a new memory insert must persist the real, validated confidence value");
  assert.match(block!, /\.update\(\{ memory_value: value, confidence, updated_at:/, "an update to an existing key must also persist the (possibly re-classified) confidence");
  console.log("company-memory.test.ts: the real handler defaults confidence to UNKNOWN and persists an explicit value — PASS");
}

async function testRecallHandlerSelectsConfidenceSoTheModelCanSeeHowSureEachMemoryIs() {
  const source = readSource();
  const block = source.match(/async recall_company_memory\(ctx\) \{[\s\S]*?\n  \},\n\};/)?.[0];
  assert.ok(block, "recall_company_memory handler must exist");
  assert.match(block!, /\.select\("id, memory_key, memory_value, confidence, updated_at"\)/, "recall must select confidence so the model never treats every recalled memory as equally certain");
  console.log("company-memory.test.ts: recall_company_memory selects confidence for every returned memory — PASS");
}

async function run() {
  await testSchemasEnforceRealDbBoundsAndForbidSmuggledTenantId();
  await testSchemaAcceptsRealConfidenceValuesAndRejectsAnInventedOne();
  await testRememberHandlerScopesToWorkspaceAndVerifiedTenant();
  await testRememberHandlerUpdatesRatherThanDuplicatesAnExistingKey();
  await testRememberHandlerDefaultsConfidenceToUnknownAndPersistsAnExplicitValue();
  await testRecallHandlerScopesToWorkspaceAndVerifiedTenantOnly();
  await testRecallHandlerSelectsConfidenceSoTheModelCanSeeHowSureEachMemoryIs();
  console.log("company-memory.test.ts (@stratxcel/hermes-gateway): ALL PASS");
}

run();
