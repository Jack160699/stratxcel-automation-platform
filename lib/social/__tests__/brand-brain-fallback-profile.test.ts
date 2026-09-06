// Run with: node --experimental-strip-types lib/social/__tests__/brand-brain-fallback-profile.test.ts
//
// Real bug found live during Local AI certification (2026-09-05): the
// standard customer onboarding wizard writes everything into
// brand_brains/brand_brain_versions, never social_brand_profiles.
// getBrandProfile() (used by inspect_brand, the Social Copilot's grounding
// tool) only ever read social_brand_profiles — reproduced live: a
// freshly-onboarded real tenant's Social Copilot called inspect_brand 8
// times in a row, got all-zero counts every time despite real onboarding
// data existing, and the turn failed with "empty turn output" (MAX_TOOL_ROUNDS
// exhausted with no text). This tests the fix: getBrandProfile() now falls
// back to mapping brand_brains content when no social_brand_profiles row exists.

import assert from "node:assert/strict";
import { getBrandProfile } from "../repositories/brand.ts";
import type { AgentTenantContext } from "../agent-tenant-types.ts";

function fakeTenantSupabase(opts: {
  socialBrandProfileRow: unknown;
  brainRow: { current_version: number; updated_at: string } | null;
  versionContent: Record<string, unknown> | null;
}): AgentTenantContext["supabase"] {
  return {
    from(table: string) {
      if (table === "social_brand_profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.socialBrandProfileRow, error: null }) }) }) };
      }
      if (table === "brand_brains") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.brainRow, error: null }) }) }) };
      }
      if (table === "brand_brain_versions") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.versionContent ? { content: opts.versionContent } : null, error: null }) }) }),
          }),
        };
      }
      throw new Error(`fakeTenantSupabase: unexpected table ${table}`);
    },
  } as unknown as AgentTenantContext["supabase"];
}

async function testFallsBackToBrandBrainWhenNoSocialBrandProfileRow() {
  const ctx: AgentTenantContext = {
    ok: true,
    mode: "tenant",
    tenantId: "tenant-fallback-test",
    actorUserId: "user-1",
    supabase: fakeTenantSupabase({
      socialBrandProfileRow: null,
      brainRow: { current_version: 1, updated_at: "2026-09-05T17:46:46Z" },
      versionContent: {
        business_name: "Ananya's Hair & Beauty Studio",
        industry: "Salon & Beauty Services",
        description: "We are the only salon in Jaipur using Kerala Ayurvedic hair oils.",
        business_model: "B2C",
        target_audience: "Brides-to-be and working women aged 22-40 in Jaipur.",
        products: [{ name: "The Rajasthani Bridal Glow Package", description: "" }],
        goals: ["social_presence", "website_conversion"],
        rules: ["permanent hair straightening, instant hair regrowth, guaranteed results"],
      },
    }),
  };

  const profile = await getBrandProfile(ctx);
  assert.equal(profile.identity.name, "Ananya's Hair & Beauty Studio");
  assert.equal(profile.identity.industry, "Salon & Beauty Services");
  assert.equal(profile.products.length, 1);
  assert.equal(profile.products[0]!.name, "The Rajasthani Bridal Glow Package");
  assert.equal(profile.audiences.length, 1, "target_audience free text becomes one synthetic audience entry");
  assert.ok(profile.audiences[0]!.description!.includes("Brides-to-be"));
  assert.equal(profile.rules.length, 1);
  assert.ok(profile.rules[0]!.text.includes("guaranteed results"));
  // The one thing this fallback deliberately does NOT fabricate:
  assert.deepEqual(profile.content_pillars, [], "no structured pillar data exists at onboarding time — never invented");
  console.log("brand-brain-fallback-profile.test.ts: getBrandProfile() falls back to real brand_brains content instead of an all-empty profile — PASS");
}

async function testPrefersSocialBrandProfileRowWhenItExists() {
  const realRow = { id: "row-1", owner_id: "", identity: { name: "Real Row Business" }, audiences: [], voice: { tone: [], blocked_phrases: [], forbidden_claims: [] }, visual: { colors: [], priorities: [] }, goals: [], competitors: [], source_material: [], products: [], content_pillars: [{ name: "Pillar A" }], rules: [], updated_at: "now" };
  const ctx: AgentTenantContext = {
    ok: true,
    mode: "tenant",
    tenantId: "tenant-with-real-row",
    actorUserId: "user-1",
    supabase: fakeTenantSupabase({
      socialBrandProfileRow: realRow,
      brainRow: { current_version: 1, updated_at: "2026-09-05T00:00:00Z" },
      versionContent: { business_name: "Should never be used" },
    }),
  };
  const profile = await getBrandProfile(ctx);
  assert.equal(profile.identity.name, "Real Row Business", "an existing social_brand_profiles row must always win over the fallback");
  console.log("brand-brain-fallback-profile.test.ts: an existing social_brand_profiles row is never shadowed by the fallback — PASS");
}

async function testDegradesToEmptyDefaultWhenNeitherExists() {
  const ctx: AgentTenantContext = {
    ok: true,
    mode: "tenant",
    tenantId: "tenant-nothing-configured",
    actorUserId: "user-1",
    supabase: fakeTenantSupabase({ socialBrandProfileRow: null, brainRow: null, versionContent: null }),
  };
  const profile = await getBrandProfile(ctx);
  assert.deepEqual(profile.products, []);
  assert.deepEqual(profile.audiences, []);
  console.log("brand-brain-fallback-profile.test.ts: no social_brand_profiles row AND no brand_brains -> safe empty default, no crash — PASS");
}

async function run() {
  await testFallsBackToBrandBrainWhenNoSocialBrandProfileRow();
  await testPrefersSocialBrandProfileRowWhenItExists();
  await testDegradesToEmptyDefaultWhenNeitherExists();
  console.log("brand-brain-fallback-profile.test.ts: ALL PASS");
}

run();
