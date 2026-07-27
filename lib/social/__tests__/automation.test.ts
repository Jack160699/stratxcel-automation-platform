// Tests requiresApproval() — the single function that decides whether the
// Agent may execute a tool automatically or must queue it for a human,
// against the stratxcel schema's social_automation_settings shape.
// Run with: node --experimental-strip-types lib/social/__tests__/automation.test.ts

import assert from "node:assert/strict";
import { requiresApproval, type AutomationSettingsRow } from "../repositories/automation.ts";

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
  // shadow_mode always forces approval, even under AUTOPILOT.
  assert.equal(requiresApproval("create_content_item", { ...BASE, shadow_mode: true }, 0.99), true);

  // MANUAL/SUPERVISED always require approval.
  assert.equal(requiresApproval("create_content_item", { ...BASE, autonomy_level: "MANUAL" }, 0.99), true);
  assert.equal(requiresApproval("create_content_item", { ...BASE, autonomy_level: "SUPERVISED" }, 0.99), true);

  // AUTOPILOT, tool not flagged, confidence above threshold -> auto.
  assert.equal(requiresApproval("create_content_item", BASE, 0.9), false);

  // AUTOPILOT, confidence below the configured minimum -> approval.
  assert.equal(requiresApproval("create_content_item", BASE, 0.5), true);

  // AUTOPILOT, tool explicitly flagged in require_approval_for -> approval
  // regardless of confidence.
  assert.equal(requiresApproval("publish_post", BASE, 0.99), true);

  console.log("automation.test.ts: ALL PASS (shadow gate, manual/supervised gate, auto-act, confidence floor, flagged tool)");
}

run();
