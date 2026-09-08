// Run with: node --experimental-strip-types lib/audit/__tests__/free-creatives.test.ts
//
// Final Customer Experience Repair mission, Section 2 (Three Free Branded
// Creatives). buildFreeCreativeBriefs is pure and directly testable -- real
// coverage, not source-regex. The rest (generateFreeCreatives, the route,
// the panel) reuses Creative Studio's own canonical pipeline
// (createImageGenerationJob/processImageGenerationJob/
// generateStudioCreativeTreatment) end-to-end, which already has its own
// real test coverage elsewhere -- asserted here only via source, matching
// this codebase's convention for server-only orchestration wired against a
// real external AI provider.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFreeCreativeBriefs, FREE_CREATIVES_SOURCE_ID } from "../free-creatives-briefs.ts";
import type { CanonicalBrandContext } from "@stratxcel/brand-brain";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function brand(overrides: Partial<CanonicalBrandContext> = {}): CanonicalBrandContext {
  return {
    businessName: "Patel Daily Needs",
    industry: "Retail",
    description: "A neighborhood grocery and daily essentials store.",
    websiteUrl: null,
    location: "Ahmedabad",
    phone: null,
    hours: null,
    highlights: [],
    toneOfVoice: null,
    targetAudience: null,
    colors: [],
    logoUrl: null,
    services: [],
    allServices: [],
    verifiedFacts: [],
    ...overrides,
  };
}

function run() {
  // --- 1. No business name -> no briefs at all (never generate on nothing real) ---
  assert.deepEqual(buildFreeCreativeBriefs(brand({ businessName: "" })), []);
  assert.deepEqual(buildFreeCreativeBriefs(brand({ businessName: undefined })), []);

  // --- 2. Exactly 3 distinct briefs, real business name in every one ---
  const briefs = buildFreeCreativeBriefs(brand());
  assert.equal(briefs.length, 3, "must produce exactly 3 creatives");
  assert.deepEqual(briefs.map((b) => b.key).sort(), ["business", "educational", "offer"]);
  for (const b of briefs) assert.ok(b.brief.includes("Patel Daily Needs"), `every brief must reference the real business name: ${b.key}`);

  // --- 3. Never fabricates a service/offer when none exists -------------
  const noServiceOffer = briefs.find((b) => b.key === "offer")!;
  assert.ok(/Do not invent or name any specific service/.test(noServiceOffer.brief), "with no real service, the offer brief must explicitly forbid inventing one");
  assert.equal(noServiceOffer.label, "What We Do");

  // --- 4. A real service, when present, is used verbatim (never altered) -
  const withService = buildFreeCreativeBriefs(
    brand({
      services: [
        {
          id: "s1",
          name: "Home Delivery",
          shortDescription: "Free delivery within 3km",
          active: true,
          order: 0,
          updatedAt: new Date().toISOString(),
        },
      ],
    })
  );
  const serviceOffer = withService.find((b) => b.key === "offer")!;
  assert.ok(serviceOffer.brief.includes("Home Delivery"), "must use the real service name");
  assert.ok(serviceOffer.brief.includes("Free delivery within 3km"), "must use the real service description");
  assert.equal(serviceOffer.label, "Service & Offer");

  // --- 5. Educational brief never makes a specific factual claim about the
  //     business itself (a general industry tip only) -----------------------
  const educational = briefs.find((b) => b.key === "educational")!;
  assert.ok(/general educational tip, not a business claim/.test(educational.brief));

  // --- 6. Wiring: reuses the exact same canonical pipeline Creative Studio
  //     already uses -- never a second generator --------------------------
  const orchestration = read("lib", "audit", "free-creatives.ts");
  assert.ok(/import \{ generateStudioCreativeTreatment \} from "\.\.\/social\/studio-creative-treatment\.ts"/.test(orchestration), "must reuse Creative Studio's own treatment generator, not a new one");
  assert.ok(/sourceContext: "creative_studio"/.test(orchestration), "must use Creative Studio's real sourceContext, which the free-tier monthly allowance already covers -- never a new grant/entitlement system");
  assert.equal(/social_autopilot/.test(orchestration), false, "must never route through the subscription-gated Social Autopilot manual-generation path");
  assert.ok(orchestration.includes(`"${FREE_CREATIVES_SOURCE_ID}"`) || orchestration.includes(`sourceId: FREE_CREATIVES_SOURCE_ID`), "jobs must be tagged with a stable, queryable source id");
  assert.ok(/idempotencyKey = `free_creatives:\$\{tenantId\}:\$\{item\.key\}`/.test(orchestration), "each of the 3 slots must have a stable idempotency key so a retry never burns a second real generation");

  // --- 7. Route reuses the exact same auth gate as Creative Studio's own
  //     route -- no looser security posture just because it's free --------
  const route = read("app", "api", "platform", "audit", "free-creatives", "route.ts");
  assert.ok(/requireImageGenerationContext/.test(route));

  // --- 8. Panel never fabricates a "ready" state while a job is still in
  //     flight, and only polls while genuinely generating -----------------
  const panel = read("components", "audit", "FreeCreativesPanel.tsx");
  assert.ok(/jobs\.every\(\(j\) => j\.status === "READY" \|\| j\.status === "FAILED"\)/.test(panel), "must only report ready once every real job is actually terminal");
  assert.ok(/if \(state !== "generating"\)/.test(panel), "must stop polling once generation is no longer in flight");

  console.log("free-creatives.test.ts: ALL PASS (real briefs from real Brand Brain data, never fabricated, reuses Creative Studio's canonical pipeline)");
}

run();
