// Run with: node --experimental-strip-types lib/social/__tests__/social-autopilot-context.test.ts
//
// STRATXCEL zero-gap closure brief Section 5: the literal canonical
// SocialAutopilotContext. buildSocialAutopilotContext is a pure function
// (no I/O), so it's tested directly with real, representative input
// shapes -- no fake Supabase client or mocked network needed.
import assert from "node:assert/strict";
import { buildSocialAutopilotContext } from "../social-autopilot-context.ts";
import type { BrandProfileRow } from "../repositories/brand.ts";

const REAL_STRATXCEL_BRAND_PROFILE: BrandProfileRow = {
  id: "bp1",
  owner_id: "9381030b-b14a-4551-a6e9-b5918f017e1b",
  identity: { name: "Stratxcel", industry: "generic", positioning: "AI-powered marketing automation for local businesses", business_model: "B2B SaaS subscription", description: "Autonomous marketing engine for founders without an in-house marketing team" },
  audiences: [{ name: "Local business owners", description: "Founders and small teams across India", pain_points: "No time for consistent marketing; no in-house marketing team" }],
  voice: { tone: ["direct", "confident", "founder-to-founder"], blocked_phrases: [], forbidden_claims: [] },
  visual: { colors: ["#1a56db", "#0b1120"], priorities: ["clarity", "trust"] },
  goals: [],
  competitors: [],
  source_material: [],
  products: [{ name: "Social Autopilot", description: "Automated social content generation and publishing" }],
  content_pillars: [{ name: "AI Automation in Real Business" }],
  rules: [{ kind: "never", text: "Never claim a specific ROI percentage without a verified case study" }],
  updated_at: "2026-08-30T00:00:00Z",
};

function run() {
  // --- Real data maps to the real canonical shape correctly ------------
  const ctx = buildSocialAutopilotContext({
    tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
    ownerId: "9381030b-b14a-4551-a6e9-b5918f017e1b",
    subscriptionId: "0b2fe0ef-91b8-4417-bf95-664d56d36a0c",
    brandProfile: REAL_STRATXCEL_BRAND_PROFILE,
    brandBrainContent: { location: "Bhilai, Chhattisgarh, India", logo_url: "https://example.com/logo.png", logo_variants: { square: "https://example.com/logo-square.png" } } as never,
    verifiedFacts: ["Business location (as provided by the owner): Bhilai, Chhattisgarh, India"],
    research: { available: true, summary: "Real competitor summary", claims: [], sources: [], provider: "google", reason: null, gatheredAt: "2026-08-30T00:00:00Z" },
    campaignHistory: [{ week_key: "2026-08-24", status: "ACTIVE", created_at: "2026-08-30T00:00:00Z" }],
    weekStart: "2026-08-24",
    weekEnd: "2026-08-30",
    subscriptionEntitlements: null,
    auditEntitlements: { allowed: 5, used: 0, remaining: 5 },
  });

  assert.equal(ctx.tenantId, "466e6195-a9f6-4576-8271-29fdae61c18a");
  assert.equal(ctx.businessIdentity.name, "Stratxcel");
  assert.equal(ctx.businessIdentity.industry, "generic");
  assert.equal(ctx.businessLocations.length, 1);
  assert.equal(ctx.businessLocations[0], "Bhilai, Chhattisgarh, India");
  assert.equal(ctx.logo, "https://example.com/logo.png");
  assert.deepEqual(ctx.brandColors, ["#1a56db", "#0b1120"]);
  assert.equal(ctx.targetAudience.length, 1);
  assert.equal(ctx.targetAudience[0]!.name, "Local business owners");
  assert.equal(ctx.customerPsychology.length, 1, "real psychology must be derived from the real audience pain_points, not left empty when real data exists");
  assert.ok(ctx.customerPsychology[0]!.painPoints.length > 0);
  assert.equal(ctx.research?.available, true);
  assert.equal(ctx.campaignHistory.length, 1);
  assert.equal(ctx.campaignHistory[0]!.weekKey, "2026-08-24");
  assert.equal(ctx.auditEntitlements?.remaining, 5);
  console.log("social-autopilot-context.test.ts: real data maps correctly into every real canonical field — PASS");

  // --- Fields with no real, populated source anywhere in this codebase
  //     today are honestly null/empty, never fabricated -------------
  assert.equal(ctx.subNiche, null);
  assert.equal(ctx.brandPersonality, null);
  // STRATXCEL two-gap closure brief: real analytics ingestion now exists
  // (lib/social/analytics-ingestion.ts + performance-analysis.ts) -- this
  // particular call just didn't pass a performanceHistory input, so it
  // must default to an honest empty array (this codebase's established
  // "never fabricate a fallback" rule), not silently invent one.
  assert.deepEqual(ctx.performanceHistory, [], "with no performanceHistory input, the result must be an honest empty array, never a fabricated metric");
  console.log("social-autopilot-context.test.ts: fields with no real data source are honestly null/empty, never fabricated — PASS");

  // --- A real, already-computed performance snapshot genuinely flows
  //     through when the caller has one ---------------------------------
  const ctxWithPerformance = buildSocialAutopilotContext({
    tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
    ownerId: "9381030b-b14a-4551-a6e9-b5918f017e1b",
    subscriptionId: null,
    brandProfile: REAL_STRATXCEL_BRAND_PROFILE,
    brandBrainContent: null,
    verifiedFacts: [],
    research: null,
    campaignHistory: [],
    performanceHistory: [
      {
        tenantId: "466e6195-a9f6-4576-8271-29fdae61c18a",
        weekStart: "2026-08-17",
        weekEnd: "2026-08-23",
        postsAnalyzed: 4,
        postsWithRealMetrics: 4,
        topPerformingTopics: [{ key: "educational", avgEngagementScore: 0.2, sampleSize: 2 }],
        weakTopics: [],
        topFormats: [],
        weakFormats: [],
        strongestCtas: [],
        weakestCtas: [],
        engagementPatterns: [],
        contentFatigue: { repeatedPillars: [], repeatedFormats: [], repeatedObjectives: [] },
        strategicRecommendations: ["Increase educational content."],
        confidence: "MEDIUM",
        dataSource: "REAL_ANALYTICS",
      },
    ],
    weekStart: null,
    weekEnd: null,
    subscriptionEntitlements: null,
    auditEntitlements: null,
  });
  assert.equal(ctxWithPerformance.performanceHistory.length, 1);
  assert.equal(ctxWithPerformance.performanceHistory[0]!.dataSource, "REAL_ANALYTICS");
  assert.equal(ctxWithPerformance.performanceHistory[0]!.strategicRecommendations[0], "Increase educational content.");
  console.log("social-autopilot-context.test.ts: a real, already-computed performance snapshot genuinely flows through the canonical context — PASS");

  // --- Missing/null inputs never throw, never fabricate a fallback -----
  const empty = buildSocialAutopilotContext({
    tenantId: "t1",
    ownerId: null,
    subscriptionId: null,
    brandProfile: null,
    brandBrainContent: null,
    verifiedFacts: [],
    research: null,
    campaignHistory: [],
    weekStart: null,
    weekEnd: null,
    subscriptionEntitlements: null,
    auditEntitlements: null,
  });
  assert.equal(empty.businessIdentity.name, null);
  assert.deepEqual(empty.businessLocations, []);
  assert.deepEqual(empty.targetAudience, []);
  assert.deepEqual(empty.customerPsychology, []);
  assert.equal(empty.logo, null);
  console.log("social-autopilot-context.test.ts: a tenant with no real brand data yet produces an honest empty context, never a crash or a fabricated default — PASS");

  console.log("social-autopilot-context.test.ts: ALL PASS");
}

run();
