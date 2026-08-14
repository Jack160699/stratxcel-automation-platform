import assert from "node:assert/strict";
import { type BrandBrainContent } from "@stratxcel/brand-brain";
import { buildBrandBrainContentFromAuditIntake } from "../../../../lib/audit/brand-brain.ts";

function run() {
  console.log("Starting Business Profile Single Source of Truth test suite...");

  // 1. Initial Onboarding creates Canonical Brand Brain
  const initialBrandBrain: BrandBrainContent = {
    business_name: "XYZ Consultants",
    website_url: "https://xyzconsultants.in",
    location: "Bhilai, Chhattisgarh, India",
    industry: "Management Consulting",
    description: "Advisory and scaling for high-growth enterprises.",
    tone_of_voice: "Professional & authoritative",
    target_audience: "SMB owners and directors",
    products: [{ name: "Growth Audit", description: "" }],
    goals: ["more_customers", "higher_retention"],
  };

  // 2. Audit Intake reuses and augments the canonical profile without duplicate entry or losing fields
  const mockAuditOrder = {
    business_name: "XYZ Consultants",
    industry: "Management Consulting",
    website_url: "https://xyzconsultants.in",
    social_links: ["https://instagram.com/xyzconsultants", "https://facebook.com/xyzconsultants"],
    deep_dive_answers: {
      location: "Bhilai, Chhattisgarh, India",
      majorProducts: "Growth Strategy, Financial Advisory",
      customerSegments: ["business_owners", "enterprises"],
      biggestProblem: "inconsistent_sales",
    },
    goals_answers: {
      primaryGoal: "more_customers",
      successDefinition: "₹10L increase in quarterly revenue",
    },
  };

  const updatedBrain = buildBrandBrainContentFromAuditIntake(mockAuditOrder, initialBrandBrain);

  // Assert canonical fields preserved and enriched
  assert.equal(updatedBrain.business_name, "XYZ Consultants");
  assert.equal(updatedBrain.website_url, "https://xyzconsultants.in");
  assert.equal(updatedBrain.location, "Bhilai, Chhattisgarh, India");
  assert.equal(updatedBrain.industry, "Management Consulting");
  assert.equal(updatedBrain.tone_of_voice, "Professional & authoritative");
  assert.equal(updatedBrain.target_audience, "business_owners, enterprises");
  assert.ok(Array.isArray(updatedBrain.online_profiles));
  assert.ok(updatedBrain.online_profiles.includes("https://instagram.com/xyzconsultants"));
  assert.ok(updatedBrain.online_profiles.includes("https://facebook.com/xyzconsultants"));

  console.log("business-profile-ssot.test.ts: ALL PASS (canonical profile propagation, zero-duplicate entry, audit-intake enrichment)");
}

run();
