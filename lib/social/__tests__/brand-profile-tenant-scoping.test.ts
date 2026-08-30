// Run with: node --experimental-strip-types lib/social/__tests__/brand-profile-tenant-scoping.test.ts
//
// STRATXCEL final closure brief: real, confirmed, live production bug --
// see lib/social/repositories/brand.ts's header comment on
// getBrandProfileForTenant for the full writeup. app/admin/(shell)/social/
// brand/page.tsx (the admin "Social Brand" page) called plain
// getBrandProfile(ctx) with a bare, owner_id-scoped OwnerContext -- the
// logged-in STAFF member's own identity, never the tenant being managed.
// Confirmed live: the real, populated StratXcel social_brand_profiles row
// (owner_id 9381030b-..., tenant_id 466e6195-...) sat completely untouched
// while the admin page showed every field empty; any staff "save" there
// was silently writing into (or creating) a separate row keyed to the
// staff member's own owner_id.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getBrandProfileForTenant, upsertBrandProfileForTenant, type BrandProfileRow } from "../repositories/brand.ts";

const root = resolve(import.meta.dirname, "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

function fakeService(opts: { rows: Array<Partial<BrandProfileRow> & { tenant_id?: string | null; id: string }> }) {
  const updateCalls: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const insertCalls: Array<Record<string, unknown>> = [];
  function builder(table: string): any {
    if (table !== "social_brand_profiles") throw new Error(`fakeService: unexpected real table in this fake: ${table}`);
    const b: any = {
      select() { return b; },
      eq(col: string, value: string) {
        if (col === "tenant_id") {
          const row = opts.rows.find((r) => r.tenant_id === value);
          return { maybeSingle: async () => ({ data: row ?? null, error: null }) };
        }
        if (col === "id") {
          return {
            update: (fields: Record<string, unknown>) => {
              updateCalls.push({ id: value, fields });
              return { eq: () => Promise.resolve({ data: null, error: null }) };
            },
          };
        }
        return b;
      },
      update(fields: Record<string, unknown>) {
        return { eq: (_col: string, value: string) => { updateCalls.push({ id: value, fields }); return Promise.resolve({ data: null, error: null }); } };
      },
      insert(row: Record<string, unknown>) {
        insertCalls.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    };
    return b;
  }
  return { service: { from: (t: string) => builder(t) } as never, updateCalls, insertCalls };
}

async function testTwoTenantsNeverShareABrandProfile() {
  const { service } = fakeService({
    rows: [
      { id: "row-a", tenant_id: "tenant-a", owner_id: "owner-a", identity: { name: "Tenant A Co" } } as never,
      { id: "row-b", tenant_id: "tenant-b", owner_id: "owner-b", identity: { name: "Tenant B Co" } } as never,
    ],
  });
  const a = await getBrandProfileForTenant(service, "tenant-a");
  const b = await getBrandProfileForTenant(service, "tenant-b");
  assert.equal(a.identity.name, "Tenant A Co");
  assert.equal(b.identity.name, "Tenant B Co");
  console.log("brand-profile-tenant-scoping.test.ts: two real tenants never see each other's brand profile — PASS");
}

async function testUpdatingAnExistingTenantRowPreservesItsRealOwnerId() {
  const { service, updateCalls, insertCalls } = fakeService({
    rows: [{ id: "5f2b5199-real-stratxcel-row", tenant_id: "466e6195-a9f6-4576-8271-29fdae61c18a", owner_id: "9381030b-b14a-4551-a6e9-b5918f017e1b", identity: { name: "Stratxcel" } } as never],
  });
  await upsertBrandProfileForTenant(service, "466e6195-a9f6-4576-8271-29fdae61c18a", { identity: { name: "Stratxcel", industry: "AI Automation" } });
  assert.equal(insertCalls.length, 0, "an existing real row must be updated, never re-inserted as a duplicate");
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0]!.id, "5f2b5199-real-stratxcel-row", "must update the real existing row by its own real id");
  assert.ok(!("owner_id" in updateCalls[0]!.fields), "must never overwrite the real row's own owner_id -- the update payload must not even mention it");
  console.log("brand-profile-tenant-scoping.test.ts: updating an existing tenant row preserves its real owner_id untouched — PASS");
}

async function testBrandNewTenantGetsAGenuinelyNewTenantScopedRow() {
  const { service, insertCalls } = fakeService({ rows: [] });
  await upsertBrandProfileForTenant(service, "brand-new-tenant", { identity: { name: "New Co" } });
  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0]!.tenant_id, "brand-new-tenant");
  assert.ok(!("owner_id" in insertCalls[0]!), "a brand-new tenant-scoped row must never guess an owner_id from the acting staff member's own identity");
  console.log("brand-profile-tenant-scoping.test.ts: a brand-new tenant gets a genuinely new, tenant-scoped row with no guessed owner_id — PASS");
}

function testAdminBrandPageUsesTheRealTenantScopedFunctions() {
  const page = read("app", "admin", "(shell)", "social", "brand", "page.tsx");
  assert.match(page, /resolveCurrentTenant\(ctx\.supabase, ctx\.ownerId\)/, "the admin Brand Brain page must resolve the real active tenant, never trust the logged-in staff member's own identity");
  assert.match(page, /getBrandProfileForTenant\(service as never, active\.tenantId\)/, "the admin Brand Brain page must read the real tenant-scoped profile, never the old owner-scoped getBrandProfile");
  assert.ok(!page.includes("getBrandProfile(ctx)"), "must never fall back to the old owner-scoped read");

  const actions = read("app", "admin", "(shell)", "social", "brand", "actions.ts");
  assert.match(actions, /resolveCurrentTenant\(ctx\.supabase, ctx\.ownerId\)/, "every admin Brand Brain action must resolve the real active tenant");
  assert.ok(!actions.includes("upsertBrandProfile(ctx,"), "must never fall back to the old owner-scoped write (the exact real bug -- silently saving into the wrong row)");
  assert.match(actions, /upsertBrandProfileForTenant\(ctx\.service, ctx\.tenantId,/, "every save must go through the real tenant-scoped write");
  console.log("brand-profile-tenant-scoping.test.ts: the real admin Brand Brain page and every one of its actions use the real tenant-scoped functions — PASS");
}

async function run() {
  await testTwoTenantsNeverShareABrandProfile();
  await testUpdatingAnExistingTenantRowPreservesItsRealOwnerId();
  await testBrandNewTenantGetsAGenuinelyNewTenantScopedRow();
  testAdminBrandPageUsesTheRealTenantScopedFunctions();
  console.log("brand-profile-tenant-scoping.test.ts: ALL PASS");
}

run();
