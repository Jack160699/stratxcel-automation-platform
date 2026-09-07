// Run with: node --experimental-strip-types lib/agent-core/__tests__/agent-factory-status.test.ts
//
// SET_AGENT_DEFINITION_STATUS_TOOL itself (agent-factory-tools.ts) is not
// imported directly here: that file transitively pulls in all-tools.ts's
// ~20 sibling tool files, several of which (like most of lib/agent-core/)
// use Next.js-bundler-only extensionless relative imports -- a real,
// pre-existing, wider pattern than this one change should take on fixing
// in one pass (unlike the narrow, two-file fix this same change already
// made to agent-dispatch.ts). That thin tool wrapper's own input validation
// is covered by tsc --noEmit + a real production build instead, the same
// verification CREATE_AGENT_DEFINITION_TOOL itself has always relied on
// (no standalone unit test existed for it before this file either). What
// this file verifies directly, executably, is the real behavior that
// matters: the repository function that actually flips a row's status, and
// -- most importantly -- that resolveAgentDispatch (the exact function
// WhatsApp/Admin Copilot both call on every dispatch) really refuses a
// disabled agent end to end, not just that a status field changed in
// isolation.
import assert from "node:assert/strict";
import { setAgentDefinitionStatus, type AgentDefinitionRow } from "../agent-definitions.ts";
import { resolveAgentDispatch } from "../agent-dispatch.ts";

function fakeRow(overrides: Partial<AgentDefinitionRow> = {}): AgentDefinitionRow {
  return {
    id: "row-1",
    key: "growth_specialist",
    name: "Growth Specialist",
    description: "Handles growth work.",
    department: "Growth",
    allowed_tool_names: ["check_growth_status"],
    status: "active",
    created_by: "user-1",
    created_by_principal_kind: "staff",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** In-memory fake matching agent-definitions.ts's own MinimalSupabase shape. */
function fakeSupabase(initialRows: AgentDefinitionRow[]) {
  const rows = new Map(initialRows.map((r) => [r.key, r]));
  return {
    rows,
    from(table: string) {
      assert.equal(table, "agent_definitions");
      return {
        select() {
          return {
            eq(_col: string, key: string) {
              return { maybeSingle: async () => ({ data: rows.get(key) ?? null, error: null }) };
            },
            order: async () => ({ data: [...rows.values()], error: null }),
          };
        },
        insert(row: Record<string, unknown>) {
          return {
            select: () => ({
              single: async () => {
                const created = fakeRow({ ...row } as Partial<AgentDefinitionRow>);
                rows.set(created.key, created);
                return { data: created, error: null };
              },
            }),
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: (_col: string, key: string) => ({
              select: () => ({
                single: async () => {
                  const existing = rows.get(key);
                  if (!existing) return { data: null as unknown as AgentDefinitionRow, error: { message: "no rows returned" } };
                  const updated = { ...existing, ...patch } as AgentDefinitionRow;
                  rows.set(key, updated);
                  return { data: updated, error: null };
                },
              }),
            }),
          };
        },
      };
    },
  };
}

async function testSetAgentDefinitionStatusUpdatesRealRow() {
  const supabase = fakeSupabase([fakeRow({ key: "growth_specialist", status: "active" })]);
  const updated = await setAgentDefinitionStatus(supabase, "growth_specialist", "disabled");
  assert.ok(updated);
  assert.equal(updated!.status, "disabled");
  assert.equal(supabase.rows.get("growth_specialist")!.status, "disabled");
  console.log("agent-factory-status.test.ts: setAgentDefinitionStatus updates the real row — PASS");
}

async function testSetAgentDefinitionStatusReturnsNullForUnknownKey() {
  const supabase = fakeSupabase([]);
  const result = await setAgentDefinitionStatus(supabase, "does_not_exist", "disabled");
  assert.equal(result, null);
  console.log("agent-factory-status.test.ts: setAgentDefinitionStatus returns null (not a throw) for an unknown key — PASS");
}

async function testDisablingMakesRealDispatchRefuseIt() {
  const supabase = fakeSupabase([fakeRow({ key: "growth_specialist", status: "active", allowed_tool_names: ["check_growth_status"] })]);

  // Before disabling: the real dispatch-resolution path resolves the agent normally.
  const before = await resolveAgentDispatch(supabase, "AGENT:growth_specialist: what's next");
  assert.equal(before.agentDefinitionKey, "growth_specialist");
  assert.equal(before.dispatchError, null);

  const updated = await setAgentDefinitionStatus(supabase, "growth_specialist", "disabled");
  assert.equal(updated!.status, "disabled");

  // After disabling: the exact same real function WhatsApp/Admin Copilot
  // both call on every dispatch now refuses it -- the actual safety
  // property, not just a status field flipping in isolation.
  const after = await resolveAgentDispatch(supabase, "AGENT:growth_specialist: what's next");
  assert.equal(after.agentDefinitionKey, null);
  assert.ok(after.dispatchError?.includes("No active agent"));

  // Re-enabling restores real dispatchability through the same real path.
  await setAgentDefinitionStatus(supabase, "growth_specialist", "active");
  const afterReEnable = await resolveAgentDispatch(supabase, "AGENT:growth_specialist: what's next");
  assert.equal(afterReEnable.agentDefinitionKey, "growth_specialist");

  console.log("agent-factory-status.test.ts: disabling an agent makes the real resolveAgentDispatch path refuse it end-to-end, re-enabling restores it — PASS");
}

async function run() {
  await testSetAgentDefinitionStatusUpdatesRealRow();
  await testSetAgentDefinitionStatusReturnsNullForUnknownKey();
  await testDisablingMakesRealDispatchRefuseIt();
  console.log("agent-factory-status.test.ts (lib/agent-core): ALL PASS");
}

run();
