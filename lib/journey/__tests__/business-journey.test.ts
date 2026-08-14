import assert from "node:assert/strict";
import { deriveBusinessJourney, CANONICAL_MILESTONES } from "../business-journey.ts";

async function testBusinessJourney() {
  console.log("Running Business Journey & Milestone derivation test...");

  // Test 1: Brand new account with no website
  const newAccountJourney = deriveBusinessJourney({
    hasWebsite: false,
    websiteUrl: null,
    brandBrainVersion: 0,
    socialAccountsCount: 0,
    confirmedSocialsCount: 0,
    hasAuditOrder: false,
    hasReportData: false,
    whatsappConnected: false,
    crmLeadsCount: 0,
    hasAutomations: false,
    hasActivePlan: false,
  });

  assert.equal(newAccountJourney.currentStage, "connect", "Initial stage must be 'connect'");
  assert.equal(newAccountJourney.stages[0].status, "In progress", "Connect stage must be in progress");
  assert.equal(newAccountJourney.unlockedMilestones.length, 0, "No milestones unlocked initially");
  assert.ok(newAccountJourney.overallProgressPercent < 15, "Progress must start low for empty state");

  // Test 2: Website connected & discovered with Brand Brain
  const discoveredJourney = deriveBusinessJourney({
    hasWebsite: true,
    websiteUrl: "https://stratxcel.in",
    brandBrainVersion: 1,
    socialAccountsCount: 0,
    confirmedSocialsCount: 0,
    hasAuditOrder: false,
    hasReportData: false,
    whatsappConnected: false,
    crmLeadsCount: 0,
    hasAutomations: false,
    hasActivePlan: false,
  });

  assert.equal(discoveredJourney.stages[0].status, "Complete", "Connect stage must be complete");
  assert.equal(discoveredJourney.stages[1].status, "Complete", "Discover stage must be complete");
  assert.equal(discoveredJourney.currentStage, "verify", "Current stage must advance to 'verify'");
  assert.equal(discoveredJourney.unlockedMilestones.length, 2, "Must unlock 2 milestones");
  assert.equal(discoveredJourney.unlockedMilestones[0].id, "BUSINESS_CONNECTED");
  assert.equal(discoveredJourney.unlockedMilestones[1].id, "BUSINESS_DISCOVERED");

  // Test 3: Verified channels & Audit generated
  const builtJourney = deriveBusinessJourney({
    hasWebsite: true,
    websiteUrl: "https://stratxcel.in",
    brandBrainVersion: 1,
    socialAccountsCount: 2,
    confirmedSocialsCount: 2,
    hasAuditOrder: true,
    auditOrderStatus: "completed",
    hasReportData: true,
    reportKind: "AUDIT",
    whatsappConnected: true,
    crmLeadsCount: 5,
    hasAutomations: true,
    hasActivePlan: true,
  });

  assert.equal(builtJourney.stages[0].status, "Complete");
  assert.equal(builtJourney.stages[1].status, "Complete");
  assert.equal(builtJourney.stages[2].status, "Complete");
  assert.equal(builtJourney.stages[3].status, "Complete");
  assert.equal(builtJourney.stages[4].status, "Complete");
  assert.equal(builtJourney.stages[5].status, "Complete");
  assert.equal(builtJourney.currentStage, "optimize");
  assert.equal(builtJourney.overallProgressPercent, 100);
  assert.ok(builtJourney.unlockedMilestones.length >= 7);
  assert.equal(builtJourney.latestAchievement?.id, "FIRST_AUTOMATION_COMPLETE");

  console.log("business-journey.test.ts: ALL PASS");
}

testBusinessJourney().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
