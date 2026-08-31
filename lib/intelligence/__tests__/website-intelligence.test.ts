// Run with: node --experimental-strip-types lib/intelligence/__tests__/website-intelligence.test.ts
//
// Regression lock for `isLikelyServiceNamePhrase`, root-caused via a real,
// live crawl of stratxcel.in itself (see
// docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md and the "Check Headings
// & Links for Services / Products" call site's own comment). Every
// rejected phrase below is a real H2 that was actually observed on the
// real production site being mis-extracted as a "service" before the fix.
import assert from "node:assert/strict";
import { isLikelyServiceNamePhrase } from "../website-intelligence.ts";

function run() {
  // Real false positives observed live -- must all be rejected.
  const realFalsePositives = [
    "What do you want to improve?",
    "Start with the result you need",
    "Understand → Diagnose → Execute → Improve",
    "Built around businesses like yours",
    "Not sure where to start? Start with clarity.",
    "Pick an outcome. Stratxcel connects the work behind it.",
  ];
  for (const phrase of realFalsePositives) {
    assert.equal(isLikelyServiceNamePhrase(phrase), false, `expected "${phrase}" to be rejected as narrative copy, not a service name`);
  }

  // Real service-name-shaped headings must still pass -- the fix must not
  // over-correct into rejecting legitimate short service labels.
  const realServiceNames = [
    "AC Repair",
    "Social Media Management",
    "WhatsApp Business Setup",
    "Website SEO Audit",
    "Hotel Revenue Management",
  ];
  for (const phrase of realServiceNames) {
    assert.equal(isLikelyServiceNamePhrase(phrase), true, `expected "${phrase}" to still be accepted as a real service name`);
  }

  console.log("website-intelligence.test.ts: service-name-phrase filter rejects real observed narrative copy, keeps real service names — PASS");
}

run();
