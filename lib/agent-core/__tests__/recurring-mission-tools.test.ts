// Run with: node --experimental-strip-types lib/agent-core/__tests__/recurring-mission-tools.test.ts
import assert from "node:assert/strict";
import {
  CREATE_RECURRING_MISSION_TEMPLATE_TOOL,
  LIST_RECURRING_MISSION_TEMPLATES_TOOL,
  SET_RECURRING_MISSION_TEMPLATE_ENABLED_TOOL,
  RUN_RECURRING_MISSION_TEMPLATES_NOW_TOOL,
} from "../recurring-mission-tools.ts";

const ctx = { principal: { kind: "staff" as const, channel: "admin_web" as const, authUserId: "user-1", tenantId: null, role: "platform_owner", permissions: ["agent:mutate:recurring_missions", "agent:read:recurring_missions"] }, supabase: {} as never };

function testCreateRejectsMissingOrInvalidFields() {
  return (async () => {
    const missingLabel = await CREATE_RECURRING_MISSION_TEMPLATE_TOOL.execute(ctx, { tenantId: "t-1", goalText: "find leads", cadence: "daily" });
    assert.equal((missingLabel as { outcome: string }).outcome, "FAILED");
    assert.equal((missingLabel as { reason: string }).reason, "missing_or_invalid_field");

    const badCadence = await CREATE_RECURRING_MISSION_TEMPLATE_TOOL.execute(ctx, { tenantId: "t-1", label: "L", goalText: "find leads", cadence: "hourly" });
    assert.equal((badCadence as { outcome: string }).outcome, "FAILED", "must reject a cadence outside daily/weekly/monthly, not silently coerce it");

    console.log("recurring-mission-tools.test.ts: create_recurring_mission_template rejects missing/invalid fields — PASS");
  })();
}

async function testInterpretOutcomeTreatsCreatedAsSuccessAndFailedAsFailure() {
  const created = CREATE_RECURRING_MISSION_TEMPLATE_TOOL.interpretOutcome?.({ outcome: "CREATED", templateId: "tpl-1" });
  assert.equal(created, null, "a real CREATED outcome must not be reported as a failure");
  const failed = CREATE_RECURRING_MISSION_TEMPLATE_TOOL.interpretOutcome?.({ outcome: "FAILED", reason: "missing_or_invalid_field" });
  assert.equal((failed as { status: string }).status, "failed");
  console.log("recurring-mission-tools.test.ts: create_recurring_mission_template's interpretOutcome distinguishes CREATED from FAILED — PASS");
}

async function testListReturnsEmptyWithoutHittingTheDbWhenTenantIdMissing() {
  const explodingSupabase = { from() { throw new Error("must not query the DB without a real tenantId"); } };
  const result = await LIST_RECURRING_MISSION_TEMPLATES_TOOL.execute({ ...ctx, supabase: explodingSupabase as never }, {});
  assert.deepEqual((result as { templates: unknown[] }).templates, []);
  console.log("recurring-mission-tools.test.ts: list_recurring_mission_templates refuses to query without a real tenantId — PASS");
}

async function testSetEnabledRejectsMissingFieldsBeforeTouchingTheDatabase() {
  // These two tools construct their own real service client internally
  // (createSupabaseServiceClient(), matching CREATE_CLIENT_TOOL's own
  // established pattern) rather than accept ctx.supabase as injectable --
  // so only the validation path that returns BEFORE that call is
  // standalone-testable without real Supabase credentials, matching
  // create-client-tool.test.ts's own precedent exactly.
  const missingTemplateId = await SET_RECURRING_MISSION_TEMPLATE_ENABLED_TOOL.execute(ctx, { enabled: false });
  assert.equal((missingTemplateId as { outcome: string }).outcome, "FAILED");
  assert.equal((missingTemplateId as { reason: string }).reason, "missing_or_invalid_field");

  const missingEnabled = await SET_RECURRING_MISSION_TEMPLATE_ENABLED_TOOL.execute(ctx, { templateId: "tpl-1" });
  assert.equal((missingEnabled as { outcome: string }).outcome, "FAILED");
  assert.equal((missingEnabled as { reason: string }).reason, "missing_or_invalid_field");

  console.log("recurring-mission-tools.test.ts: set_recurring_mission_template_enabled rejects missing fields before ever touching the database — PASS");
}

function testAllFourToolsRequireTheCorrectPermission() {
  const mutating = [CREATE_RECURRING_MISSION_TEMPLATE_TOOL, SET_RECURRING_MISSION_TEMPLATE_ENABLED_TOOL, RUN_RECURRING_MISSION_TEMPLATES_NOW_TOOL];
  for (const tool of mutating) {
    assert.equal(tool.requiredPermission, "agent:mutate:recurring_missions", `${tool.schema.name} must require the mutate permission, not merely read`);
    assert.equal(tool.mutating, true);
  }
  assert.equal(LIST_RECURRING_MISSION_TEMPLATES_TOOL.requiredPermission, "agent:read:recurring_missions");
  assert.equal(LIST_RECURRING_MISSION_TEMPLATES_TOOL.mutating, false);
  console.log("recurring-mission-tools.test.ts: all four tools require the correct real permission — PASS");
}

async function run() {
  await testCreateRejectsMissingOrInvalidFields();
  await testInterpretOutcomeTreatsCreatedAsSuccessAndFailedAsFailure();
  await testListReturnsEmptyWithoutHittingTheDbWhenTenantIdMissing();
  await testSetEnabledRejectsMissingFieldsBeforeTouchingTheDatabase();
  testAllFourToolsRequireTheCorrectPermission();
  console.log("recurring-mission-tools.test.ts (lib/agent-core): ALL PASS");
}

run();
