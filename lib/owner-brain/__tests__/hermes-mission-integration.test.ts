// REAL end-to-end test against the live production mission/Hermes
// pipeline (createAndEstimateMission -> compiler -> queue -> the same
// code path mission-worker itself uses), NOT a mock. Requires real
// Supabase credentials, so unlike every other owner-brain test this one
// is not part of `npm run test:owner-brain` (which must stay runnable
// with zero external state) — run it explicitly with:
//
//   node --env-file=.env.local --experimental-strip-types lib/owner-brain/__tests__/hermes-mission-integration.test.ts
//
// Creates ONE real mission under the real internal "stratxcel" tenant
// (OWNER_BRAIN_HERMES_TENANT_ID), verifies it compiled to the
// owner_operating_brain_context catalogue entry (zero cost,
// stratxcel-admin-growth profile) and reached QUEUED — i.e. it is
// genuinely sitting in the same queue mission-worker polls — then
// CANCELS it (QUEUED -> CANCELLED is a normal, audited state-machine
// transition) before any live Hermes network call would ever happen, and
// deletes the test rows it created. Never leaves the mission to actually
// run, and never touches any customer/tenant data.
import assert from "node:assert/strict";
import { createServiceClient, createAndEstimateMission, getMission, cancelMission, listMissionEvents } from "@stratxcel/missions";

async function run() {
  const tenantId = process.env.OWNER_BRAIN_HERMES_TENANT_ID;
  if (!tenantId) {
    console.log("hermes-mission-integration.test.ts: SKIPPED — OWNER_BRAIN_HERMES_TENANT_ID not set in this environment");
    return;
  }

  const supabase = createServiceClient();
  const testOwnerId = process.env.OWNER_BRAIN_TEST_OWNER_ID;
  assert.ok(testOwnerId, "OWNER_BRAIN_TEST_OWNER_ID must be set (a real stratxcel_admins user_id) to attribute the test mission correctly");

  const idempotencyKey = `owner-brain-live-test:${Date.now()}`;
  const goalText =
    "owner-operating-brain-context-review\n\nLive integration test — verifies the mission pipeline wiring only, cancelled immediately, never executed.";

  const mission = await createAndEstimateMission(supabase, {
    tenantId,
    createdBy: testOwnerId!,
    goalText,
    idempotencyKey,
  });

  try {
    assert.equal(mission.service_key, "owner_operating_brain_context", "goal text must compile to the dedicated owner-brain catalogue entry, not a billed service or generic fallback");
    assert.equal(mission.hermes_profile, "stratxcel-admin-growth", "must use the admin-growth profile, not a client-facing one");
    assert.equal(mission.estimated_cost_cents, 0, "owner-brain missions must never be billed");
    assert.equal(mission.tenant_id, tenantId, "must be scoped to the real internal tenant, never a client tenant");
    assert.equal(mission.state, "QUEUED", "a zero-cost mission must reach QUEUED automatically (same path every real mission takes)");

    const events = await listMissionEvents(supabase, mission.id);
    const eventTypes = events.map((e) => e.event_type);
    assert.ok(eventTypes.includes("compiled"), "compiler must record a 'compiled' event");
    assert.ok(eventTypes.includes("state_changed"), "every state transition must be an audited event, not a silent column update");

    // Re-fetch to prove this is really in the database, not just the returned object.
    const refetched = await getMission(supabase, mission.id);
    assert.equal(refetched.state, "QUEUED");

    console.log(`hermes-mission-integration.test.ts: ALL PASS (real mission ${mission.id} created under tenant ${tenantId}, compiled correctly, reached QUEUED, audited)`);
  } finally {
    // Cancel before any worker can claim it, then remove every row this
    // test created — a live smoke test must not leave residue.
    await cancelMission(supabase, { missionId: mission.id, cancelledBy: testOwnerId!, reason: "automated integration test cleanup" }).catch(() => {});
    await supabase.from("mission_events").delete().eq("mission_id", mission.id);
    await supabase.from("queue_jobs").delete().eq("idempotency_key", `mission:${mission.id}`);
    await supabase.from("missions").delete().eq("id", mission.id);
    console.log(`hermes-mission-integration.test.ts: cleanup complete — mission ${mission.id} and its events/queue job removed`);
  }
}

run().catch((err) => {
  console.error("hermes-mission-integration.test.ts: FAILED", err);
  process.exitCode = 1;
});
