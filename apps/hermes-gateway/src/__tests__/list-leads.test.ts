// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/list-leads.test.ts
//
// Verifies the real integration this pass added: Hermes missions can now
// read the real CRM (crm_leads), previously completely unreachable except
// as a write target (create_crm_lead). Exercises the real listLeads
// function (@stratxcel/leads-and-crm), and the real handler source, not a
// reimplementation.
import assert from "node:assert/strict";
import { listLeads } from "@stratxcel/leads-and-crm";
import fs from "node:fs";
import path from "node:path";

interface SeenQuery {
  table: string;
  tenantId?: string;
  limit?: number;
}

function fakeSupabase(rows: unknown[]) {
  const seenQueries: SeenQuery[] = [];
  return {
    seenQueries,
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_col: string, tenantId: string) {
              return {
                order(_col: string, _opts: { ascending: boolean }) {
                  return {
                    limit: async (limit: number) => {
                      seenQueries.push({ table, tenantId, limit });
                      return { data: rows, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function testListLeadsScopesToTenantAndAppliesLimit() {
  const db = fakeSupabase([{ id: "lead-1", contact_name: "Ramesh" }]);
  const leads = await listLeads(db as never, "tenant-real-1", 5);
  assert.deepEqual(db.seenQueries, [{ table: "crm_leads", tenantId: "tenant-real-1", limit: 5 }]);
  assert.equal(leads.length, 1);
  console.log("list-leads.test.ts: the real listLeads scopes to the exact tenantId and applies the given limit — PASS");
}

async function testHandlerClampsLimitAndUsesVerifiedTenantOnly() {
  const source = fs.readFileSync(path.join(process.cwd(), "apps", "hermes-gateway", "src", "tool-handlers.ts"), "utf8");
  const block = source.match(/async list_leads\(ctx, input\) \{[\s\S]*?\n  \},/)?.[0];
  assert.ok(block, "list_leads handler must exist in tool-handlers.ts");
  assert.match(block!, /Math\.min\(input\.limit, 50\)/, "must clamp a model-supplied limit to 50, never trust it unbounded");
  assert.match(block!, /listLeads\(supabase[^,]*, ctx\.tenantId, limit\)/, "must pass the verified mission tenant, never an input field, to the real listLeads function");
  console.log("list-leads.test.ts: the real handler clamps limit and scopes strictly to ctx.tenantId — PASS");
}

async function testSchemaRejectsOversizedOrSmuggledFields() {
  const { TOOL_INPUT_SCHEMAS } = await import("@stratxcel/hermes");
  const schema = TOOL_INPUT_SCHEMAS.list_leads;
  assert.equal(schema.safeParse({}).success, true);
  assert.equal(schema.safeParse({ limit: 20 }).success, true);
  assert.equal(schema.safeParse({ limit: 0 }).success, false, "limit must be at least 1");
  assert.equal(schema.safeParse({ limit: 51 }).success, false, "limit must be capped at 50 by the schema itself, not just the handler");
  assert.equal(schema.safeParse({ tenantId: "attacker-supplied" }).success, false, "must reject any model-supplied tenantId");
  console.log("list-leads.test.ts: the real Zod schema enforces limit bounds and forbids a smuggled tenantId — PASS");
}

async function run() {
  await testListLeadsScopesToTenantAndAppliesLimit();
  await testHandlerClampsLimitAndUsesVerifiedTenantOnly();
  await testSchemaRejectsOversizedOrSmuggledFields();
  console.log("list-leads.test.ts (@stratxcel/hermes-gateway): ALL PASS");
}

run();
