import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260809010000_subscription_v1_catalog_alignment.sql"), "utf8");
for (const fragment of ["starter', 'growth', 'business", "v_base_price := 499900", "v_base_price := 999900", "v_base_price := 1999900", "array[12, 1, 100, 0]", "array[25, 1, 500, 1]", "array[50, 3, 1500, 1]"]) assert.ok(migration.includes(fragment), `missing ${fragment}`);
assert.ok(migration.includes("legacy_plan_not_payable"));
assert.ok(migration.includes("plan_not_self_checkout"));
assert.ok(migration.includes("unknown_plan_tier"));
assert.ok(migration.includes("refusing catalog alignment"));
assert.ok(migration.includes("security definer") && migration.includes("set search_path = public"));
assert.ok(migration.includes("revoke execute") && migration.includes("grant execute") && migration.includes("to service_role"));
assert.equal(migration.includes("PAYMENTS_SUBSCRIPTIONS_ENABLED=true"), false);
assert.equal(migration.includes("audit_fee_cents"), false, "audit product must remain separate and untouched");

// --- CRLF/LF robustness of the pg_get_functiondef() patch ---------------
// Production's pg_get_functiondef() may return CRLF line endings even
// though this migration's literal comparison/replacement text is LF-only.
// Statically confirm the normalization exists and runs BEFORE v_original
// is captured (otherwise the final `v_definition = v_original` failed-patch
// safety check would be comparing an un-normalized baseline and could pass
// even when nothing was actually patched).
const declIdx = migration.indexOf("v_original text;");
const normIdx = migration.indexOf("replace(v_definition, E'\\r\\n', E'\\n')");
const assignIdx = migration.indexOf("v_original := v_definition;");
assert.ok(declIdx !== -1, "expected `v_original text;` (declared, not pre-assigned)");
assert.ok(normIdx !== -1, "expected CRLF normalization of v_definition");
assert.ok(migration.includes("replace(v_definition, E'\\r', E'\\n')"), "expected lone-CR normalization of v_definition");
assert.ok(assignIdx !== -1, "expected v_original assignment");
assert.ok(declIdx < normIdx && normIdx < assignIdx, "normalization must run after declaration but before v_original is captured");

// Functional simulation: replicate the exact declare/replace chain the
// migration executes, derived from the migration's own literal fragments
// (not hand-duplicated), against synthetic LF and CRLF "production body"
// inputs. Proves the patch outcome is identical regardless of the source
// line endings, and that the failed-patch guard (`v_definition = v_original`)
// still correctly requires a real change.
function extractPairs(sql: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const simpleRe = /v_definition := replace\(v_definition,\s*\n\s*'([^']+)',\s*\n\s*'([^']+)'\);/g;
  for (const m of sql.matchAll(simpleRe)) pairs.push([m[1], m[2]]);
  const blockRe = /replace\(v_definition,\n\$old\$([\s\S]*?)\$old\$,\n\$new\$([\s\S]*?)\$new\$\);/;
  const blockMatch = sql.match(blockRe);
  assert.ok(blockMatch, "expected the $old$/$new$ branch replacement block");
  pairs.push([blockMatch![1], blockMatch![2]]);
  return pairs;
}
const pairs = extractPairs(migration);
assert.equal(pairs.length, 4, "expected 3 declaration replaces + 1 branch replace");

function simulate(rawBody: string) {
  let def = rawBody.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const original = def;
  for (const [oldStr] of pairs) assert.ok(def.includes(oldStr), `pre-check missing: ${oldStr.slice(0, 40)}...`);
  for (const [oldStr, newStr] of pairs) def = def.split(oldStr).join(newStr);
  assert.notEqual(def, original, "patch must actually change the body (failed-patch guard)");
  return def;
}

const syntheticLf = [
  "create or replace function public.reconcile_and_fulfill_razorpay_payment_v4(...)",
  "  v_limits_launch int[] := array[12, 1, 500, 0];",
  "  v_limits_growth int[] := array[30, 2, 2500, 1];",
  "  v_limits_custom int[] := array[60, 4, 10000, 1];",
  "begin",
  "  " + pairs[3][0],
  "end;",
].join("\n");
const syntheticCrlf = syntheticLf.replace(/\n/g, "\r\n");

const patchedFromLf = simulate(syntheticLf);
const patchedFromCrlf = simulate(syntheticCrlf);
assert.equal(patchedFromLf, patchedFromCrlf, "CRLF and LF production input must patch to the identical result");
for (const marker of ["v_base_price := 499900;", "legacy_plan_not_payable", "plan_not_self_checkout"]) {
  assert.ok(patchedFromLf.includes(marker), `patched body missing ${marker}`);
}

console.log("subscription-v1-catalog-migration.test.ts: ALL PASS (additive constraint/guard, exact prices/limits, legacy/free/scale fail closed, hardened RPC patch and ACLs, CRLF/LF pg_get_functiondef robustness)");
