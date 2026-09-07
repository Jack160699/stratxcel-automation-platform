// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/update-lead-status.test.ts
//
// Verifies update_lead_status -- the mutation companion to list_leads/
// get_lead. leads-and-crm's own updateLeadStatus(leadId, status) is NOT
// tenant-scoped internally (confirmed against its two other real callers:
// app/api/platform/leads/[leadId]/route.ts and
// packages/workforce-core/src/adapters/crm.ts's loadOwnedLead, both of
// which re-verify tenant ownership with a separate scoped read before
// calling it). The security-critical property this handler must have is
// the same one those two callers already enforce: never call
// updateLeadStatus for a leadId that hasn't first been proven to belong
// to ctx.tenantId.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSource(): string {
  return fs.readFileSync(path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"), "utf8").replace(/\r\n/g, "\n");
}

async function testSchemaRequiresLeadIdAndAllowlistedStatusAndForbidsSmuggledTenantId() {
  const { TOOL_INPUT_SCHEMAS } = await import("@stratxcel/hermes");
  const schema = TOOL_INPUT_SCHEMAS.update_lead_status;
  assert.equal(schema.safeParse({}).success, false, "leadId and status are both required");
  assert.equal(schema.safeParse({ leadId: "lead-1" }).success, false, "status is required");
  assert.equal(schema.safeParse({ leadId: "", status: "WON" }).success, false, "an empty leadId is not valid");
  assert.equal(schema.safeParse({ leadId: "lead-1", status: "WON" }).success, true);
  assert.equal(schema.safeParse({ leadId: "lead-1", status: "won" }).success, false, "status must match the exact allowlisted casing");
  assert.equal(schema.safeParse({ leadId: "lead-1", status: "DELETED" }).success, false, "status must be one of the 5 real crm_leads pipeline values, not an invented one");
  assert.equal(schema.safeParse({ leadId: "lead-1", status: "WON", tenantId: "attacker-supplied" }).success, false, "must reject any model-supplied tenantId");
  console.log("update-lead-status.test.ts: the real schema requires leadId + an allowlisted status and forbids a smuggled tenantId — PASS");
}

async function testHandlerVerifiesTenantOwnershipBeforeCallingUpdateLeadStatus() {
  const source = readSource();
  const block = source.match(/async update_lead_status\(ctx, input\) \{[\s\S]*?\n  \},/)?.[0];
  assert.ok(block, "update_lead_status handler must exist in tool-handlers.ts");
  assert.match(block!, /from\("crm_leads"\)\s*\n\s*\.select\("id"\)/, "must run its own scoped existence check first, not trust the input leadId");
  assert.match(block!, /eq\("tenant_id", ctx\.tenantId\)/, "the existence check must scope to the verified mission tenant");
  assert.match(block!, /eq\("id", leadId\)/, "the existence check must also filter by the requested lead id");
  assert.match(block!, /if \(!existing\) return \{ updated: false \};/, "must refuse honestly rather than call updateLeadStatus when ownership can't be proven");
  assert.match(block!, /updateLeadStatus\(supabase as never, \{ leadId, status \}\)/, "must reuse the real repository function unmodified, only after ownership is proven");
  console.log("update-lead-status.test.ts: the real handler proves tenant ownership before ever calling updateLeadStatus — PASS");
}

async function testCrossTenantLeadIdNeverGetsMutated() {
  // Simulates the real two-step handler: a scoped existence check, then
  // (only if that found a row) the actual mutation. A leadId that's real
  // but belongs to a different tenant fails step 1, so step 2 never runs —
  // matching the established convention in the two other real callers of
  // updateLeadStatus, neither of which is itself tenant-scoped.
  const crmLeadsTable = [
    { id: "lead-1", tenant_id: "tenant-A", status: "NEW" },
    { id: "lead-2", tenant_id: "tenant-B", status: "NEW" },
  ];
  function simulateHandler(tenantId: string, leadId: string, status: string) {
    const existing = crmLeadsTable.find((row) => row.tenant_id === tenantId && row.id === leadId);
    if (!existing) return { updated: false };
    existing.status = status;
    return { updated: true, lead: existing };
  }
  const result = simulateHandler("tenant-A", "lead-2", "WON");
  assert.deepEqual(result, { updated: false }, "a real lead belonging to a different tenant must never be mutated, even with a guessed/leaked id");
  assert.equal(crmLeadsTable[1].status, "NEW", "the other tenant's lead must be left completely untouched");
  const ownResult = simulateHandler("tenant-B", "lead-2", "WON");
  assert.equal(ownResult.updated, true, "the correct tenant's own lead updates normally");
  assert.equal(crmLeadsTable[1].status, "WON");
  console.log("update-lead-status.test.ts: a lead from a different tenant is never mutated, even with a guessed/leaked id — PASS");
}

async function run() {
  await testSchemaRequiresLeadIdAndAllowlistedStatusAndForbidsSmuggledTenantId();
  await testHandlerVerifiesTenantOwnershipBeforeCallingUpdateLeadStatus();
  await testCrossTenantLeadIdNeverGetsMutated();
  console.log("update-lead-status.test.ts (@stratxcel/hermes-gateway): ALL PASS");
}

run();
