// Live, non-destructive RLS isolation smoke test for the Owner Operating
// Brain schema, run against the real production Supabase project.
//
// Creates two temporary auth users + two temporary owner_sources rows
// (chosen because it's a small, harmless table to touch), exercises real
// authenticated Supabase clients (not the service role) against RLS, and
// deletes every fixture it created — including the temp auth users —
// before exiting, in a `finally` block so a failed assertion still
// cleans up.
//
// Run with: node --env-file=.env.local scripts/verify-owner-brain-rls.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function randomPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

async function createTempAuthUser(label) {
  const password = randomPassword();
  const email = `owner-brain-rls-test-${label}-${Date.now()}@example.invalid`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${label}) failed: ${error.message}`);
  return { id: data.user.id, email, password };
}

async function signInAs(user) {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`sign-in failed for ${user.email}: ${error.message}`);
  return client;
}

async function main() {
  const results = [];
  let ownerA, ownerB, rowAId, rowBId;

  try {
    ownerA = await createTempAuthUser("owner-a");
    ownerB = await createTempAuthUser("owner-b");

    // Only owner A is admitted as an admin — owner B is a real
    // authenticated user with NO stratxcel_admins row, simulating "an
    // authenticated identity that isn't authorized at all".
    const { error: adminInsertErr } = await service.from("stratxcel_admins").insert({ user_id: ownerA.id });
    if (adminInsertErr) throw new Error(`stratxcel_admins insert failed: ${adminInsertErr.message}`);

    const { data: rowA, error: rowAErr } = await service
      .from("owner_sources")
      .insert({ owner_id: ownerA.id, source_key: "gmail", display_name: "RLS-TEST-A", category: "communication" })
      .select("id")
      .single();
    if (rowAErr) throw new Error(`fixture row A insert failed: ${rowAErr.message}`);
    rowAId = rowA.id;

    // owner B's own row exists too, using the service role directly (owner B has no admin row, so this can't go through their own session).
    const { data: rowB, error: rowBErr } = await service
      .from("owner_sources")
      .insert({ owner_id: ownerB.id, source_key: "notion", display_name: "RLS-TEST-B", category: "notes" })
      .select("id")
      .single();
    if (rowBErr) throw new Error(`fixture row B insert failed: ${rowBErr.message}`);
    rowBId = rowB.id;

    // 1. Authorized owner (A) can read their own record.
    const clientA = await signInAs(ownerA);
    const { data: aOwnRead, error: aOwnErr } = await clientA.from("owner_sources").select("id").eq("id", rowAId);
    assert.equal(aOwnErr, null, "owner A's own-row read must not error");
    assert.equal(aOwnRead.length, 1, "owner A (admin) must see their own owner_sources row");
    results.push("PASS: authorized owner can read own record");

    // 2. Cross-owner denial: owner A (an admin) must NOT see owner B's row, even though A is a real admin.
    const { data: aCrossRead } = await clientA.from("owner_sources").select("id").eq("id", rowBId);
    assert.equal(aCrossRead.length, 0, "an admin must never see another owner_id's row");
    results.push("PASS: cross-owner access denied (admin A cannot read owner B's row)");

    // 3. Unauthorized authenticated identity (B, no stratxcel_admins row) cannot read ANY owner_sources row, including their own.
    const clientB = await signInAs(ownerB);
    const { data: bOwnRead } = await clientB.from("owner_sources").select("id").eq("id", rowBId);
    assert.equal(bOwnRead.length, 0, "a non-admin authenticated user must not read owner_sources even for their own owner_id");
    const { data: bCrossRead } = await clientB.from("owner_sources").select("id").eq("id", rowAId);
    assert.equal(bCrossRead.length, 0, "a non-admin authenticated user must not read another owner's row either");
    results.push("PASS: unauthorized authenticated identity denied (no admin membership)");

    // 4. Unauthenticated access is denied. The `anon` role has no table-
    // level grant on owner_sources at all (only `authenticated` and
    // `service_role` do — see 20260810190000), so this is expected to be
    // a hard 42501 permission-denied error, an even stronger form of
    // denial than an RLS-filtered empty result. Either an error or an
    // empty result counts as "denied"; only actual row data would fail this.
    const anonClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: anonRead, error: anonErr } = await anonClient.from("owner_sources").select("id").eq("id", rowAId);
    assert.equal((anonRead ?? []).length, 0, "an unauthenticated client must never see row data");
    assert.ok(anonErr === null || anonErr.code === "42501", `unauthenticated access must be denied via RLS-empty-result or permission error, got: ${anonErr?.message}`);
    results.push(`PASS: unauthenticated access denied (${anonErr ? "table grant denied (42501)" : "RLS-filtered to empty"})`);

    // 5. service-role client bypasses RLS as designed (proves the bypass is real and only the service key — never shipped to a browser — has it).
    const { data: serviceRead, error: serviceErr } = await service.from("owner_sources").select("id").in("id", [rowAId, rowBId]);
    assert.equal(serviceErr, null);
    assert.equal(serviceRead.length, 2, "service-role must see both fixture rows (RLS bypass working as designed, server-only)");
    results.push("PASS: service-role bypass confirmed (server-only capability)");

    console.log("\n" + results.join("\n"));
    console.log("\nverify-owner-brain-rls.mjs: ALL PASS");
  } finally {
    // Cleanup — best-effort each step, never skip later cleanup because an earlier step errored.
    if (rowAId) await service.from("owner_sources").delete().eq("id", rowAId).then(() => {}, () => {});
    if (rowBId) await service.from("owner_sources").delete().eq("id", rowBId).then(() => {}, () => {});
    if (ownerA) {
      await service.from("stratxcel_admins").delete().eq("user_id", ownerA.id).then(() => {}, () => {});
      await service.auth.admin.deleteUser(ownerA.id).then(() => {}, () => {});
    }
    if (ownerB) await service.auth.admin.deleteUser(ownerB.id).then(() => {}, () => {});
    console.log("Cleanup complete — temp auth users, admin row, and fixture rows removed.");
  }
}

main().catch((err) => {
  console.error("verify-owner-brain-rls.mjs: FAILED", err);
  process.exitCode = 1;
});
