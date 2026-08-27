// Run with: node --experimental-strip-types lib/social/__tests__/creative-brief.test.ts
import assert from "node:assert/strict";
import { buildCreativeBrief, formatCreativeBriefForPrompt, selectObjective } from "../creative-brief.ts";

const BASE = {
  platform: "instagram",
  mediaType: "image" as const,
  availablePillars: ["Product spotlight", "Customer story", "Behind the scenes"],
  objective: "ENGAGEMENT" as const,
  verifiedFacts: [],
};

function testThrowsWithNoPillars() {
  assert.throws(() => buildCreativeBrief({ ...BASE, businessName: "Test Co", industryText: null, availablePillars: [] }));
  console.log("creative-brief.test.ts: throws when no content pillars are available — PASS");
}

function testRestaurantAndClinicProduceMaterialllyDifferentBriefs() {
  const restaurant = buildCreativeBrief({ ...BASE, businessName: "Coastal Kitchen", industryText: "Restaurant" });
  const clinic = buildCreativeBrief({ ...BASE, businessName: "Sunrise Dental", industryText: "Dental clinic" });
  assert.notEqual(restaurant.industry, clinic.industry);
  assert.notEqual(restaurant.visualDirection, clinic.visualDirection);
  assert.notEqual(restaurant.concept, clinic.concept);
  assert.notEqual(restaurant.cta, clinic.cta);
  // The imagery direction must reference something business-context-specific,
  // not literally identical text with only the business name swapped.
  assert.ok(restaurant.imageryDirection.includes("Coastal Kitchen"));
  assert.ok(clinic.imageryDirection.includes("Sunrise Dental"));
  console.log("creative-brief.test.ts: restaurant vs clinic produce materially different briefs — PASS");
}

function testAllSevenReferenceIndustriesDifferFromEachOther() {
  const industries: Array<[string, string]> = [
    ["Restaurant", "restaurant"], ["Hair salon", "salon"], ["Gym", "gym"], ["Dental clinic", "clinic"],
    ["Retail store", "retail"], ["Real estate developer", "real_estate"], ["Plumbing service", "local_service"],
  ];
  const briefs = industries.map(([industryText]) => buildCreativeBrief({ ...BASE, businessName: "Acme", industryText }));
  const conceptSet = new Set(briefs.map((b) => b.concept));
  const visualSet = new Set(briefs.map((b) => b.visualDirection));
  assert.equal(conceptSet.size, briefs.length, "every industry's first-pick concept must differ from the others");
  assert.equal(visualSet.size, briefs.length, "every industry's visual direction must differ from the others");
  console.log("creative-brief.test.ts: all 7 reference industries produce distinct concepts/visual direction — PASS");
}

function testContentPillarRotatesAwayFromRecentlyUsed() {
  const brief = buildCreativeBrief({
    ...BASE,
    businessName: "Acme",
    industryText: "Retail",
    recentPillars: ["Product spotlight", "Product spotlight", "Customer story"],
  });
  assert.equal(brief.contentPillar, "Behind the scenes", "the pillar never used recently must be chosen over ones used repeatedly");
  console.log("creative-brief.test.ts: content pillar selection avoids recently-used pillars — PASS");
}

function testConceptRotatesAwayFromRecentlyUsed() {
  const first = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Restaurant" });
  const second = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Restaurant", recentConcepts: [first.concept] });
  assert.notEqual(second.concept, first.concept, "the same industry must not repeat its most recent concept");
  console.log("creative-brief.test.ts: creative concept rotates away from the most recently used one — PASS");
}

function testVerifiedFactsFlowThroughUnmodified() {
  const facts = ["Verified business address (Google Business Profile): 12 MG Road, Bengaluru", "Target audience: Young professionals"];
  const brief = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Retail", verifiedFacts: facts });
  assert.deepEqual(brief.verifiedFacts, facts);
  console.log("creative-brief.test.ts: verified facts pass through into the brief unmodified — PASS");
}

function testNoVerifiedFactsStillProducesACoherentBrief() {
  const brief = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Retail", verifiedFacts: [] });
  assert.equal(brief.verifiedFacts.length, 0);
  assert.ok(brief.concept.length > 0 && brief.cta.length > 0 && brief.visualDirection.length > 0, "a brief must still be coherent with zero verified facts");
  console.log("creative-brief.test.ts: zero verified facts still produces a coherent, non-empty brief — PASS");
}

function testAvoidListIncludesFabricationGuardrail() {
  const brief = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Retail" });
  assert.ok(brief.avoid.some((a) => a.includes("verifiedFacts")), "the avoid list must explicitly warn against inventing facts outside verifiedFacts");
  console.log("creative-brief.test.ts: avoid list includes the fact-fabrication guardrail — PASS");
}

function testPromptFormattingIncludesEveryField() {
  const brief = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Restaurant", verifiedFacts: ["Business location (as provided by the owner): Andheri, Mumbai"] });
  const prompt = formatCreativeBriefForPrompt(brief);
  for (const field of [brief.objective, brief.contentPillar, brief.concept, brief.format]) {
    assert.ok(prompt.includes(field), `prompt text must include: ${field}`);
  }
  assert.ok(prompt.includes("Andheri, Mumbai"));
  console.log("creative-brief.test.ts: formatted prompt includes every brief field — PASS");
}

function testSelectObjectiveNeverPicksSalesWithoutARealOffer() {
  for (let i = 0; i < 10; i += 1) {
    const objective = selectObjective({ hasOffer: false, recentObjectives: [] });
    assert.notEqual(objective, "SALES", "SALES must never be selected when there is no verified offer to point it at");
  }
  console.log("creative-brief.test.ts: selectObjective never picks SALES without a real offer — PASS");
}

function testSelectObjectiveCanPickSalesWithARealOffer() {
  const candidates = new Set<string>();
  // Exhaust the rotation by feeding back what was picked -- SALES must
  // become reachable somewhere in a real offer's rotation.
  let recent: import("../content-options.ts").ContentObjective[] = [];
  for (let i = 0; i < 6; i += 1) {
    const objective = selectObjective({ hasOffer: true, recentObjectives: recent });
    candidates.add(objective);
    recent = [objective, ...recent];
  }
  assert.ok(candidates.has("SALES"), "SALES must be reachable in the rotation when a real offer exists");
  console.log("creative-brief.test.ts: selectObjective can reach SALES when a real offer exists — PASS");
}

function testPromptExplicitlyRequiresBusinessNameFactAndToneUsage() {
  // Real evidence (Premium Creative Intelligence campaign): businessSpecificity
  // and brandConsistency were the two most consistent point losses across
  // otherwise-strong real captions -- root cause traced to the copy prompt
  // never explicitly requiring the business name, a concrete fact, or a
  // brand-tone word to actually appear (brandDirection was computed but
  // never even included in the prompt at all).
  const brief = buildCreativeBrief({
    ...BASE, businessName: "Acme", industryText: "Restaurant",
    verifiedFacts: ["Business location (as provided by the owner): Andheri, Mumbai"],
    brandTone: ["warm", "unpretentious"],
  });
  const prompt = formatCreativeBriefForPrompt(brief);
  assert.ok(/naturally mention the business's actual name/i.test(prompt), "prompt must explicitly require the business name to appear");
  assert.ok(/concretely reference at least one of the verified facts/i.test(prompt), "prompt must explicitly require a concrete fact reference when facts exist");
  assert.ok(/reflect the brand tone/i.test(prompt), "prompt must explicitly require brand-tone reflection");
  assert.ok(prompt.includes(brief.brandDirection), "brand direction (tone/colors) must actually be included in the prompt, not just computed and discarded");
  assert.ok(prompt.includes("warm") && prompt.includes("unpretentious"), "the real brand tone words must be visible in the prompt text");
  console.log("creative-brief.test.ts: prompt explicitly requires business name, fact, and tone usage — PASS");
}

function testPromptIncludesOmissionPrincipleAndBansFiller() {
  // Final Production Loop brief Step 4: the strict-gate near-misses were
  // consistently generic-register copy, not incompleteness -- the fix is
  // an explicit OMISSION instruction and a named filler-phrase ban.
  const brief = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Retail" });
  const prompt = formatCreativeBriefForPrompt(brief);
  assert.ok(/omission principle/i.test(prompt), "prompt must explicitly invoke the omission principle");
  assert.ok(/elevate your experience/i.test(prompt) && /unleash your potential/i.test(prompt), "prompt must name the specific banned filler phrases");
  console.log("creative-brief.test.ts: prompt includes the omission principle and bans named filler phrases — PASS");
}

function testPromptWithNoFactsStillRequiresNameButNotFacts() {
  const brief = buildCreativeBrief({ ...BASE, businessName: "Acme", industryText: "Retail", verifiedFacts: [] });
  const prompt = formatCreativeBriefForPrompt(brief);
  assert.ok(/naturally mention the business's actual name/i.test(prompt));
  assert.ok(!/concretely reference at least one of the verified facts/i.test(prompt), "must not demand a fact reference when zero facts are available");
  console.log("creative-brief.test.ts: zero-facts brief still requires the name but not a fact reference — PASS");
}

function run() {
  testThrowsWithNoPillars();
  testSelectObjectiveNeverPicksSalesWithoutARealOffer();
  testSelectObjectiveCanPickSalesWithARealOffer();
  testRestaurantAndClinicProduceMaterialllyDifferentBriefs();
  testAllSevenReferenceIndustriesDifferFromEachOther();
  testContentPillarRotatesAwayFromRecentlyUsed();
  testConceptRotatesAwayFromRecentlyUsed();
  testVerifiedFactsFlowThroughUnmodified();
  testNoVerifiedFactsStillProducesACoherentBrief();
  testAvoidListIncludesFabricationGuardrail();
  testPromptFormattingIncludesEveryField();
  testPromptExplicitlyRequiresBusinessNameFactAndToneUsage();
  testPromptWithNoFactsStillRequiresNameButNotFacts();
  testPromptIncludesOmissionPrincipleAndBansFiller();
  console.log("creative-brief.test.ts: ALL PASS");
}

run();
