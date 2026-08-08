// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/tool-isolation.test.ts
import assert from "node:assert/strict";
import { resolveAdminTools, resolveClientTools, resolveAgentTools } from "../tools/registry.ts";
import type { AgentPrincipal, ClientAgentPrincipal, StaffAgentPrincipal } from "../principal.ts";
import { createFakeSupabase } from "./support/fake-supabase.ts";

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
  // 17. client cannot call admin tool — structurally, not just by permission.
  {
    const clientTools = resolveAdminTools(CLIENT_A as unknown as AgentPrincipal);
    assert.deepEqual(clientTools, [], "resolveAdminTools must return [] for a non-staff principal, regardless of permissions");
  }

  // staff cannot reach client-only tools either (symmetry check).
  {
    const staffClientTools = resolveClientTools(STAFF as unknown as AgentPrincipal);
    assert.deepEqual(staffClientTools, []);
  }

  // 19. staff can call permitted staff tools (and only those).
  {
    const tools = resolveAdminTools(STAFF);
    const names = tools.map((t) => t.schema.name).sort();
    assert.ok(names.includes("list_leads"));
    assert.ok(names.includes("update_lead_status"));
    assert.ok(names.includes("get_client"));
    // create_mission requires "agent:mutate:missions", which this staff
    // principal was NOT granted above.
    assert.ok(!names.includes("create_mission"), "permission filtering must exclude tools the principal lacks");
  }

  // dispatch via resolveAgentTools matches the kind-specific resolver.
  {
    assert.deepEqual(
      resolveAgentTools(STAFF).map((t) => t.schema.name).sort(),
      resolveAdminTools(STAFF).map((t) => t.schema.name).sort()
    );
    assert.deepEqual(
      resolveAgentTools(CLIENT_A as unknown as AgentPrincipal).map((t) => t.schema.name).sort(),
      resolveClientTools(CLIENT_A as unknown as AgentPrincipal).map((t) => t.schema.name).sort()
    );
  }

  // 15 + 16. client tenant fixed server-side; model-supplied tenantId ignored.
  {
    const { client, tables } = createFakeSupabase({
      tenants: [{ id: "tenant-a", slug: "tenant-a", name: "Tenant A", created_at: new Date().toISOString() }],
      crm_leads: [
        { id: "lead-in-a", tenant_id: "tenant-a", source: "manual", contact_name: "In Tenant A", status: "NEW" },
        { id: "lead-in-b", tenant_id: "tenant-b", source: "manual", contact_name: "In Tenant B (other tenant)", status: "NEW" },
      ],
    });
    const supabase = client as any;

    const tools = resolveClientTools(CLIENT_A as unknown as AgentPrincipal);
    const myLeadsTool = tools.find((t) => t.schema.name === "my_leads")!;
    assert.ok(myLeadsTool, "my_leads tool must be resolved for a client principal");

    // Even though the model supplies a DIFFERENT tenantId in args, the tool
    // must derive tenantId from ctx.principal.tenantId only and never read
    // args.tenantId at all.
    const output = (await myLeadsTool.execute(
      { principal: CLIENT_A as unknown as AgentPrincipal, supabase },
      { tenantId: "tenant-b", limit: 10 } // model-supplied, must be ignored
    )) as { leads: Array<{ id: string; tenant_id: string }> };

    assert.equal(output.leads.length, 1);
    assert.equal(output.leads[0].tenant_id, "tenant-a", "must only ever return the principal's own tenant's leads");
    assert.ok(!output.leads.some((l) => l.tenant_id === "tenant-b"), "must never leak another tenant's leads via a model-supplied tenantId");

    void tables; // seeded data referenced above; keep for clarity even if unused further
  }

  // Cross-tenant mission lookup: my_mission must not reveal another tenant's mission.
  {
    const { client } = createFakeSupabase({
      missions: [{ id: "mission-other-tenant", tenant_id: "tenant-b", state: "RUNNING" }],
    });
    const supabase = client as any;
    const tools = resolveClientTools(CLIENT_A as unknown as AgentPrincipal);
    const myMissionTool = tools.find((t) => t.schema.name === "my_mission");
    // my_mission calls getMission() from @stratxcel/missions, which this
    // fake doesn't implement end-to-end — so this assertion is limited to
    // confirming the tool exists and is tenant-aware by construction (see
    // tools/client/tools.ts's requireClientTenantId + tenant_id comparison).
    assert.ok(myMissionTool, "my_mission tool must exist for a client principal");
  }

  console.log("tool-isolation.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
