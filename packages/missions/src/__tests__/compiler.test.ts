// Run with: node --experimental-strip-types packages/missions/src/__tests__/compiler.test.ts
import assert from "node:assert/strict";
import { compileGoalToMission } from "../compiler.ts";

function run() {
  const campaign = compileGoalToMission("Can you run an Instagram campaign for our new product launch?");
  assert.equal(campaign.serviceKey, "social_campaign");
  assert.equal(campaign.matched, true);
  assert.equal(campaign.hermesProfile, "stratxcel-content");
  assert.ok(campaign.estimatedCostCents > 0);

  const seo = compileGoalToMission("I want an SEO audit of our site");
  assert.equal(seo.serviceKey, "seo_audit");

  const website = compileGoalToMission("Build me a new landing page for the spring sale");
  assert.equal(website.serviceKey, "website_landing_page");

  const unmatched = compileGoalToMission("Please help me plan my cousin's wedding");
  assert.equal(unmatched.serviceKey, "custom_mission");
  assert.equal(unmatched.matched, false);
  assert.equal(unmatched.estimatedCostCents, 0);
  assert.equal(unmatched.hermesProfile, "stratxcel-orchestrator");

  console.log("compiler.test.ts (@stratxcel/missions): ALL PASS");
}

run();
