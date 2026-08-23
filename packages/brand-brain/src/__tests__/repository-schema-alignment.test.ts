// Regression test for a P1 finding from live E2E testing on
// 2026-08-23: getCurrentBrandBrain / getBrandBrainVersion /
// saveBrandBrainVersion each selected "id, ..." from brand_brains and
// brand_brain_versions, but neither table has an id column in production
// (confirmed via information_schema.columns on the live Supabase project —
// both tables use tenant_id, or tenant_id+version, as their natural key).
// Effect: getCurrentBrandBrain 500'd for every read (GET /api/platform/brand),
// and saveBrandBrainVersion threw during onboarding — caught and logged
// ("onboarding: failed to save Brand Brain seed") but not surfaced to the
// user, so onboarding still reported success while silently discarding
// everything the customer typed in the Brand step (what they sell, USP,
// audience, words to avoid). BrandBrainRow/BrandBrainVersionRow in types.ts
// were already correct (no id field) — only the .select() string literals
// drifted from both the type and the schema.
//
// Static source-inspection test (no live Supabase project reachable from
// this environment), matching the pattern used by
// lib/rbac/__tests__/admin-audit-requests-authorization.test.ts.
// Run with: node --experimental-strip-types packages/brand-brain/src/__tests__/repository-schema-alignment.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");

function run() {
  const repoSource = read("repository.ts");
  const typesSource = read("types.ts");

  // --- 1. None of the three .select() calls may request a nonexistent
  //        "id" column from brand_brains / brand_brain_versions. -----------
  const selectCalls = [...repoSource.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1]!);
  assert.ok(selectCalls.length >= 3, `expected at least 3 .select() calls in repository.ts, found ${selectCalls.length}`);
  for (const cols of selectCalls) {
    const fields = cols.split(",").map((c) => c.trim());
    assert.ok(
      !fields.includes("id"),
      `repository.ts selects a nonexistent "id" column: .select("${cols}") — brand_brains and ` +
        `brand_brain_versions have no id column in the live schema; this 500s getCurrentBrandBrain ` +
        `and silently breaks saveBrandBrainVersion during onboarding`
    );
  }

  // --- 2. Row types must stay in lockstep with the real schema: no `id`. -
  const rowInterfaces = [...typesSource.matchAll(/export interface (BrandBrain(?:Version)?Row) \{([^}]*)\}/g)];
  assert.equal(rowInterfaces.length, 2, "expected BrandBrainRow and BrandBrainVersionRow interfaces in types.ts");
  for (const [, name, body] of rowInterfaces) {
    assert.ok(
      !/^\s*id\s*:/m.test(body!),
      `${name} declares an "id" field that does not exist on the underlying table — ` +
        `.select() calls are string literals, not typechecked against Postgres, so this drift ` +
        `won't be caught by tsc; keep row types matching the real columns exactly`
    );
  }

  console.log("PASS: brand-brain repository .select() calls and row types stay aligned with the real schema (no id column)");
}

run();
