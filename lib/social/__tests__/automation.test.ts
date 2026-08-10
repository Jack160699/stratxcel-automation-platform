// Tests requiresApproval() — the single function that decides whether the
// Agent may execute a tool automatically or must queue it for a human,
// against the stratxcel schema's social_automation_settings shape.
// Run with: node --experimental-strip-types lib/social/__tests__/automation.test.ts

import assert from "node:assert/strict";
import { requiresApproval, type AutomationSettingsRow } from "../repositories/automation.ts";
import { externalMutationDecision } from "../shadow-gate.ts";

const BASE: AutomationSettingsRow = {
  owner_id: "test-owner",
  autonomy_level: "AUTOPILOT",
  shadow_mode: false,
  dry_run: false,
  autopilot_enabled: true,
  qa_threshold: 85,
  rolling_plan_days: 14,
  monthly_budget_cents: 0,
  monthly_ceiling_cents: 0,
  per_content_max_cents: 0,
  strategy_mix: {},
  require_approval_for: ["publish_post"],
  min_confidence_to_autoact: 0.7,
  updated_at: "",
};

function run() {
  // SHADOW is independent: AUTOPILOT may do safe internal work.
  assert.equal(requiresApproval("create_campaign", { ...BASE, shadow_mode: true }, 0.99), false);
  assert.equal(externalMutationDecision(true, "publish_post").allowed, false);
  assert.equal(externalMutationDecision(false, "publish_post").allowed, true);

  // MANUAL/SUPERVISED always require approval — tested against
  // create_campaign, a genuinely organizational (not low-risk-preparation)
  // action still subject to the normal autonomy gate. Low-risk content
  // preparation (create_content_item et al.) is covered separately below —
  // it intentionally bypasses this gate regardless of autonomy level.
  assert.equal(requiresApproval("create_campaign", { ...BASE, autonomy_level: "MANUAL" }, 0.99), true);
  assert.equal(requiresApproval("create_campaign", { ...BASE, autonomy_level: "SUPERVISED" }, 0.99), true);

  // AUTOPILOT, tool not flagged, confidence above threshold -> auto.
  assert.equal(requiresApproval("create_campaign", BASE, 0.9), false);

  // AUTOPILOT, confidence below the configured minimum -> approval.
  assert.equal(requiresApproval("create_campaign", BASE, 0.5), true);

  // AUTOPILOT, tool explicitly flagged in require_approval_for -> approval
  // regardless of confidence.
  assert.equal(requiresApproval("publish_post", BASE, 0.99), true);

  // The Automations UI's "Require approval before publishing" checkbox
  // stores the human-facing action name "publish_post" — it must actually
  // gate the real publish-capable tools, not silently no-op because no tool
  // is literally named "publish_post". Without the alias this entire block
  // would incorrectly be `false`.
  for (const tool of ["schedule_post", "execute_youtube_verification", "execute_private_youtube_verification"]) {
    assert.equal(requiresApproval(tool, BASE, 0.99), true, `"${tool}" must be gated by the publish_post approval toggle`);
  }
  // The toggle is off (not in require_approval_for) -> AUTOPILOT + high confidence auto-acts as normal.
  const noApprovalRequired = { ...BASE, require_approval_for: [] };
  assert.equal(requiresApproval("schedule_post", noApprovalRequired, 0.99), false);
  // A tool unrelated to publishing is never swept in by the publish_post alias.
  assert.equal(requiresApproval("create_content_item", BASE, 0.99), false);

  // Risk-based approval (single-approval publishing flow follow-up): a
  // bounded publishing request should not interrupt the user separately for
  // internal content preparation, regardless of autonomy level — only the
  // actual external publish action (and organizational/settings actions)
  // remain subject to the normal autonomy/confidence gate.
  const manualSettings: AutomationSettingsRow = { ...BASE, autonomy_level: "MANUAL" };
  for (const lowRiskTool of [
    "create_content_item",
    "create_content_variant",
    "attach_media_to_content",
    "update_content_variant",
    "cancel_scheduled_post",
  ]) {
    assert.equal(requiresApproval(lowRiskTool, manualSettings, 0.99), false, `${lowRiskTool} must never block on approval, even under MANUAL`);
  }
  // Genuinely external/organizational actions still respect MANUAL.
  assert.equal(requiresApproval("schedule_post", manualSettings, 0.99), true);
  assert.equal(requiresApproval("create_campaign", manualSettings, 0.99), true);
  assert.equal(requiresApproval("set_operating_mode", manualSettings, 0.99), true);
  // An owner's explicit customization still overrides the low-risk default.
  const explicitOverride = { ...manualSettings, require_approval_for: ["publish_post", "create_content_variant"] };
  assert.equal(requiresApproval("create_content_variant", explicitOverride, 0.99), true, "an explicit require_approval_for entry must win over the low-risk default");

  console.log("automation.test.ts: ALL PASS (independent shadow gate, manual/supervised gate, auto-act, confidence floor, flagged tool, publish_post alias, low-risk preparation bypass)");
}

run();
