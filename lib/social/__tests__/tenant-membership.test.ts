import assert from "node:assert/strict";
import { isTenantMember } from "../tenant-membership.ts";

console.log("Running StratXcel Tenant Membership Verification Tests...\n");

// A fake client that mimics real Postgrest schema-error behavior: selecting
// a column that doesn't exist on the table returns { data: null, error }
// rather than throwing. Its `columns` list is the REAL, live
// tenant_members schema -- tenant_id, user_id, role, invited_by,
// created_at, with NO id column (its primary key is the composite
// (tenant_id, user_id); see 20260803120000_platform_tenants_rbac_audit.sql).
// The production bug: the OAuth callback route selected "id" from this
// table, which errored with "column tenant_members.id does not exist" on
// every single call, and destructured only `{ data }` from the response --
// silently discarding that error and treating the null result as "not a
// member". That wiped a real tenant owner's resolved tenantId on every
// reconnect attempt, for every provider. This fake reproduces the exact
// mechanism (schema mismatch -> Postgrest error -> null data) so a
// regression back to select("id") fails this test the same way it failed
// in production, instead of only being visible against the live database.
const REAL_TENANT_MEMBERS_COLUMNS = ["tenant_id", "user_id", "role", "invited_by", "created_at"];

function createFakeDb(rows: Array<{ tenant_id: string; user_id: string; role: string }>) {
  return {
    from(table: string) {
      assert.equal(table, "tenant_members");
      return {
        select(cols: string) {
          const requested = cols.split(",").map((c) => c.trim());
          const unknown = requested.find((c) => !REAL_TENANT_MEMBERS_COLUMNS.includes(c));
          const filters: Array<[string, any]> = [];
          const chain: any = {
            eq(col: string, val: any) {
              filters.push([col, val]);
              return chain;
            },
            async maybeSingle() {
              if (unknown) {
                return { data: null, error: { message: `column tenant_members.${unknown} does not exist`, code: "42703" } };
              }
              const found = rows.find((r) => filters.every(([col, val]) => (r as any)[col] === val));
              return { data: found ? { role: found.role } : null, error: null };
            },
          };
          return chain;
        },
      };
    },
  } as any;
}

// TEST 1: The real production scenario -- a genuine tenant owner, checked
// against the real (id-less) schema, must be recognized as a member. This
// is the exact case that was broken: the row existed, but select("id")
// always errored against this schema, so isTenantMember must query only
// columns that actually exist (currently "role") to pass.
{
  console.log("Test 1: Real tenant owner is recognized as a member against the real schema...");
  const db = createFakeDb([{ tenant_id: "tenant_a", user_id: "user_a", role: "owner" }]);
  const result = await isTenantMember(db, "tenant_a", "user_a");
  assert.equal(result, true, "A real, existing membership row must be recognized -- this is what silently failed in production");
  console.log("✓ Real member recognized against the real (id-less) schema.");
}

// TEST 2: A genuine non-member is correctly rejected -- confirms the fix
// didn't just make the check always pass.
{
  console.log("Test 2: Genuine non-member is rejected...");
  const db = createFakeDb([{ tenant_id: "tenant_a", user_id: "user_a", role: "owner" }]);
  const result = await isTenantMember(db, "tenant_a", "user_stranger");
  assert.equal(result, false);
  console.log("✓ Non-member rejected.");
}

console.log("\n=======================================================");
console.log("ALL TENANT MEMBERSHIP VERIFICATION TESTS PASSED!");
console.log("=======================================================\n");
