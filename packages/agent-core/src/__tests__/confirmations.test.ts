// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/confirmations.test.ts
import assert from "node:assert/strict";
import { createFakeSupabase } from "./support/fake-supabase.ts";
import { createActionConfirmation, consumeActionConfirmation, cancelActionConfirmation } from "../confirmations/repository.ts";
import { decideMutationPolicy } from "../policy/channel-policy.ts";

async function run() {
  // --- Channel mutation policy (covers test items 27, 34 at the policy level) ---
  assert.deepEqual(decideMutationPolicy("whatsapp", "read"), { action: "execute" });
  assert.deepEqual(decideMutationPolicy("whatsapp", "low_mutation"), { action: "confirm_required" });
  assert.deepEqual(decideMutationPolicy("whatsapp", "external_mutation"), { action: "dashboard_only" });
  assert.deepEqual(decideMutationPolicy("whatsapp", "high_risk"), { action: "dashboard_only" });
  assert.deepEqual(decideMutationPolicy("admin_web", "high_risk"), { action: "dashboard_only" }, "high_risk is never executable on any channel");

  // 28. mutation creates confirmation, not executed
  {
    const { client, tables } = createFakeSupabase();
    const supabase = client as any;
    const confirmation = await createActionConfirmation(supabase, {
      authUserId: "staff-1",
      channel: "whatsapp",
      actionName: "update_lead_status",
      normalizedInput: { leadId: "lead-1", status: "CONTACTED" },
    });
    assert.match(confirmation.code, /^\d{6}$/);
    const row = tables.agent_action_confirmations[0] as any;
    assert.notEqual(row.confirmation_hash, confirmation.code, "plaintext confirmation code must never be stored");
    assert.equal(row.used_at, undefined, "not executed yet");
  }

  // 29 + 33. exact confirmation executes exactly once
  {
    const { client } = createFakeSupabase();
    const supabase = client as any;
    const confirmation = await createActionConfirmation(supabase, {
      authUserId: "staff-2",
      channel: "whatsapp",
      actionName: "update_lead_status",
      normalizedInput: { leadId: "lead-2", status: "CONTACTED" },
    });

    const result = await consumeActionConfirmation(supabase, "staff-2", confirmation.code);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.actionName, "update_lead_status");
      assert.deepEqual(result.normalizedInput, { leadId: "lead-2", status: "CONTACTED" });
    }
  }

  // 30. wrong confirmation rejected
  {
    const { client } = createFakeSupabase();
    const supabase = client as any;
    await createActionConfirmation(supabase, {
      authUserId: "staff-3",
      channel: "whatsapp",
      actionName: "update_lead_status",
      normalizedInput: {},
    });
    const result = await consumeActionConfirmation(supabase, "staff-3", "000000");
    assert.deepEqual(result, { ok: false, reason: "not_found" });
  }

  // 31. expired rejected
  {
    const { client, tables } = createFakeSupabase();
    const supabase = client as any;
    const confirmation = await createActionConfirmation(supabase, {
      authUserId: "staff-4",
      channel: "whatsapp",
      actionName: "update_lead_status",
      normalizedInput: {},
    });
    (tables.agent_action_confirmations[0] as any).expires_at = new Date(Date.now() - 1000).toISOString();
    const result = await consumeActionConfirmation(supabase, "staff-4", confirmation.code);
    assert.deepEqual(result, { ok: false, reason: "expired" });
  }

  // 32 + 43. used confirmation rejected / confirmed action cannot execute twice
  {
    const { client } = createFakeSupabase();
    const supabase = client as any;
    const confirmation = await createActionConfirmation(supabase, {
      authUserId: "staff-5",
      channel: "whatsapp",
      actionName: "update_lead_status",
      normalizedInput: {},
    });
    const first = await consumeActionConfirmation(supabase, "staff-5", confirmation.code);
    assert.equal(first.ok, true);
    const second = await consumeActionConfirmation(supabase, "staff-5", confirmation.code);
    assert.deepEqual(second, { ok: false, reason: "already_used" });
  }

  // Confirmation bound to the exact principal — a different (even linked)
  // sender cannot consume someone else's confirmation.
  {
    const { client } = createFakeSupabase();
    const supabase = client as any;
    const confirmation = await createActionConfirmation(supabase, {
      authUserId: "staff-6",
      channel: "whatsapp",
      actionName: "update_lead_status",
      normalizedInput: {},
    });
    const result = await consumeActionConfirmation(supabase, "someone-else", confirmation.code);
    assert.deepEqual(result, { ok: false, reason: "principal_mismatch" });
  }

  // CANCEL <code>
  {
    const { client } = createFakeSupabase();
    const supabase = client as any;
    const confirmation = await createActionConfirmation(supabase, {
      authUserId: "staff-7",
      channel: "whatsapp",
      actionName: "update_lead_status",
      normalizedInput: {},
    });
    const cancelled = await cancelActionConfirmation(supabase, "staff-7", confirmation.code);
    assert.equal(cancelled.ok, true);
    const afterCancel = await consumeActionConfirmation(supabase, "staff-7", confirmation.code);
    assert.deepEqual(afterCancel, { ok: false, reason: "cancelled" });
  }

  console.log("confirmations.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
