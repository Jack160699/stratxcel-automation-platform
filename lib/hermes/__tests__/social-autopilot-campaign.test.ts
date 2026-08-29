// Run with: node --experimental-strip-types lib/hermes/__tests__/social-autopilot-campaign.test.ts
//
// HERMES AUTONOMOUS SOCIAL AUTOPILOT mission (Sections 3, 5, 44, 77, 79):
// proves the specialist-role taxonomy matches the live DB CHECK constraint
// exactly, that recordCampaignTask() is genuinely best-effort (a write
// failure must never throw into the real pipeline it's observing), and that
// buildCustomerPsychologyProfile() structures REAL Brand Brain audience data
// (never fabricates pain points an audience doesn't actually have).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  HERMES_SOCIAL_SPECIALIST_ROLES,
  recordCampaignTask,
  buildCustomerPsychologyProfile,
} from "../social-autopilot-campaign.ts";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "20260830070000_hermes_social_autopilot_campaign_tasks.sql"),
  "utf8"
);

function testSpecialistRolesMatchTheLiveCheckConstraint() {
  // Every role the module exports must appear inside the migration's own
  // agent_role CHECK constraint literal list -- the module and the DB schema
  // must never silently drift apart.
  for (const role of HERMES_SOCIAL_SPECIALIST_ROLES) {
    assert.match(migration, new RegExp(`'${role}'`), `agent_role CHECK constraint must include '${role}'`);
  }
  assert.equal(HERMES_SOCIAL_SPECIALIST_ROLES.length, 14, "Hermes mission Section 3 specifies 14 specialist roles");
  console.log("social-autopilot-campaign.test.ts: specialist roles match the live migration's CHECK constraint — PASS");
}

async function testRecordCampaignTaskIsBestEffortAndNeverThrows() {
  let insertedRow: Record<string, unknown> | null = null;
  const fakeThrowingService = {
    from(table: string) {
      assert.equal(table, "social_autopilot_campaign_tasks");
      return {
        insert(row: Record<string, unknown>) {
          insertedRow = row;
          throw new Error("simulated DB outage");
        },
      };
    },
  } as never;

  // Must not throw even though the underlying insert does -- observability
  // failing must never take down the real generation pipeline calling it.
  await recordCampaignTask(fakeThrowingService, {
    authorizationId: "auth-1",
    tenantId: "tenant-1",
    queueItemId: "queue-1",
    agentRole: "creative_brief",
    status: "COMPLETED",
    output: { concept: "test concept" },
  });
  assert.ok(insertedRow, "insert must actually have been attempted");
  assert.equal((insertedRow as Record<string, unknown>).agent_role, "creative_brief");
  assert.equal((insertedRow as Record<string, unknown>).status, "COMPLETED");
  console.log("social-autopilot-campaign.test.ts: recordCampaignTask never throws even when the write fails — PASS");
}

async function testRecordCampaignTaskWritesRealFieldsWhenSucceeding() {
  let insertedRow: Record<string, unknown> | null = null;
  const fakeService = {
    from(table: string) {
      assert.equal(table, "social_autopilot_campaign_tasks");
      return {
        async insert(row: Record<string, unknown>) {
          insertedRow = row;
          return { data: null, error: null };
        },
      };
    },
  } as never;

  await recordCampaignTask(fakeService, {
    authorizationId: "auth-2",
    tenantId: "tenant-2",
    queueItemId: "queue-2",
    agentRole: "visual_generation",
    status: "FAILED",
    attempt: 2,
    failureReason: "net_new_generation_failed: rate limited",
  });
  const row = insertedRow as unknown as Record<string, unknown>;
  assert.equal(row.authorization_id, "auth-2");
  assert.equal(row.tenant_id, "tenant-2");
  assert.equal(row.queue_item_id, "queue-2");
  assert.equal(row.agent_role, "visual_generation");
  assert.equal(row.status, "FAILED");
  assert.equal(row.attempt, 2);
  assert.equal(row.failure_reason, "net_new_generation_failed: rate limited");
  console.log("social-autopilot-campaign.test.ts: recordCampaignTask writes the real field shape the migration expects — PASS");
}

function testCustomerPsychologyProfileStructuresRealDataOnly() {
  const profiles = buildCustomerPsychologyProfile([
    { name: "Weekend Travelers", description: "Families driving out of town", pain_points: "No reliable car when visiting; airport pickup is expensive.\nUnfamiliar city driving is stressful." },
    { name: "", pain_points: "should be excluded -- no name" },
    { name: "Business Travelers" }, // no pain_points at all -- must yield [], never invented ones
  ]);
  assert.equal(profiles.length, 2, "an audience with no name must be excluded, never silently kept");
  assert.equal(profiles[0].audienceLabel, "Weekend Travelers");
  assert.deepEqual(profiles[0].painPoints, [
    "No reliable car when visiting",
    "airport pickup is expensive",
    "Unfamiliar city driving is stressful",
  ]);
  assert.equal(profiles[1].audienceLabel, "Business Travelers");
  assert.deepEqual(profiles[1].painPoints, [], "an audience with no pain_points text must yield an empty array, never a fabricated one");
  console.log("social-autopilot-campaign.test.ts: buildCustomerPsychologyProfile structures only real Brand Brain data — PASS");
}

async function run() {
  testSpecialistRolesMatchTheLiveCheckConstraint();
  await testRecordCampaignTaskIsBestEffortAndNeverThrows();
  await testRecordCampaignTaskWritesRealFieldsWhenSucceeding();
  testCustomerPsychologyProfileStructuresRealDataOnly();
  console.log("social-autopilot-campaign.test.ts: ALL PASS");
}

run();
