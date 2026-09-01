// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/check-capabilities-tool.test.ts
import assert from "node:assert/strict";
import { createFakeSupabase } from "./support/fake-supabase.ts";
import { ADMIN_READ_TOOLS } from "../tools/admin/read-tools.ts";
import type { StaffAgentPrincipal } from "../principal.ts";

// check_capabilities (Update 11 -- Master Brain brief, priority 2) had zero
// test coverage until now despite being the canonical "what can you do"
// surface the whole honesty/anti-fabrication discipline of this mission
// depends on. Verified here against the real fake-supabase query-builder
// chain (.from().select().order().eq().eq()), not just by reading the
// production table directly -- the tool's own filter logic (category,
// status, both, neither) is what's under test.

const principal: StaffAgentPrincipal = { kind: "staff", channel: "whatsapp", authUserId: "staff-caps-1", tenantId: null, role: "platform_owner", permissions: ["agent:read:capabilities"] };

async function run() {
  const tool = ADMIN_READ_TOOLS.find((t) => t.schema.name === "check_capabilities");
  assert.ok(tool, "check_capabilities must be registered in ADMIN_READ_TOOLS");

  const seedRows = [
    { capability_key: "agent_tool:analyze_website", category: "research", status: "REAL_EXPOSED", name: "a", description: "d" },
    { capability_key: "agent_tool:check_website_status", category: "website", status: "REAL_EXPOSED", name: "b", description: "d" },
    { capability_key: "engine:website_vercel_orchestration", category: "website", status: "REAL_NOT_EXPOSED", name: "c", description: "d" },
    { capability_key: "capability:market_company_discovery", category: "ecosystem", status: "NOT_BUILT", name: "e", description: "d" },
  ];
  const { client } = createFakeSupabase({ capability_registry: seedRows });
  const supabase = client as any;

  {
    // No filters -- every row comes back.
    const result = (await tool!.execute({ principal, supabase }, {})) as { capabilities: unknown[] };
    assert.equal(result.capabilities.length, 4, "no filters must return every capability_registry row");
  }
  {
    // category filter alone.
    const result = (await tool!.execute({ principal, supabase }, { category: "website" })) as { capabilities: Array<{ capability_key: string }> };
    assert.equal(result.capabilities.length, 2, "category filter must narrow to matching rows only");
    assert.ok(result.capabilities.every((c) => ["agent_tool:check_website_status", "engine:website_vercel_orchestration"].includes(c.capability_key)));
  }
  {
    // status filter alone.
    const result = (await tool!.execute({ principal, supabase }, { status: "REAL_EXPOSED" })) as { capabilities: unknown[] };
    assert.equal(result.capabilities.length, 2, "status filter must narrow to matching rows only");
  }
  {
    // both filters -- intersection, not union.
    const result = (await tool!.execute({ principal, supabase }, { category: "website", status: "REAL_NOT_EXPOSED" })) as { capabilities: Array<{ capability_key: string }> };
    assert.equal(result.capabilities.length, 1, "combined filters must intersect, not union");
    assert.equal(result.capabilities[0].capability_key, "engine:website_vercel_orchestration");
  }

  console.log("check-capabilities-tool.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
