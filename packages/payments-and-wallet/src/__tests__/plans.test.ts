// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/plans.test.ts
import assert from "node:assert/strict";
import { PLAN_DEFINITIONS, getSelfServicePlan, getPlanDefinition, isPlanTier, SELF_SERVICE_PLAN_TIERS } from "../plans.ts";
import { splitGstInclusive } from "../../../../lib/payments/gst.ts";

function run() {
  // --- 1. Canonical commercial service prices (GST-inclusive) -----------------
  assert.equal(PLAN_DEFINITIONS.free.priceCents, 0, "Free must be ₹0");
  assert.equal(PLAN_DEFINITIONS.seo.priceCents, 299_900, "SEO Growth must be ₹2,999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.social.priceCents, 399_900, "Social Content must be ₹3,999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.seo_and_social.priceCents, 699_800, "SEO + Social must be ₹6,998.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.advanced_seo.priceCents, 999_900, "Advanced SEO must be ₹9,999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.advanced_social.priceCents, 849_900, "Advanced Social must be ₹8,499.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.advanced_growth.priceCents, 1_849_800, "Advanced Growth must be ₹18,498.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.website_landing_page.priceCents, 99_900, "Basic Landing Page must be ₹999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.website_standard.priceCents, 299_900, "5-6 Page Website must be ₹2,999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.website_custom.priceCents, null, "Custom Website must be quote-led");

  // --- 2. Self-service checkout ----------------------------------------------
  const activeSelfService = [...SELF_SERVICE_PLAN_TIERS].sort();
  assert.deepEqual(
    activeSelfService,
    [
      "advanced_growth",
      "advanced_seo",
      "advanced_social",
      "seo",
      "seo_and_social",
      "social",
      "website_landing_page",
      "website_standard",
    ].sort(),
    "Active commercial tiers must be self-service"
  );
  assert.equal(PLAN_DEFINITIONS.free.selfServiceCheckout, false, "Free must not be self-checkout");
  assert.equal(PLAN_DEFINITIONS.website_custom.selfServiceCheckout, false, "Custom Website must remain quote-led");
  assert.equal(getSelfServicePlan("free"), null, "getSelfServicePlan must refuse Free");
  assert.equal(getSelfServicePlan("website_custom"), null, "getSelfServicePlan must refuse Custom Website without quote");
  assert.ok(getSelfServicePlan("seo"), "SEO Growth must be self-service");
  assert.ok(getSelfServicePlan("social"), "Social Content must be self-service");
  assert.ok(getSelfServicePlan("advanced_social"), "Advanced Social must be self-service");
  assert.ok(getSelfServicePlan("advanced_growth"), "Advanced Growth must be self-service");

  // --- 3. Legacy DB compatibility tiers remain valid identifiers but fail closed for new self-service ---
  for (const legacy of ["starter", "growth", "business", "launch", "custom_growth", "scale"] as const) {
    assert.equal(isPlanTier(legacy), true, `${legacy} must still validate as a known tier (historical rows)`);
    assert.equal(getSelfServicePlan(legacy), null, `${legacy} must fail closed for new self-checkout payments`);
    assert.equal(PLAN_DEFINITIONS[legacy].status, "legacy");
  }

  // --- 4. No revived Signal / Mesh / Fleet -----------------------------------
  const tiers = Object.keys(PLAN_DEFINITIONS);
  for (const legacy of ["signal", "mesh", "fleet"]) {
    assert.equal(tiers.includes(legacy), false, `legacy plan identifier '${legacy}' must not be revived`);
  }

  // --- 5. isPlanTier / getPlanDefinition ---------------------------------------
  assert.equal(isPlanTier("seo"), true);
  assert.equal(isPlanTier("social"), true);
  assert.equal(isPlanTier("advanced_social"), true);
  assert.equal(isPlanTier("advanced_growth"), true);
  assert.equal(isPlanTier("signal"), false);
  assert.equal(isPlanTier(undefined), false);
  assert.equal(getPlanDefinition("social").publicName, "Social Content");
  assert.equal(getPlanDefinition("advanced_growth").publicName, "Advanced Growth");

  // --- 6. GST-inclusive math verification -----------------------------------
  for (const tier of ["seo", "social", "seo_and_social", "advanced_seo", "advanced_social", "advanced_growth", "website_landing_page", "website_standard"] as const) {
    const price = PLAN_DEFINITIONS[tier].priceCents!;
    const { taxableValueCents, gstCents, totalCents } = splitGstInclusive(price);
    assert.equal(taxableValueCents + gstCents, price, `${tier}: taxable + GST must reconstruct the exact price`);
    assert.equal(totalCents, price, `${tier}: split must never change the charged total`);
  }

  // --- 7. Entitlement Limits (28 posts/mo for social, 100 images for advanced) ---
  assert.equal(PLAN_DEFINITIONS.social.entitlements.social_posts, 28, "Social Content must include 28 posts/mo");
  assert.equal(PLAN_DEFINITIONS.advanced_social.entitlements.social_posts, 28, "Advanced Social must include 28 posts/mo");
  assert.equal(PLAN_DEFINITIONS.advanced_growth.entitlements.social_posts, 28, "Advanced Growth must include 28 posts/mo");
  assert.equal(PLAN_DEFINITIONS.free.entitlements.image_generation_attempts_monthly, 3, "Free trial must include 3 image attempts/mo");
  assert.equal(PLAN_DEFINITIONS.advanced_social.entitlements.image_generation_attempts_monthly, 100, "Advanced Social must include 100 image attempts/mo");
  assert.equal(PLAN_DEFINITIONS.advanced_growth.entitlements.image_generation_attempts_monthly, 100, "Advanced Growth must include 100 image attempts/mo");

  // --- 8. Plan capability flags (WhatsApp Autopilot strictly for Advanced Growth) ---
  assert.equal(PLAN_DEFINITIONS.advanced_growth.capabilities.whatsapp_assistant_access, true, "Advanced Growth must include WhatsApp assistant access");
  assert.equal(PLAN_DEFINITIONS.seo.capabilities.whatsapp_assistant_access, false, "SEO Growth must not include WhatsApp");
  assert.equal(PLAN_DEFINITIONS.social.capabilities.whatsapp_assistant_access, false, "Social Content must not include WhatsApp");
  assert.equal(PLAN_DEFINITIONS.advanced_seo.capabilities.whatsapp_assistant_access, false, "Advanced SEO must not include WhatsApp");
  assert.equal(PLAN_DEFINITIONS.advanced_social.capabilities.whatsapp_assistant_access, false, "Advanced Social must not include WhatsApp");
  assert.equal(PLAN_DEFINITIONS.free.capabilities.whatsapp_assistant_access, false, "Free must not include WhatsApp");

  // Unlock Autopilot For All Plans mission: Social Autopilot is now the
  // platform's core feature, available on every plan tier -- no longer
  // gated to Advanced Social/Advanced Growth. Verified across every real
  // PlanTier, current and legacy, so no tier can silently regress back to
  // gated.
  for (const tier of Object.keys(PLAN_DEFINITIONS) as (keyof typeof PLAN_DEFINITIONS)[]) {
    assert.equal(PLAN_DEFINITIONS[tier].capabilities.social_autopilot, true, `${tier} must include Social Autopilot -- it is now available on every plan`);
  }

  // Landing Page bonus strictly on Advanced Growth
  assert.equal(PLAN_DEFINITIONS.advanced_growth.capabilities.landing_page_bonus, true, "Advanced Growth must include landing page bonus");
  assert.equal(PLAN_DEFINITIONS.social.capabilities.landing_page_bonus, false, "Social Content must not include landing page bonus");

  console.log("plans.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
