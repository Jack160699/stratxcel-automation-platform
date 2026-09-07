// Run with: node --experimental-strip-types apps/hermes-gateway/src/__tests__/connector-not-authorized-error.test.ts
//
// Verifies ConnectorNotAuthorizedError gives the model a real, actionable
// recovery instruction for the one denial reason that has a live recovery
// path within the same mission run (native-adapter.ts already catches an
// invokeTool throw as a per-call tool-result error and already treats a
// request_approval call as a real AWAITING_APPROVAL stop) -- and stays a
// plain, non-actionable denial for every other reason, where an Admin
// action is genuinely required first and no in-mission retry can help.
import assert from "node:assert/strict";
import { ConnectorNotAuthorizedError } from "../tool-handlers.ts";

function testApprovalRequiredDenialTellsTheModelToCallRequestApprovalAndRetry() {
  const err = new ConnectorNotAuthorizedError("generate_image", "autonomy_approval_required_not_yet_auto_routed");
  assert.match(err.message, /call request_approval/i, "must explicitly name the real tool the model should call");
  assert.match(err.message, /retry this exact tool call once it is approved/i, "must tell the model the original call is retryable after approval, not a dead end");
  assert.match(err.message, /Do not give up or fabricate a result/, "must explicitly forbid the two failure modes this is guarding against");
  console.log("connector-not-authorized-error.test.ts: an approval_required denial tells the model to call request_approval and retry — PASS");
}

function testEveryOtherDenialReasonStaysPlainWithNoFalseRecoveryPromise() {
  const reasons = ["connector_not_connected", "connector_unhealthy:error", "capability_not_assigned", "autonomy_disabled"];
  for (const reason of reasons) {
    const err = new ConnectorNotAuthorizedError("check_domain_status", reason);
    assert.doesNotMatch(err.message, /request_approval/, `${reason} has no live in-mission recovery -- must never falsely suggest calling request_approval will help`);
    assert.match(err.message, new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the real reason string must still be present verbatim");
  }
  console.log("connector-not-authorized-error.test.ts: every other denial reason stays plain, with no false recovery promise — PASS");
}

function run() {
  testApprovalRequiredDenialTellsTheModelToCallRequestApprovalAndRetry();
  testEveryOtherDenialReasonStaysPlainWithNoFalseRecoveryPromise();
  console.log("connector-not-authorized-error.test.ts (@stratxcel/hermes-gateway): ALL PASS");
}

run();
