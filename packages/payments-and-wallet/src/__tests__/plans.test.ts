// Run with: node --experimental-strip-types packages/payments-and-wallet/src/__tests__/plans.test.ts
import assert from "node:assert/strict";
import { PLAN_DEFINITIONS, getSelfServicePlan, getPlanDefinition, isPlanTier, SELF_SERVICE_PLAN_TIERS } from "../plans.ts";
import { splitGstInclusive } from "../../../../lib/payments/gst.ts";

function run() {
  // --- 1. Canonical locked v2 commercial prices, exactly as approved ---------
  assert.equal(PLAN_DEFINITIONS.free.priceCents, 0, "Free must be ₹0");
  assert.equal(PLAN_DEFINITIONS.starter.priceCents, 299_900, "Starter must be ₹2,999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.growth.priceCents, 799_900, "Growth must be ₹7,999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.business.priceCents, 1_599_900, "Business must be ₹15,999.00 GST-inclusive");
  assert.equal(PLAN_DEFINITIONS.scale.priceCents, null, "Scale / Custom must not have a universal fixed price");
  assert.equal(PLAN_DEFINITIONS.scale.startingAtCents, 2_999_900, "Scale / Custom must be quoted as starting at ₹29,999.00");

  // --- 2. Self-service checkout is Starter/Growth/Business only --------------
  assert.deepEqual([...SELF_SERVICE_PLAN_TIERS].sort(), ["business", "growth", "starter"], "only Starter, Growth, and Business are self-service");
  assert.equal(PLAN_DEFINITIONS.free.selfServiceCheckout, false, "Free must not be self-checkout");
  assert.equal(PLAN_DEFINITIONS.scale.selfServiceCheckout, false, "Scale / Custom must remain quote-led");
  assert.equal(getSelfServicePlan("free"), null, "getSelfServicePlan must refuse Free (not a paid self-checkout tier)");
  assert.equal(getSelfServicePlan("scale"), null, "getSelfServicePlan must refuse to hand back a checkout price for Scale / Custom");
  assert.ok(getSelfServicePlan("starter"), "Starter must be self-service");
  assert.ok(getSelfServicePlan("growth"), "Growth must be self-service");
  assert.ok(getSelfServicePlan("business"), "Business must be self-service");

  // --- 3. Legacy tiers remain DB-compat identifiers only and fail closed -----
  // `launch`/`custom_growth` predate the Notion v1 catalog. They must still be
  // recognized (existing subscription rows reference them) but must never be
  // offered as a new self-checkout purchase — matches the hardened SQL
  // function's `legacy_plan_not_payable` branch (migration
  // 20260809010000_subscription_v1_catalog_alignment.sql).
  assert.equal(isPlanTier("launch"), true, "launch must still validate as a known tier (historical rows)");
  assert.equal(isPlanTier("custom_growth"), true, "custom_growth must still validate as a known tier (historical rows)");
  assert.equal(getSelfServicePlan("launch"), null, "launch must fail closed for new self-checkout payments");
  assert.equal(getSelfServicePlan("custom_growth"), null, "custom_growth must fail closed for new self-checkout payments");
  assert.equal(PLAN_DEFINITIONS.launch.status, "legacy");
  assert.equal(PLAN_DEFINITIONS.custom_growth.status, "legacy");

  // --- 4. No revived pre-launch legacy identifiers ----------------------------
  const tiers = Object.keys(PLAN_DEFINITIONS);
  for (const legacy of ["signal", "mesh", "fleet"]) {
    assert.equal(tiers.includes(legacy), false, `legacy plan identifier '${legacy}' must not be revived`);
  }
  assert.deepEqual(tiers.sort(), ["business", "custom_growth", "free", "growth", "launch", "scale", "starter"]);

  // --- 5. isPlanTier / getPlanDefinition ---------------------------------------
  assert.equal(isPlanTier("starter"), true);
  assert.equal(isPlanTier("business"), true);
  assert.equal(isPlanTier("signal"), false);
  assert.equal(isPlanTier(undefined), false);
  assert.equal(getPlanDefinition("growth").publicName, "Growth");
  assert.equal(getPlanDefinition("business").publicName, "Business");

  // --- 6. Every fixed self-checkout plan price survives the GST-inclusive split exactly ---
  for (const tier of ["starter", "growth", "business"] as const) {
    const price = PLAN_DEFINITIONS[tier].priceCents!;
    const { taxableValueCents, gstCents, totalCents } = splitGstInclusive(price);
    assert.equal(taxableValueCents + gstCents, price, `${tier}: taxable + GST must reconstruct the exact price`);
    assert.equal(totalCents, price, `${tier}: split must never change the charged total`);
  }

  // --- 7. Fulfilment entitlement numbers match the applied v2 realignment migration ---
  // (20260822120000_v2_commercial_model_realignment.sql v_limits_starter/
  // v_limits_growth/v_limits_business arrays — [social_posts, meta_ad_campaigns,
  // whatsapp_contacts, website_maintenance, content_generation_monthly, automated_content_monthly])
  assert.deepEqual(
    [PLAN_DEFINITIONS.starter.entitlements.social_posts, PLAN_DEFINITIONS.starter.entitlements.meta_ad_campaigns, PLAN_DEFINITIONS.starter.entitlements.whatsapp_contacts, PLAN_DEFINITIONS.starter.entitlements.website_maintenance, PLAN_DEFINITIONS.starter.entitlements.content_generation_monthly, PLAN_DEFINITIONS.starter.entitlements.automated_content_monthly],
    [12, 1, 100, 0, 10, 0],
    "starter fulfilment limits must match the applied SQL migration exactly"
  );
  assert.deepEqual(
    [PLAN_DEFINITIONS.growth.entitlements.social_posts, PLAN_DEFINITIONS.growth.entitlements.meta_ad_campaigns, PLAN_DEFINITIONS.growth.entitlements.whatsapp_contacts, PLAN_DEFINITIONS.growth.entitlements.website_maintenance, PLAN_DEFINITIONS.growth.entitlements.content_generation_monthly, PLAN_DEFINITIONS.growth.entitlements.automated_content_monthly],
    [25, 1, 500, 1, 20, 10],
    "growth fulfilment limits must match the applied SQL migration exactly"
  );
  assert.deepEqual(
    [PLAN_DEFINITIONS.business.entitlements.social_posts, PLAN_DEFINITIONS.business.entitlements.meta_ad_campaigns, PLAN_DEFINITIONS.business.entitlements.whatsapp_contacts, PLAN_DEFINITIONS.business.entitlements.website_maintenance, PLAN_DEFINITIONS.business.entitlements.content_generation_monthly, PLAN_DEFINITIONS.business.entitlements.automated_content_monthly],
    [50, 3, 1500, 1, 30, 0],
    "business fulfilment limits must match the applied SQL migration exactly"
  );

  // --- 8. Plan capability flags (brief §7) -------------------------------------
  assert.equal(PLAN_DEFINITIONS.starter.capabilities.social_autopilot, false, "Starter must not include Social Autopilot");
  assert.equal(PLAN_DEFINITIONS.growth.capabilities.social_autopilot, true, "Growth must include Social Autopilot");
  assert.equal(PLAN_DEFINITIONS.business.capabilities.social_autopilot, true, "Business must include Social Autopilot");
  assert.equal(PLAN_DEFINITIONS.starter.capabilities.direct_publishing, true, "Starter must still include direct publishing");
  assert.equal(PLAN_DEFINITIONS.starter.capabilities.website_included, false, "Starter must not include a website");
  assert.equal(PLAN_DEFINITIONS.growth.capabilities.landing_page, true, "Growth must include a landing page");
  assert.equal(PLAN_DEFINITIONS.business.capabilities.website_included, true, "Business must include a professional website");
  assert.equal(PLAN_DEFINITIONS.business.capabilities.website_commitment_months, 3, "Business website requires a 3-month commitment");
  assert.equal(PLAN_DEFINITIONS.business.capabilities.whatsapp_assistant_access, true, "Business must include WhatsApp assistant access");
  assert.equal(PLAN_DEFINITIONS.starter.capabilities.whatsapp_assistant_access, false, "Starter must not include WhatsApp assistant access");
  for (const tier of ["starter", "growth", "business"] as const) {
    assert.equal(PLAN_DEFINITIONS[tier].capabilities.logo_brand_kit, true, `${tier} must include the reusable Brand Kit`);
  }

  console.log("plans.test.ts (@stratxcel/payments-and-wallet): ALL PASS");
}

run();
