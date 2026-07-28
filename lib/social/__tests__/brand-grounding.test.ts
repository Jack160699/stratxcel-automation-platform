// Tests the fix for the Brand Brain grounding bug: tool output used to be
// serialized as JSON.stringify(output).slice(0, 4000), which silently cut
// large profiles mid-object — products/pillars/rules disappeared purely
// because of their position in the JSON, not because they were absent.
//
// Run with: node --experimental-strip-types lib/social/__tests__/brand-grounding.test.ts

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serializeToolOutput } from "../agent/tool-output.ts";
import { selectBrandSection, BRAND_SECTIONS } from "../agent/brand-sections.ts";
import type { BrandProfileRow } from "../repositories/brand.ts";

function makeItems<T>(count: number, factory: (i: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => factory(i));
}

// A profile sized like the real one this bug was reported against (18
// products, 9 audiences, 9 pillars, 7 sources, 20 rules) — large enough
// that the OLD 4,000-char slice cut it well before the end.
function makeLargeProfile(): BrandProfileRow {
  return {
    id: "profile-1",
    owner_id: "owner-1",
    identity: { name: "Stratxcel", industry: "AI systems", positioning: "Operating system for growing businesses" },
    audiences: makeItems(9, (i) => ({ name: `Audience ${i}`, pain_points: `Pain point description for audience ${i}, spelled out at some length so the JSON is realistically sized.` })),
    voice: { tone: ["clear", "premium", "practical"], blocked_phrases: ["synergy", "disrupt"], forbidden_claims: ["guaranteed results"] },
    visual: { colors: [], priorities: [] },
    goals: [],
    competitors: [],
    source_material: makeItems(7, (i) => ({ kind: "note", title: `Source ${i}`, content: `Long-form knowledge source content number ${i} used to ground the Agent, repeated to be realistically sized.` })),
    products: makeItems(18, (i) => ({
      name: `Product ${i} — Social Media Autopilot / Kairela / Jan Darpan / Ascend Theory / TradePilot style name`,
      description: `Full description of product ${i}, long enough that eighteen of these clearly exceed a 4,000-character JSON budget.`,
      audience: `Audience segment for product ${i}`,
      cta: "Learn more",
      url: `https://stratxcel.in/product-${i}`,
    })),
    content_pillars: makeItems(9, (i) => ({ name: `Pillar ${i}`, description: `Description of content pillar ${i}, written at realistic length.` })),
    rules: makeItems(20, (i) => ({ kind: "forbidden_claim", text: `Rule ${i}: a realistic compliance/claims rule with enough text to add up across twenty entries.` })),
    updated_at: new Date().toISOString(),
  };
}

function run() {
  const profile = makeLargeProfile();
  const fullJsonLength = JSON.stringify(profile).length;
  assert.ok(fullJsonLength > 4000, "test fixture must actually exceed the old 4,000-char cutoff to be a meaningful test");

  // 1. Large Brand Brain is not silently cut at 4,000 chars anymore.
  const oldBehavior = JSON.stringify(profile).slice(0, 4000);
  assert.ok(!oldBehavior.trim().endsWith("}"), "sanity check: the OLD slice-based approach really did produce truncated, unparseable JSON for this fixture");

  const allSection = selectBrandSection(profile, "all");
  const serializedAll = serializeToolOutput(allSection, 40000); // must match inspectBrand.outputBudget in agent/tools.ts
  const parsedAll = JSON.parse(serializedAll); // must not throw — proves it's valid, complete JSON
  assert.equal(parsedAll.products.length, 18, "2. all 18 products (including those past the old cutoff) must be retrievable");
  assert.equal(parsedAll.content_pillars.length, 9, "3. all pillars must be retrievable");
  assert.equal(parsedAll.rules.length, 20, "4. all rules must be retrievable");
  assert.equal(parsedAll.source_material.length, 7, "5. all sources must be retrievable");

  // 6. summary contains correct, non-hardcoded section counts.
  const summary = selectBrandSection(profile, "summary") as { counts: Record<string, number>; available_sections: string[] };
  assert.deepEqual(summary.counts, { products: 18, audiences: 9, pillars: 9, sources: 7, rules: 20 });
  assert.deepEqual(summary.available_sections, ["identity", "products", "audiences", "pillars", "sources", "rules"]);

  // 7. Targeted retrieval returns the complete section, not a partial array.
  const productsSection = selectBrandSection(profile, "products") as { products: unknown[]; total: number };
  assert.equal(productsSection.products.length, 18);
  assert.equal(productsSection.total, 18);
  const rulesSection = selectBrandSection(profile, "rules") as { rules: unknown[]; forbidden_claims: string[]; total: number };
  assert.equal(rulesSection.rules.length, 20);
  assert.deepEqual(rulesSection.forbidden_claims, ["guaranteed results"]);

  // 8. Unrelated large tool outputs still get a safe limit — never unbounded, never mid-object.
  const genericLargeArray = makeItems(500, (i) => ({ id: i, note: "x".repeat(50) }));
  const genericSerialized = serializeToolOutput(genericLargeArray); // default budget, not inspect_brand's larger one
  const genericParsed = JSON.parse(genericSerialized); // must still be valid JSON
  assert.ok(genericParsed.truncated === true, "an oversized generic array must be marked truncated, not silently cut");
  assert.ok(genericParsed.returned_items < 500 && genericParsed.returned_items > 0, "must keep some complete items");
  assert.equal(genericParsed.total_items, 500);
  assert.equal(genericParsed.items.length, genericParsed.returned_items, "returned_items must match the actual items array length");

  // A small output must pass through completely unchanged (no needless truncation metadata).
  const small = { ok: true, count: 3 };
  assert.equal(serializeToolOutput(small), JSON.stringify(small));

  // 9. inspect_brand's tool definition must never be mutating.
  // (tools.ts pulls in extension-less relative imports that plain `node
  // --experimental-strip-types` can't resolve standalone, so this checks the
  // source directly rather than importing the module graph.)
  const toolsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agent", "tools.ts");
  const toolsSource = fs.readFileSync(toolsPath, "utf8");
  const inspectBrandBlock = toolsSource.slice(
    toolsSource.indexOf("const inspectBrand: AgentTool"),
    toolsSource.indexOf("const createCampaignTool")
  );
  assert.ok(inspectBrandBlock.includes('name: "inspect_brand"'), "inspect_brand tool definition must exist in tools.ts");
  assert.ok(inspectBrandBlock.includes("mutating: false"), "inspect_brand must be marked mutating: false");
  assert.ok(!inspectBrandBlock.includes("mutating: true"), "inspect_brand must never be marked mutating: true");
  assert.equal(BRAND_SECTIONS.includes("all"), true);

  console.log(
    "brand-grounding.test.ts: ALL PASS (no 4000-char cutoff, all products/pillars/rules/sources retrievable, correct summary counts, complete section retrieval, generic outputs still bounded safely)"
  );
}

run();
