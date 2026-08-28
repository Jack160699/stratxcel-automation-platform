// Brand Brain Final UX + Data + Save System — canonical retrieval layer
// tests. Run with: node --experimental-strip-types
// packages/brand-brain/src/__tests__/canonical.test.ts
import assert from "node:assert/strict";
import {
  getCanonicalServices,
  getActiveServices,
  getCanonicalBrandContext,
  buildVerifiedFacts,
  matchServiceForRequest,
  validateBrandBrainContent,
  HIGHLIGHT_MAX_LENGTH,
  HIGHLIGHTS_MAX_COUNT,
  SERVICE_NAME_MAX_LENGTH,
} from "../canonical.ts";
import type { BrandBrainContent, BrandBrainService } from "../types.ts";

function service(overrides: Partial<BrandBrainService> & { name: string }): BrandBrainService {
  return {
    id: overrides.id ?? `svc-${overrides.name}`,
    shortDescription: "",
    active: true,
    order: 0,
    updatedAt: "2026-08-28T00:00:00.000Z",
    ...overrides,
  };
}

function run() {
  // --- getCanonicalServices: canonical `services` array ---------------
  {
    const content: BrandBrainContent = {
      services: [
        service({ name: "Website Service", order: 2, active: true }),
        service({ name: "Social Autopilot", order: 0, active: true }),
        service({ name: "Archived Thing", order: 1, active: false }),
      ],
    };
    const all = getCanonicalServices(content);
    assert.equal(all.length, 3, "all three services (active and inactive) are returned");
    assert.deepEqual(all.map((s) => s.name), ["Social Autopilot", "Archived Thing", "Website Service"], "sorted by order ascending");
    const active = getActiveServices(content);
    assert.deepEqual(active.map((s) => s.name), ["Social Autopilot", "Website Service"], "getActiveServices excludes inactive/archived");
  }
  console.log("getCanonicalServices/getActiveServices: canonical services array — PASS");

  // --- getCanonicalServices: legacy `products` fallback ----------------
  {
    const content: BrandBrainContent = {
      products: [
        { name: "Kerala Seafood Thali", description: "Fresh catch, coastal spices." },
        { name: "Catering", description: "" },
      ],
    };
    const services = getCanonicalServices(content);
    assert.equal(services.length, 2, "a tenant with only legacy products still gets real services, not an empty list");
    assert.equal(services[0]!.name, "Kerala Seafood Thali");
    assert.equal(services[0]!.shortDescription, "Fresh catch, coastal spices.");
    assert.equal(services[0]!.active, true, "legacy products default to active");
  }
  console.log("getCanonicalServices: legacy products fallback — PASS");

  // --- getCanonicalServices: `services` takes priority over `products` -
  {
    const content: BrandBrainContent = {
      products: [{ name: "Old Legacy Product", description: "stale" }],
      services: [service({ name: "New Structured Service" })],
    };
    const services = getCanonicalServices(content);
    assert.equal(services.length, 1);
    assert.equal(services[0]!.name, "New Structured Service", "once a tenant has real services, the legacy products array is never consulted");
  }
  console.log("getCanonicalServices: services array takes priority over legacy products — PASS");

  // --- getCanonicalServices: malformed entries are skipped, not fatal --
  {
    const content: BrandBrainContent = {
      // @ts-expect-error deliberately malformed for the robustness test
      services: [null, {}, { name: "" }, service({ name: "Real One" }), "not an object"],
    };
    const services = getCanonicalServices(content);
    assert.deepEqual(services.map((s) => s.name), ["Real One"], "malformed/nameless entries are skipped, never thrown");
  }
  console.log("getCanonicalServices: malformed entries skipped without throwing — PASS");

  // --- getCanonicalServices: empty/missing content ----------------------
  {
    assert.deepEqual(getCanonicalServices(null), []);
    assert.deepEqual(getCanonicalServices(undefined), []);
    assert.deepEqual(getCanonicalServices({}), []);
  }
  console.log("getCanonicalServices: empty/missing content returns [] — PASS");

  // --- buildVerifiedFacts: only structured fields, never marketing copy -
  {
    const content: BrandBrainContent = {
      business_name: "IronCore Fitness",
      industry: "Fitness",
      positioning: "The best gym in town with amazing vibes and a great crowd.", // must NOT appear
      highlights: ["Free trial week", "Open 6am-10pm"], // must NOT appear
      location: "Indiranagar, Bangalore",
      business_phone: "+91 98765 43210",
      target_audience: "Working professionals",
      services: [
        service({ name: "Personal Training", shortDescription: "1-on-1 coaching.", startingPrice: "₹2,999/mo", facts: ["Certified trainers only"] }),
      ],
    };
    const facts = buildVerifiedFacts(content);
    assert.ok(facts.some((f) => f.includes("IronCore Fitness")), "business name is a verified fact");
    assert.ok(facts.some((f) => f.includes("Indiranagar")), "location is a verified fact");
    assert.ok(facts.some((f) => f.includes("Personal Training") && f.includes("1-on-1 coaching")), "active service becomes a verified fact");
    assert.ok(facts.some((f) => f.includes("₹2,999/mo")), "service starting price becomes a verified fact");
    assert.ok(facts.some((f) => f.includes("Certified trainers only")), "service-specific facts become verified facts");
    assert.ok(!facts.some((f) => f.includes("amazing vibes")), "positioning (marketing copy) must never be promoted into verified facts");
    assert.ok(!facts.some((f) => f.includes("Free trial week")), "highlights (descriptive summary) must never be promoted into verified facts");
  }
  console.log("buildVerifiedFacts: verified facts vs. descriptive marketing copy — PASS");

  // --- buildVerifiedFacts: inactive services are never verified facts --
  {
    const content: BrandBrainContent = { services: [service({ name: "Retired Offer", active: false })] };
    const facts = buildVerifiedFacts(content);
    assert.ok(!facts.some((f) => f.includes("Retired Offer")), "an archived/inactive service must never be presented as a current fact");
  }
  console.log("buildVerifiedFacts: inactive services excluded — PASS");

  // --- getCanonicalBrandContext: one full typed snapshot -----------------
  {
    const content: BrandBrainContent = {
      business_name: "Test Business",
      industry: "Retail",
      positioning: "A great local shop.",
      website_url: "https://example.com",
      services: [service({ name: "A", order: 1 }), service({ name: "B", order: 0, active: false })],
    };
    const ctx = getCanonicalBrandContext(content);
    assert.equal(ctx.businessName, "Test Business");
    assert.equal(ctx.industry, "Retail");
    assert.equal(ctx.description, "A great local shop.");
    assert.equal(ctx.websiteUrl, "https://example.com");
    assert.equal(ctx.services.length, 1, "ctx.services is active-only");
    assert.equal(ctx.allServices.length, 2, "ctx.allServices includes inactive for editing UIs");
    assert.ok(ctx.verifiedFacts.length > 0);
  }
  console.log("getCanonicalBrandContext: full typed snapshot — PASS");

  // --- getCanonicalBrandContext: fully empty content never throws -------
  {
    const ctx = getCanonicalBrandContext({});
    assert.equal(ctx.businessName, "");
    assert.equal(ctx.industry, null);
    assert.deepEqual(ctx.services, []);
    assert.deepEqual(ctx.verifiedFacts, []);
  }
  console.log("getCanonicalBrandContext: empty content degrades safely — PASS");

  // --- matchServiceForRequest: generic, per-tenant, no hardcoding --------
  {
    // StratXcel's own catalog shape (Section 11/12) — but the matcher
    // itself contains zero StratXcel-specific logic; this is just one
    // input among many.
    const stratxcelServices: BrandBrainService[] = [
      service({ name: "Social Autopilot", category: "Social Media", shortDescription: "Automatically researches, creates, validates, schedules and publishes branded social content.", facts: ["Covers Instagram and Facebook publishing"] }),
      service({ name: "Google SEO + AI SEO", category: "SEO", shortDescription: "Automatically improves Google search visibility and AI-search discoverability.", facts: ["Includes local SEO and AEO"] }),
      service({ name: "Website Service", category: "Website", shortDescription: "Creates, maintains and optimizes business websites, blogs and website content." }),
    ];
    assert.equal(matchServiceForRequest(stratxcelServices, "I want to post on Instagram")?.name, "Social Autopilot");
    assert.equal(matchServiceForRequest(stratxcelServices, "improve our Google ranking and local SEO")?.name, "Google SEO + AI SEO");
    assert.equal(matchServiceForRequest(stratxcelServices, "update our website blog page")?.name, "Website Service");
    assert.equal(matchServiceForRequest(stratxcelServices, "completely unrelated gibberish query xyz"), null, "no real overlap must return null, never a guessed default");

    // A completely different business's completely different catalog —
    // same function, zero shared vocabulary with the StratXcel case above,
    // proving there is no hardcoding of "Instagram"/"SEO"/"website" tied to
    // any specific business.
    const plumberServices: BrandBrainService[] = [
      service({ name: "Emergency Plumbing", category: "Emergency", shortDescription: "24/7 burst pipe and leak response." }),
      service({ name: "Bathroom Installation", category: "Installation", shortDescription: "Full bathroom fitting and installation." }),
    ];
    assert.equal(matchServiceForRequest(plumberServices, "my pipe burst, I need emergency help")?.name, "Emergency Plumbing");
    assert.equal(matchServiceForRequest(plumberServices, "I want a new bathroom installed")?.name, "Bathroom Installation");
  }
  console.log("matchServiceForRequest: generic per-tenant keyword matching, no hardcoding — PASS");

  // --- matchServiceForRequest: inactive services never match -----------
  {
    const services = [service({ name: "Old Service", active: false, shortDescription: "legacy offering" })];
    assert.equal(matchServiceForRequest(services, "legacy offering"), null, "an inactive service must never be matched/recommended");
  }
  console.log("matchServiceForRequest: inactive services excluded — PASS");

  // --- validateBrandBrainContent: highlights length/count --------------
  {
    const tooLong = "x".repeat(HIGHLIGHT_MAX_LENGTH + 1);
    const issues = validateBrandBrainContent({ highlights: [tooLong] });
    assert.ok(issues.some((i) => i.field === "highlights[0]"), "an over-length highlight is a real validation issue");

    const tooMany = Array.from({ length: HIGHLIGHTS_MAX_COUNT + 1 }, (_, i) => `Highlight ${i}`);
    const countIssues = validateBrandBrainContent({ highlights: tooMany });
    assert.ok(countIssues.some((i) => i.field === "highlights"), "too many highlights is a real validation issue");

    const ok = validateBrandBrainContent({ highlights: ["A short highlight."] });
    assert.equal(ok.length, 0, "a valid short highlight has zero issues");
  }
  console.log("validateBrandBrainContent: Business Highlights length/count guidance — PASS");

  // --- validateBrandBrainContent: services -------------------------------
  {
    const noName = validateBrandBrainContent({ services: [service({ name: "" })] });
    assert.ok(noName.some((i) => i.field === "services[0].name"), "a service with no name is rejected");

    const tooLongName = validateBrandBrainContent({ services: [service({ name: "x".repeat(SERVICE_NAME_MAX_LENGTH + 1) })] });
    assert.ok(tooLongName.some((i) => i.field === "services[0].name"));

    const valid = validateBrandBrainContent({ services: [service({ name: "Valid Service", shortDescription: "A concise description." })] });
    assert.equal(valid.length, 0, "a valid service has zero issues");
  }
  console.log("validateBrandBrainContent: service structural validation — PASS");

  console.log("canonical.test.ts: ALL PASS");
}

run();
