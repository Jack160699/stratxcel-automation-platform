// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/tool-allowlist.test.ts
//
// Agent Factory: toolNameAllowlist must narrow the candidate set (never
// widen it), and the permission filter must still apply independently on
// top -- an allowlist naming a tool the principal lacks permission for must
// still be excluded.
import assert from "node:assert/strict";
import { resolveAdminTools, resolveClientTools } from "../tools/registry.ts";
import type { ClientAgentPrincipal, StaffAgentPrincipal } from "../principal.ts";

const STAFF: StaffAgentPrincipal = {
  kind: "staff",
  channel: "whatsapp",
  authUserId: "staff-1",
  tenantId: null,
  role: "platform_owner",
  permissions: ["agent:read:leads", "agent:mutate:leads", "agent:read:clients"],
};

const CLIENT_A: ClientAgentPrincipal = {
  kind: "client",
  channel: "whatsapp",
  authUserId: "client-a",
  tenantId: "tenant-a",
  role: "owner",
  permissions: ["agent:read:leads", "agent:read:missions", "agent:mutate:missions"],
};

async function run() {
  // No allowlist: unchanged default behavior (every existing caller).
  {
    const withNoOption = resolveAdminTools(STAFF).map((t) => t.schema.name).sort();
    const withUndefinedAllowlist = resolveAdminTools(STAFF, { toolNameAllowlist: undefined }).map((t) => t.schema.name).sort();
    assert.deepEqual(withUndefinedAllowlist, withNoOption, "omitting toolNameAllowlist must not change the resolved tool set");
  }

  // A real narrowing: allowlist naming a subset of what the principal holds.
  {
    const full = resolveAdminTools(STAFF).map((t) => t.schema.name);
    assert.ok(full.includes("list_leads") && full.includes("get_client"), "sanity: staff has both tools before narrowing");

    const narrowed = resolveAdminTools(STAFF, { toolNameAllowlist: ["list_leads"] }).map((t) => t.schema.name);
    assert.deepEqual(narrowed, ["list_leads"], "toolNameAllowlist must narrow the resolved set to exactly the named tools");
  }

  // Cannot widen: naming a tool the principal has no permission for stays excluded.
  {
    const narrowed = resolveAdminTools(STAFF, { toolNameAllowlist: ["list_leads", "create_mission"] }).map((t) => t.schema.name);
    assert.deepEqual(narrowed, ["list_leads"], "an allowlist can never grant a tool the principal's own permissions don't already allow");
  }

  // Naming a nonexistent tool is simply inert (no match, no error) -- not a
  // way to inject a fake capability.
  {
    const narrowed = resolveAdminTools(STAFF, { toolNameAllowlist: ["this_tool_does_not_exist"] });
    assert.deepEqual(narrowed, [], "an allowlist naming an unknown tool name resolves to an empty set, not an error or a fabricated tool");
  }

  // Same narrowing behavior for client principals.
  {
    const full = resolveClientTools(CLIENT_A).map((t) => t.schema.name);
    assert.ok(full.includes("my_leads"));
    const narrowed = resolveClientTools(CLIENT_A, { toolNameAllowlist: ["my_leads"] }).map((t) => t.schema.name);
    assert.deepEqual(narrowed, ["my_leads"]);
  }

  console.log("tool-allowlist.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
