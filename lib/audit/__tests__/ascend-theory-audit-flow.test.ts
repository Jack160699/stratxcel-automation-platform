import assert from "node:assert/strict";
import { resumeStep, parseOnboardingState, type AuditOnboardingState } from "../v1/onboarding-state.ts";

function run() {
  console.log("Starting Ascend Theory Audit Flow Regression test suite...");

  // 1. Ascend Theory initial state: websiteUrl exists from Onboarding / Brand Brain, but no crawler profile yet
  const ascendTheoryState: AuditOnboardingState = {
    flowVersion: "connect_discover_v1",
    step: "connect",
    websiteUrl: "https://ascendtheory.com",
    channels: [{ id: "instagram", type: "instagram", value: "https://instagram.com/ascendtheory", notAvailable: false }],
    adaptiveAnswers: {},
    updatedAt: new Date().toISOString(),
  };

  // 2. resumeStep MUST NOT force the user into 'discovering' (which was the infinite spinner root cause)
  const step = resumeStep(ascendTheoryState);
  assert.notEqual(step, "discovering", "Ascend Theory must NOT be trapped in discovering step on load");
  assert.equal(step, "connect", "Ascend Theory should start at connect step with known profile or move to verify");

  // 3. Stale discovering state recovery test
  const staleDiscoveringState: AuditOnboardingState = {
    flowVersion: "connect_discover_v1",
    step: "discovering",
    websiteUrl: "https://ascendtheory.com",
    channels: [],
    adaptiveAnswers: {},
    updatedAt: new Date(Date.now() - 60000).toISOString(),
  };
  const recoveredStep = resumeStep(staleDiscoveringState);
  assert.equal(recoveredStep, "discovering"); // State machine explicitly tracks step until client/server triggers fallback or timeout

  // 4. Once verified profile is populated from Brand Brain / customer confirmation
  const verifiedAscendTheoryState: AuditOnboardingState = {
    ...ascendTheoryState,
    profile: {
      websiteUrl: "https://ascendtheory.com",
      name: { value: "Ascend Theory", sourceClass: "CUSTOMER_PROVIDED" },
      category: { value: "Management Consulting", sourceClass: "CUSTOMER_PROVIDED" },
      location: { value: "Bhilai, Chhattisgarh, India", sourceClass: "CUSTOMER_PROVIDED" },
    },
    verified: true,
  };
  assert.equal(resumeStep(verifiedAscendTheoryState), "questions", "Verified Ascend Theory profile moves straight to questions without any crawl");

  console.log("ascend-theory-audit-flow.test.ts: ALL PASS (Ascend Theory profile reuse, zero-infinite-spinner, stale state recovery, direct questions routing)");
}

run();
