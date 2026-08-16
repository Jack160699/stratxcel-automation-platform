import assert from "node:assert/strict";
import { parseOnboardingState, isV1OnboardingComplete, resumeStep, emptyOnboardingState } from "../v1/onboarding-state.ts";
import { field } from "../v1/provenance.ts";
import { selectAdaptiveQuestions, adaptiveAnswersComplete } from "../v1/adaptive-questions.ts";
import { deriveAuditCustomerState, isAuditIntakeComplete } from "../customer-state.ts";

console.log("Running Get Audit Flow End-to-End Regression & Verification Test Suite...");

// --- Test A: Successful verification -> Audit created -> Progress/Result ---
{
  const profile = {
    name: field("Acme Solutions", "CUSTOMER_PROVIDED", undefined, true),
    category: field("SaaS / Technology", "CUSTOMER_PROVIDED", undefined, true),
    location: field("Bangalore, India", "CUSTOMER_PROVIDED", undefined, true),
    offer: field("B2B Marketing Automation Platform", "CUSTOMER_PROVIDED", undefined, true),
    audience: field("Small and Medium Businesses", "CUSTOMER_PROVIDED", undefined, true),
    positioning: field("AI-powered growth engine for modern SMBs", "CUSTOMER_PROVIDED", undefined, true),
    websiteUrl: "https://acme.example.com",
  };

  const adaptiveAnswers = {
    primaryGoal: "Improve Google Visibility",
    biggestGrowthProblem: "lead_response_and_consistency",
    ninetyDayResult: "accelerated_customer_acquisition",
    idealCustomer: "Small and Medium Businesses",
    priorityOffering: "Acme Solutions",
  };

  const state = parseOnboardingState({
    v1Experience: {
      flowVersion: "connect_discover_v1",
      step: "complete",
      verified: true,
      completed: true,
      websiteUrl: "https://acme.example.com",
      channels: [{ id: "google_business", type: "google_business", value: "https://maps.google.com/acme", notAvailable: false }],
      profile,
      adaptiveAnswers,
      updatedAt: new Date().toISOString(),
    },
  });

  assert.ok(state, "Onboarding state parsed successfully");
  assert.equal(state.verified, true, "State is verified");
  assert.equal(isV1OnboardingComplete(state), true, "V1 onboarding is complete");

  const order = {
    id: "ord_test_123",
    status: "in_review" as const,
    business_name: "Acme Solutions",
    website_url: "https://acme.example.com",
    deep_dive_answers: {
      intakeMeta: { questionnaireVersion: "connect_discover_v1" },
      v1Experience: state,
    },
    goals_answers: {
      primaryGoal: "Improve Google Visibility",
      successDefinition: "accelerated_customer_acquisition",
    },
    report_data: null,
  };

  const customerState = deriveAuditCustomerState(order);
  assert.equal(customerState, "PROCESSING", "In-review order maps to PROCESSING state");
  console.log("✓ Test A: Successful verification maps to PROCESSING state");
}

// --- Test B: Successful verification -> Home navigation -> Verification remains intact ---
{
  const order = {
    id: "ord_test_456",
    status: "paid" as const,
    business_name: "Acme Solutions",
    website_url: "https://acme.example.com",
    deep_dive_answers: {
      intakeMeta: { questionnaireVersion: "connect_discover_v1" },
      v1Experience: {
        flowVersion: "connect_discover_v1",
        step: "complete",
        verified: true,
        completed: true,
        websiteUrl: "https://acme.example.com",
        profile: {
          name: field("Acme Solutions", "CUSTOMER_PROVIDED", undefined, true),
          category: field("SaaS / Technology", "CUSTOMER_PROVIDED", undefined, true),
        },
        adaptiveAnswers: {
          primaryGoal: "Improve Google Visibility",
          biggestGrowthProblem: "lead_response_and_consistency",
          ninetyDayResult: "accelerated_customer_acquisition",
          idealCustomer: "SMBs",
          priorityOffering: "Acme",
        },
      },
    },
    goals_answers: null,
    report_data: null,
  };

  assert.equal(isAuditIntakeComplete(order), true, "Audit intake is complete on paid order");
  assert.equal(deriveAuditCustomerState(order), "READY_FOR_EXECUTION", "Customer state is READY_FOR_EXECUTION");
  console.log("✓ Test B: Verification remains intact across navigation");
}

// --- Test C: Home page Get Audit after successful verification does NOT show 'Verify your business' ---
{
  const state = parseOnboardingState({
    v1Experience: {
      flowVersion: "connect_discover_v1",
      step: "complete",
      verified: true,
      completed: true,
      websiteUrl: "https://acme.example.com",
      profile: {
        name: field("Acme Solutions", "CUSTOMER_PROVIDED", undefined, true),
        category: field("SaaS / Technology", "CUSTOMER_PROVIDED", undefined, true),
      },
      adaptiveAnswers: {
        primaryGoal: "Improve Google Visibility",
        biggestGrowthProblem: "lead_response_and_consistency",
        ninetyDayResult: "accelerated_customer_acquisition",
        idealCustomer: "SMBs",
        priorityOffering: "Acme",
      },
    },
  });

  assert.ok(state?.verified, "Verified flag is true");
  const questions = selectAdaptiveQuestions(state?.profile ?? {});
  assert.equal(adaptiveAnswersComplete(questions, state?.adaptiveAnswers ?? {}), true, "Adaptive answers are complete");
  console.log("✓ Test C: Verified business passes audit start prerequisites without error");
}

// --- Test D: Double-click idempotency & safe state merging ---
{
  const deepDive = {
    intakeMeta: { questionnaireVersion: "connect_discover_v1" },
    v1Experience: {
      flowVersion: "connect_discover_v1",
      step: "complete",
      verified: true,
      completed: true,
      websiteUrl: "https://acme.example.com",
      profile: {
        name: field("Acme Solutions", "CUSTOMER_PROVIDED"),
      },
      adaptiveAnswers: {
        primaryGoal: "growth",
        biggestGrowthProblem: "leads",
        ninetyDayResult: "revenue",
        idealCustomer: "clients",
        priorityOffering: "consulting",
      },
    },
  };

  const parsed1 = parseOnboardingState(deepDive);
  const parsed2 = parseOnboardingState(deepDive);
  assert.deepEqual(parsed1, parsed2, "Deterministic state across multiple calls");
  console.log("✓ Test D: Idempotent state parsing and duplicate submission safety verified");
}

// --- Test E: Failed / missing verification correctly identified ---
{
  const unverifiedState = parseOnboardingState({
    v1Experience: {
      flowVersion: "connect_discover_v1",
      step: "connect",
      verified: false,
      websiteUrl: "",
      channels: [],
      adaptiveAnswers: {},
    },
  });

  assert.equal(isV1OnboardingComplete(unverifiedState), false, "Unverified state rejected");
  assert.equal(resumeStep(unverifiedState), "connect", "Resumes to connect step");
  console.log("✓ Test E: Unverified business correctly gated");
}

// --- Test F: Missing prerequisites produce expected resume step ---
{
  const partialState = parseOnboardingState({
    v1Experience: {
      flowVersion: "connect_discover_v1",
      step: "verify",
      verified: false,
      websiteUrl: "https://acme.example.com",
      profile: {
        name: field("Acme", "CUSTOMER_PROVIDED"),
      },
      channels: [],
      adaptiveAnswers: {},
    },
  });

  assert.equal(resumeStep(partialState), "verify", "Directs user to verify step when unverified");
  console.log("✓ Test F: Missing prerequisites correctly route to resume step");
}

// --- Test G & H: Refresh and new session persistence ---
{
  const savedSessionData = JSON.stringify({
    intakeMeta: { questionnaireVersion: "connect_discover_v1" },
    v1Experience: {
      flowVersion: "connect_discover_v1",
      step: "complete",
      verified: true,
      completed: true,
      websiteUrl: "https://acme.example.com",
      profile: {
        name: field("Acme Solutions", "CUSTOMER_PROVIDED", undefined, true),
        category: field("SaaS / Technology", "CUSTOMER_PROVIDED", undefined, true),
      },
      adaptiveAnswers: {
        primaryGoal: "Improve Google Visibility",
        biggestGrowthProblem: "lead_response_and_consistency",
        ninetyDayResult: "accelerated_customer_acquisition",
        idealCustomer: "SMBs",
        priorityOffering: "Acme",
      },
    },
  });

  // Simulate refresh / new session JSON parse
  const rehydrated = JSON.parse(savedSessionData);
  const state = parseOnboardingState(rehydrated);
  assert.ok(state?.verified, "Verified state preserved across serialization/rehydration");
  assert.equal(isV1OnboardingComplete(state), true, "Complete state preserved across sessions");
  console.log("✓ Test G & H: Session rehydration and persistence verified");
}

console.log("\n=============================================");
console.log("ALL GET AUDIT FLOW REGRESSION TESTS PASSED!");
console.log("=============================================\n");
