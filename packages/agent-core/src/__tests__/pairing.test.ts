// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/pairing.test.ts
import assert from "node:assert/strict";
import { createFakeSupabase } from "./support/fake-supabase.ts";
import { createPairingChallenge, consumePairingChallenge } from "../pairing/repository.ts";
import { resolveWhatsAppPrincipal } from "../principals/repository.ts";

async function run() {
  // 1. valid staff pairing
  {
    const { client, tables } = createFakeSupabase({
      platform_staff_users: [{ user_id: "staff-1", role: "platform_admin", is_active: true }],
    });
    const supabase = client as any;
    const challenge = await createPairingChallenge(supabase, { authUserId: "staff-1", principalType: "staff", tenantId: null });
    assert.match(challenge.code, /^\d{6}$/);

    const result = await consumePairingChallenge(supabase, "919876500001", challenge.code);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.authUserId, "staff-1");
      assert.equal(result.principalType, "staff");
      assert.equal(result.tenantId, null);
    }

    const resolution = await resolveWhatsAppPrincipal(supabase, "919876500001");
    assert.equal(resolution.status, "resolved");
    if (resolution.status === "resolved") assert.equal(resolution.principal.kind, "staff");

    assert.equal(tables.whatsapp_channel_pairing_codes.length, 1);
    assert.notEqual((tables.whatsapp_channel_pairing_codes[0] as any).code_hash, challenge.code, "plaintext code must never be stored");
  }

  // 2. valid client pairing
  {
    const { client } = createFakeSupabase({
      tenant_members: [{ tenant_id: "tenant-a", user_id: "client-1", role: "owner" }],
    });
    const supabase = client as any;
    const challenge = await createPairingChallenge(supabase, { authUserId: "client-1", principalType: "client", tenantId: "tenant-a" });
    const result = await consumePairingChallenge(supabase, "919876500002", challenge.code);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.tenantId, "tenant-a");

    const resolution = await resolveWhatsAppPrincipal(supabase, "919876500002");
    assert.equal(resolution.status, "resolved");
    if (resolution.status === "resolved") {
      assert.equal(resolution.principal.kind, "client");
      if (resolution.principal.kind === "client") assert.equal(resolution.principal.tenantId, "tenant-a");
    }
  }

  // 3. wrong code
  {
    const { client } = createFakeSupabase({ platform_staff_users: [{ user_id: "staff-2", role: "platform_admin", is_active: true }] });
    const supabase = client as any;
    await createPairingChallenge(supabase, { authUserId: "staff-2", principalType: "staff", tenantId: null });
    const result = await consumePairingChallenge(supabase, "919876500003", "000000");
    assert.deepEqual(result, { ok: false, reason: "not_found" });
  }

  // 4. expired code
  {
    const { client, tables } = createFakeSupabase({ platform_staff_users: [{ user_id: "staff-3", role: "platform_admin", is_active: true }] });
    const supabase = client as any;
    const challenge = await createPairingChallenge(supabase, { authUserId: "staff-3", principalType: "staff", tenantId: null });
    (tables.whatsapp_channel_pairing_codes[0] as any).expires_at = new Date(Date.now() - 1000).toISOString();
    const result = await consumePairingChallenge(supabase, "919876500004", challenge.code);
    assert.deepEqual(result, { ok: false, reason: "expired" });
  }

  // 5. reused code
  {
    const { client } = createFakeSupabase({ platform_staff_users: [{ user_id: "staff-4", role: "platform_admin", is_active: true }] });
    const supabase = client as any;
    const challenge = await createPairingChallenge(supabase, { authUserId: "staff-4", principalType: "staff", tenantId: null });
    const first = await consumePairingChallenge(supabase, "919876500005", challenge.code);
    assert.equal(first.ok, true);
    const second = await consumePairingChallenge(supabase, "919876500005", challenge.code);
    assert.deepEqual(second, { ok: false, reason: "already_used" });
  }

  // 6. staff pairing requires true staff account — resolveWhatsAppPrincipal
  // re-verifies platform_staff_users at RESOLUTION time, not just the link row.
  {
    const { client } = createFakeSupabase({}); // no platform_staff_users row at all
    const supabase = client as any;
    const challenge = await createPairingChallenge(supabase, { authUserId: "not-really-staff", principalType: "staff", tenantId: null });
    const consumeResult = await consumePairingChallenge(supabase, "919876500006", challenge.code);
    assert.equal(consumeResult.ok, true, "consuming the code itself succeeds — it was already authorized when the code was issued");
    const resolution = await resolveWhatsAppPrincipal(supabase, "919876500006");
    assert.deepEqual(resolution, { status: "revoked" }, "but resolution fails live because there is no active platform_staff_users row");
  }

  // 7. client pairing requires tenant membership — same re-verification story.
  {
    const { client } = createFakeSupabase({}); // no tenant_members row
    const supabase = client as any;
    const challenge = await createPairingChallenge(supabase, { authUserId: "not-a-member", principalType: "client", tenantId: "tenant-z" });
    await consumePairingChallenge(supabase, "919876500007", challenge.code);
    const resolution = await resolveWhatsAppPrincipal(supabase, "919876500007");
    assert.deepEqual(resolution, { status: "revoked" });
  }

  // 8. phone uniqueness prevents ambiguous active principal
  {
    const { client, tables } = createFakeSupabase({
      platform_staff_users: [{ user_id: "staff-8a", role: "platform_admin", is_active: true }],
      tenant_members: [{ tenant_id: "tenant-8", user_id: "client-8b", role: "owner" }],
    });
    const supabase = client as any;
    const phone = "919876500008";
    const c1 = await createPairingChallenge(supabase, { authUserId: "staff-8a", principalType: "staff", tenantId: null });
    await consumePairingChallenge(supabase, phone, c1.code);
    const c2 = await createPairingChallenge(supabase, { authUserId: "client-8b", principalType: "client", tenantId: "tenant-8" });
    await consumePairingChallenge(supabase, phone, c2.code);

    const activeRows = (tables.whatsapp_channel_principals ?? []).filter((r) => r.normalized_phone === phone && r.status === "active");
    assert.equal(activeRows.length, 1, "re-linking a phone must revoke the previous active principal, never leave two active");
    assert.equal(activeRows[0].auth_user_id, "client-8b");

    const resolution = await resolveWhatsAppPrincipal(supabase, phone);
    assert.equal(resolution.status, "resolved");
    if (resolution.status === "resolved") assert.equal(resolution.principal.kind, "client");
  }

  // 9. revoke disables access
  {
    const { client } = createFakeSupabase({ platform_staff_users: [{ user_id: "staff-9", role: "platform_admin", is_active: true }] });
    const supabase = client as any;
    const challenge = await createPairingChallenge(supabase, { authUserId: "staff-9", principalType: "staff", tenantId: null });
    await consumePairingChallenge(supabase, "919876500009", challenge.code);

    const { revokeOwnWhatsAppPrincipal } = await import("../principals/repository.ts");
    const revoked = await revokeOwnWhatsAppPrincipal(supabase, "staff-9");
    assert.equal(revoked, true);

    const resolution = await resolveWhatsAppPrincipal(supabase, "919876500009");
    assert.deepEqual(resolution, { status: "unlinked" });
  }

  console.log("pairing.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
