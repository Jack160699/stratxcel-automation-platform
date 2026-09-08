// Run with: node --experimental-strip-types lib/identity/__tests__/industry-options.test.ts
import assert from "node:assert/strict";
import { INDUSTRY_OPTIONS, mapGooglePlaceToIndustryOption } from "../industry-options.ts";

function run() {
  console.log("Running StratXcel Industry Options Mapping Test Suite...\n");

  // --- 1. Real Google place types map to a real dropdown option ----------
  assert.equal(mapGooglePlaceToIndustryOption(["health_consultant", "point_of_interest", "establishment"]), "Healthcare & Clinics");
  assert.equal(mapGooglePlaceToIndustryOption(["restaurant", "food", "point_of_interest"]), "Food & Dining (Restaurants / Cafes)");
  assert.equal(mapGooglePlaceToIndustryOption(["beauty_salon", "point_of_interest"]), "Salon & Beauty Services");
  assert.equal(mapGooglePlaceToIndustryOption(["real_estate_agency"]), "Real Estate & Architecture");
  assert.equal(mapGooglePlaceToIndustryOption(["gym", "point_of_interest"]), "Fitness & Wellness");
  assert.equal(mapGooglePlaceToIndustryOption(["car_repair"]), "Automotive & Repair");
  assert.equal(mapGooglePlaceToIndustryOption(["school"]), "Education & Coaching");
  assert.equal(mapGooglePlaceToIndustryOption(["lawyer"]), "Professional Services & Consulting");
  assert.equal(mapGooglePlaceToIndustryOption(["software_company"]), "SaaS & Technology");

  // --- 2. Every returned value is a real, visible dropdown option ---------
  const allResults = [
    mapGooglePlaceToIndustryOption(["health_consultant"]),
    mapGooglePlaceToIndustryOption(["hotel", "lodging", "point_of_interest"]), // real, live-tested case: no direct match
    mapGooglePlaceToIndustryOption(null),
    mapGooglePlaceToIndustryOption([]),
    mapGooglePlaceToIndustryOption(["completely_made_up_type"]),
  ];
  for (const r of allResults) {
    assert.ok((INDUSTRY_OPTIONS as readonly string[]).includes(r), `"${r}" must be a real option the dropdown actually renders`);
  }

  // --- 3. Never returns null/blank -- always a real, honest fallback ------
  assert.equal(mapGooglePlaceToIndustryOption(["hotel", "lodging"]), "General Business", "an unmapped real category (no direct dropdown match) must fall back to the honest General Business catch-all, never blank or invented");
  assert.equal(mapGooglePlaceToIndustryOption(undefined), "General Business");

  console.log("✓ Real Google place types map to real dropdown options; unmatched types honestly fall back to General Business, never blank or invented");
  console.log("\n===============================================");
  console.log("ALL INDUSTRY OPTIONS MAPPING TESTS PASSED!");
  console.log("===============================================");
}

run();
