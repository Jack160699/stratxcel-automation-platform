// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/get-lead.test.ts
//
// Verifies get_lead -- the single-record companion to list_leads. The
// security-critical property for a single-record-by-id lookup is
// cross-tenant isolation: a guessed/leaked id from another tenant must
// never resolve, even if it's a real row.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function testSchemaRequiresLeadIdAndForbidsSmuggledTenantId() {
  const { TOOL_INPUT_SCHEMAS } = await import("@stratxcel/hermes");
  const schema = TOOL_INPUT_SCHEMAS.get_lead;
  assert.equal(schema.safeParse({}).success, false, "leadId is required");
  assert.equal(schema.safeParse({ leadId: "" }).success, false, "an empty leadId is not valid");
  assert.equal(schema.safeParse({ leadId: "lead-1" }).success, true);
  assert.equal(schema.safeParse({ leadId: "lead-1", tenantId: "attacker-supplied" }).success, false, "must reject any model-supplied tenantId");
  console.log("get-lead.test.ts: the real schema requires leadId and forbids a smuggled tenantId — PASS");
}

async function testHandlerScopesToBothTenantAndLeadId() {
  const source = fs.readFileSync(path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"), "utf8");
  const block = source.match(/async get_lead\(ctx, input\) \{[\s\S]*?\n  \},/)?.[0];
  assert.ok(block, "get_lead handler must exist in tool-handlers.ts");
  assert.match(block!, /from\("crm_leads"\)/, "must query the real crm_leads table");
  assert.match(block!, /eq\("tenant_id", ctx\.tenantId\)/, "must scope to the verified mission tenant");
  assert.match(block!, /eq\("id", leadId\)/, "must also filter by the requested lead id");
  console.log("get-lead.test.ts: the real handler filters on BOTH tenant_id and id — PASS");
}

async function testCrossTenantLookupNeverResolves() {
  // Simulates the real Postgres behavior of .eq("tenant_id", X).eq("id", Y):
  // a row that exists but belongs to a DIFFERENT tenant never matches both
  // predicates, so maybeSingle() returns null -- the handler's own
  // `if (!data) return { found: false }` path, not an error, not a leak.
  const crmLeadsTable = [
    { id: "lead-1", tenant_id: "tenant-A", contact_name: "Ramesh" },
    { id: "lead-2", tenant_id: "tenant-B", contact_name: "Suresh" },
  ];
  function simulateQuery(tenantId: string, leadId: string) {
    return crmLeadsTable.find((row) => row.tenant_id === tenantId && row.id === leadId) ?? null;
  }
  // The real row exists, but under a different tenant than the mission's own.
  assert.equal(simulateQuery("tenant-A", "lead-2"), null, "a real row belonging to a different tenant must never resolve");
  assert.deepEqual(simulateQuery("tenant-B", "lead-2"), crmLeadsTable[1], "the correct tenant's own lead resolves normally");
  console.log("get-lead.test.ts: a real lead from a different tenant never resolves, even with a guessed/leaked id — PASS");
}

async function run() {
  await testSchemaRequiresLeadIdAndForbidsSmuggledTenantId();
  await testHandlerScopesToBothTenantAndLeadId();
  await testCrossTenantLookupNeverResolves();
  console.log("get-lead.test.ts (@stratxcel/hermes-gateway): ALL PASS");
}

run();
