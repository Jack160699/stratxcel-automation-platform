// Run with: node --experimental-strip-types lib/social/__tests__/brand-validation-empty-taxonomy.test.ts
//
// Real bug found live during Local AI certification (2026-09-05):
// validateBrandEntities's canonicalLabel() threw unconditionally whenever a
// tenant had zero saved content_pillars/audiences/products — "Content pillar
// must match a saved Brand Brain value. Available: " (an empty list) — which
// can never match, permanently blocking create_content_item/
// create_content_variant/create_campaign for every tenant that hasn't set up
// a content taxonomy yet (the normal state right after onboarding).
// Reproduced live: the agent retried 3 times with different guesses,
// identical failure every time, then exhausted MAX_TOOL_ROUNDS.

import assert from "node:assert/strict";
import { validateBrandEntities } from "../agent/brand-validation.ts";
import type { AgentTenantContext } from "../agent-tenant-types.ts";

function fakeCtxWithProfile(contentPillars: Array<{ name: string }>): AgentTenantContext {
  return {
    ok: true,
    mode: "tenant",
    tenantId: "t1",
    actorUserId: "u1",
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "row-1",
                owner_id: "",
                identity: {},
                audiences: [],
                voice: { tone: [], blocked_phrases: [], forbidden_claims: [] },
                visual: { colors: [], priorities: [] },
                goals: [],
                competitors: [],
                source_material: [],
                products: [],
                content_pillars: contentPillars,
                rules: [],
                updated_at: "now",
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as AgentTenantContext["supabase"],
  };
}

async function testEmptyTaxonomyPassesValueThroughInsteadOfBlocking() {
  const ctx = fakeCtxWithProfile([]);
  const result = await validateBrandEntities(ctx, "create_content_item", { contentPillar: "Wedding Season Offers" });
  assert.equal(result.contentPillar, "Wedding Season Offers", "with nothing saved to validate against, the model's own value must pass through, not throw");
  console.log("brand-validation-empty-taxonomy.test.ts: zero saved content pillars no longer permanently blocks content creation — PASS");
}

async function testExistingTaxonomyStillEnforcedExactly() {
  const ctx = fakeCtxWithProfile([{ name: "Bridal Transformation Stories" }, { name: "Ayurvedic Hair Care Education" }]);
  const result = await validateBrandEntities(ctx, "create_content_item", { contentPillar: "ayurvedic hair care education" });
  assert.equal(result.contentPillar, "Ayurvedic Hair Care Education", "case-insensitive match against a REAL saved pillar still canonicalizes correctly");

  await assert.rejects(
    () => validateBrandEntities(ctx, "create_content_item", { contentPillar: "Completely Invented Pillar" }),
    /must match a saved Brand Brain value/,
    "a tenant WITH real saved pillars must still reject an invented one — this fix must not weaken real enforcement",
  );
  console.log("brand-validation-empty-taxonomy.test.ts: a tenant with real saved pillars still gets full enforcement, unchanged — PASS");
}

async function run() {
  await testEmptyTaxonomyPassesValueThroughInsteadOfBlocking();
  await testExistingTaxonomyStillEnforcedExactly();
  console.log("brand-validation-empty-taxonomy.test.ts: ALL PASS");
}

run();
