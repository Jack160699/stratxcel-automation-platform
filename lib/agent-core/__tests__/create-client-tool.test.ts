// Run with: node --experimental-strip-types lib/agent-core/__tests__/create-client-tool.test.ts
import assert from "node:assert/strict";
import { slugifyBusinessName, CREATE_CLIENT_TOOL } from "../create-client-tool.ts";
import { createTenant } from "../../tenants/repository.ts";

function testSlugifyBusinessName() {
  assert.equal(slugifyBusinessName("SolarCo Bhilai"), "solarco-bhilai");
  assert.equal(slugifyBusinessName("Ramesh's Solar & Co."), "rameshs-solar-co");
  assert.equal(slugifyBusinessName("   spaced   out   "), "spaced-out");
  assert.equal(slugifyBusinessName("!!!"), "workspace", "a name that slugifies to nothing falls back to a real, non-empty slug");
  const long = "a".repeat(80);
  assert.ok(slugifyBusinessName(long).length <= 48, "slug is bounded to a real max length");
  console.log("create-client-tool.test.ts: slugifyBusinessName matches the onboarding wizard's own real slug shape — PASS");
}

/** Fake matching lib/tenants/repository.ts's real .rpc() call shape. */
function fakeSupabaseRpc(behavior: (params: { p_slug: string; p_name: string; p_owner_user_id: string }) => { data: unknown; error: { message: string } | null }) {
  return {
    rpc: async (fn: string, params: { p_slug: string; p_name: string; p_owner_user_id: string }) => {
      assert.equal(fn, "create_tenant_with_owner");
      return behavior(params);
    },
  };
}

async function testCreateTenantCallsTheRealAtomicRpc() {
  let seenParams: unknown;
  const supabase = fakeSupabaseRpc((params) => {
    seenParams = params;
    return { data: { id: "t-1", slug: params.p_slug, name: params.p_name, created_at: "now", updated_at: "now" }, error: null };
  });
  const tenant = await createTenant(supabase as never, { slug: "solarco-bhilai", name: "SolarCo Bhilai", ownerUserId: "user-1" });
  assert.equal(tenant.id, "t-1");
  assert.deepEqual(seenParams, { p_slug: "solarco-bhilai", p_name: "SolarCo Bhilai", p_owner_user_id: "user-1" });
  console.log("create-client-tool.test.ts: createTenant calls the real atomic RPC with the right params — PASS");
}

async function testCreateTenantSurfacesRpcErrors() {
  const supabase = fakeSupabaseRpc(() => ({ data: null, error: { message: "duplicate key value violates unique constraint" } }));
  await assert.rejects(
    createTenant(supabase as never, { slug: "taken", name: "Taken Co", ownerUserId: "user-1" }),
    /duplicate key/,
  );
  console.log("create-client-tool.test.ts: createTenant surfaces the real RPC error message, never swallows it — PASS");
}

async function testToolRejectsMissingName() {
  const ctx = { principal: { kind: "staff" as const, channel: "admin_web" as const, authUserId: "user-1", tenantId: null, role: "platform_owner", permissions: ["agent:mutate:clients"] }, supabase: {} as never };
  const result = await CREATE_CLIENT_TOOL.execute(ctx, { name: "" });
  assert.equal((result as { outcome: string }).outcome, "FAILED");
  assert.equal((result as { reason: string }).reason, "missing_name");
  console.log("create-client-tool.test.ts: the tool refuses a missing/blank name rather than creating an unnamed company — PASS");
}

async function run() {
  testSlugifyBusinessName();
  await testCreateTenantCallsTheRealAtomicRpc();
  await testCreateTenantSurfacesRpcErrors();
  await testToolRejectsMissingName();
  console.log("create-client-tool.test.ts (lib/agent-core): ALL PASS");
}

run();
